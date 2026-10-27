// A tiny stand-in for the API, used only by the browser smoke test (test/browser.smoke.ts). It verifies every device
// proof the way DESIGN.md describes (signature, htm, htu, iat, unique jti, same key as the session) and records each
// request so the test can assert what the web app sent. It also speaks just enough Engine.IO v4 long-polling
// (Socket.IO's HTTP transport) to accept a handshake and push a `revoked` event.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { base64urlDecode, jwkThumbprint, type PublicEcJwk } from '../lib/device-proof.ts';

export interface Recorded {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  origin: string | null;
  cookie: string | null;
  proof:
    | { ok: true; jkt: string; header: Record<string, unknown>; claims: Record<string, unknown> }
    | { ok: false; why: string };
}

interface PollSession {
  queue: string[];
  waiting: ServerResponse | null;
  connected: boolean;
}

const decoder = new TextDecoder();

export async function verifyProof(
  jws: string | undefined,
  expect: { htm: string; htu: string },
  seenJti: Set<string>,
): Promise<Recorded['proof']> {
  if (!jws) return { ok: false, why: 'missing' };
  const parts = jws.split('.');
  if (parts.length !== 3) return { ok: false, why: 'not a compact JWS' };
  const [h, p, s] = parts as [string, string, string];
  const header = JSON.parse(decoder.decode(base64urlDecode(h)));
  const claims = JSON.parse(decoder.decode(base64urlDecode(p)));
  if (header.typ !== 'device-proof+jwt' || header.alg !== 'ES256') return { ok: false, why: 'bad header' };
  const key = await crypto.subtle.importKey('jwk', header.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'verify',
  ]);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) return { ok: false, why: 'bad signature' };
  if (claims.htm !== expect.htm) return { ok: false, why: `htm ${claims.htm} != ${expect.htm}` };
  if (claims.htu !== expect.htu) return { ok: false, why: `htu ${claims.htu} != ${expect.htu}` };
  if (Math.abs(Date.now() / 1000 - claims.iat) > 60) return { ok: false, why: 'iat skew' };
  if (seenJti.has(claims.jti)) return { ok: false, why: 'jti replayed' };
  seenJti.add(claims.jti);
  return { ok: true, jkt: await jwkThumbprint(header.jwk as PublicEcJwk), header, claims };
}

export interface MockApi {
  server: Server;
  url: string;
  requests: Recorded[];
  /** Responses the test can change: e.g. whether DELETE device demands step-up. */
  state: { deviceNeedsStepUp: boolean; sessionCookie: string };
  /** Push the realtime `revoked` event to every connected socket. */
  revokeSockets(): void;
  socketHandshakes: Recorded[];
  close(): Promise<void>;
}

export async function startMockApi(port: number, webOrigin: string): Promise<MockApi> {
  const requests: Recorded[] = [];
  const socketHandshakes: Recorded[] = [];
  const seenJti = new Set<string>();
  const polls = new Map<string, PollSession>();
  const state = { deviceNeedsStepUp: true, sessionCookie: 'ac_session=mock-session' };
  const url = `http://127.0.0.1:${port}`;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>(resolve => {
      let data = '';
      req.on('data', c => (data += c));
      req.on('end', () => resolve(data));
    });

  const flush = (s: PollSession) => {
    if (!s.waiting || s.queue.length === 0) return;
    s.waiting.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8', ...cors() });
    s.waiting.end(s.queue.splice(0).join('\x1e'));
    s.waiting = null;
  };
  const cors = () => ({ 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' });

  async function socketIo(req: IncomingMessage, res: ServerResponse, query: URLSearchParams) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors(),
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET, POST',
      });
      return res.end();
    }
    const sid = query.get('sid');
    if (!sid) {
      const id = Math.random().toString(36).slice(2);
      polls.set(id, { queue: [], waiting: null, connected: false });
      res.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8', ...cors() });
      return res.end(
        `0${JSON.stringify({ sid: id, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1e6 })}`,
      );
    }
    const s = polls.get(sid);
    if (!s) return json(res, 400, { code: 1, message: 'Session ID unknown' });
    if (req.method === 'GET') {
      s.waiting = res;
      req.on('close', () => s.waiting === res && (s.waiting = null));
      setTimeout(() => {
        if (s.waiting === res) {
          s.queue.push('6');
          flush(s);
        }
      }, 15000);
      return flush(s);
    }
    // POST: packets from the client, separated by \x1e.
    for (const packet of (await readBody(req)).split('\x1e')) {
      if (packet.startsWith('40')) {
        const auth = packet.length > 2 ? JSON.parse(packet.slice(2)) : {};
        const proof = await verifyProof(auth.proof, { htm: 'GET', htu: `${webOrigin}/socket.io` }, seenJti);
        const rec: Recorded = {
          method: 'SOCKET',
          path: '/socket.io',
          body: auth,
          origin: req.headers.origin ?? null,
          cookie: req.headers.cookie ?? null,
          proof,
        };
        socketHandshakes.push(rec);
        const signedIn = proof.ok && (rec.cookie ?? '').includes(state.sessionCookie);
        if (signedIn) s.connected = true;
        s.queue.push(signedIn ? `40${JSON.stringify({ sid: `sock-${sid}` })}` : '44{"message":"unauthorized"}');
      }
    }
    res.writeHead(200, { 'content-type': 'text/html', ...cors() });
    res.end('ok');
    flush(s);
  }

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', url);
    if (u.pathname.startsWith('/socket.io')) return socketIo(req, res, u.searchParams);
    if (u.pathname === '/idp/authorize') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><title>Mock identity provider</title><h1>Mock identity provider</h1>');
    }

    const raw = await readBody(req);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const proof = await verifyProof(
      req.headers['x-device-proof'] as string | undefined,
      { htm: req.method ?? '', htu: `${webOrigin}${u.pathname}` },
      seenJti,
    );
    const rec: Recorded = {
      method: req.method ?? '',
      path: u.pathname + u.search,
      body,
      origin: req.headers.origin ?? null,
      cookie: req.headers.cookie ?? null,
      proof,
    };
    requests.push(rec);
    if (!proof.ok) return json(res, 401, { error: 'device_proof_required' });

    const route = `${req.method} ${u.pathname}`;
    if (route === 'POST /api/auth/login/start') {
      const jwk = body?.deviceJwk as PublicEcJwk | undefined;
      if (!jwk || (await jwkThumbprint(jwk)) !== proof.jkt) return json(res, 400, { error: 'proof_key_mismatch' });
      return json(res, 200, { authorizeUrl: `${url}/idp/authorize?state=s-${requests.length}` });
    }

    if (!(rec.cookie ?? '').includes(state.sessionCookie)) return json(res, 401, { error: 'not_signed_in' });
    const sessions = {
      sessions: [
        {
          id: 'sess-current',
          deviceId: proof.jkt,
          deviceLabel: 'Chromium on Linux',
          createdAt: '2026-10-27T09:00:00Z',
          lastSeenAt: '2026-10-27T10:00:00Z',
          current: true,
        },
        {
          id: 'sess-laptop',
          deviceId: 'dev-laptop',
          deviceLabel: 'Firefox on Windows',
          createdAt: '2026-10-20T09:00:00Z',
          lastSeenAt: '2026-10-26T18:00:00Z',
          current: false,
        },
      ],
      devices: [
        {
          id: proof.jkt,
          label: 'Chromium on Linux',
          createdAt: '2026-10-01T09:00:00Z',
          lastSeenAt: '2026-10-27T10:00:00Z',
          current: true,
        },
        {
          id: 'dev-laptop',
          label: 'Firefox on Windows',
          createdAt: '2026-09-01T09:00:00Z',
          lastSeenAt: '2026-10-26T18:00:00Z',
          current: false,
        },
      ],
    };
    switch (route) {
      case 'GET /api/auth/me':
        return json(res, 200, {
          subject: 'kc:test-person',
          email: 'ada@example.test',
          emailVerified: true,
          amr: ['email-code'],
          acr: '1',
          authTime: '2026-10-27T09:00:00Z',
          stepUpAt: null,
          device: { id: proof.jkt, label: 'Chromium on Linux' },
          tenantId: 't-north',
          workspaceId: null,
        });
      case 'GET /api/auth/sessions':
        return json(res, 200, sessions);
      case 'GET /api/access/memberships':
        return json(res, 200, {
          memberships: [
            { tenantId: 't-north', tenantName: 'North Realty', role: 'client-admin' },
            { tenantId: 't-south', tenantName: 'South Homes', role: 'agency-staff' },
          ],
        });
      case 'POST /api/session/tenant':
        return json(res, 200, { tenantId: body?.tenantId, workspaceId: null });
      case 'POST /api/invitations/accept':
        if (body?.token === 'expired-token') return json(res, 410, { error: 'invitation_expired' });
        if (body?.token === 'wrong-email-token') return json(res, 403, { error: 'invitation_email_mismatch' });
        return json(res, 200, { tenantId: 't-east', tenantName: 'East Lettings', role: 'client-viewer' });
      case 'POST /api/auth/logout':
        return json(res, 200, { endSessionUrl: `${url}/idp/authorize?logout=1` });
    }
    if (req.method === 'DELETE' && u.pathname.startsWith('/api/auth/sessions/'))
      return json(res, 200, { revoked: true });
    if (req.method === 'DELETE' && u.pathname.startsWith('/api/auth/devices/')) {
      if (state.deviceNeedsStepUp) return json(res, 403, { error: 'step_up_required', reason: 'credential' });
      return json(res, 200, { revoked: true });
    }
    return json(res, 404, { error: 'not_found' });
  });

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    server,
    url,
    requests,
    state,
    socketHandshakes,
    revokeSockets() {
      for (const s of polls.values()) {
        if (!s.connected) continue;
        s.queue.push('42["revoked"]');
        flush(s);
      }
    },
    close: () =>
      new Promise(resolve => {
        for (const s of polls.values()) s.waiting?.end();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
