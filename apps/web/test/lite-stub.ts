// A local stand-in for the lite demo API contract (/api/lite/demo/*), for browser checks only. It is NOT the real
// server: that is the route handlers under app/api/lite. It sits in front of `next dev` on one port so the
// ac_demo cookie is first-party, answers /api/lite/*, and forwards everything else (including HMR sockets).
//   node test/lite-stub.ts   (LITE_STUB_PORT=3322 LITE_NEXT_PORT=3323)
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';

const PORT = Number(process.env.LITE_STUB_PORT ?? 3322);
const NEXT = Number(process.env.LITE_NEXT_PORT ?? 3323);

interface Req {
  id: string;
  name: string;
  company: string;
  email: string;
  verified: boolean;
  linkToken: string;
  expiresAt: number;
}
const tokens = new Set<string>();
const requests = new Map<string, Req>();
const byLink = new Map<string, Req>();
let posts = 0;

const AGENTS = [
  [
    'Maya Chen',
    'Lead Qualifier',
    'working',
    'Scoring 6 new sample enquiries',
    'Reads new enquiries and ranks them by fit.',
  ],
  [
    'Theo Brandt',
    'Follow-up Writer',
    'needs-you',
    'Draft reply waiting for your approval',
    'Drafts replies; a person approves before anything would leave.',
  ],
  [
    'Priya Nair',
    'Appointment Setter',
    'working',
    'Proposing two times for a viewing',
    'Finds times that suit both sides.',
  ],
  ['Leo Okafor', 'Pipeline Analyst', 'idle', null, 'Summarises the pipeline each morning.'],
  [
    'Sofia Rossi',
    'Social Content',
    'working',
    'Preparing this week’s posts',
    'Plans and drafts social posts for review.',
  ],
] as const;

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, code: string, message: string) =>
  json(res, status, { error: { code, message } });

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function cookieId(req: IncomingMessage): string | null {
  return /(?:^|; )ac_demo=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;
}

async function createRequest(req: IncomingMessage, res: ServerResponse) {
  const b = await readBody(req);
  posts += 1;
  if (posts > 12) return fail(res, 429, 'rate_limited', 'Too many requests.');
  if (typeof b.formToken !== 'string' || !tokens.delete(b.formToken))
    return fail(res, 400, 'bad_request', 'Bad form token.');
  if (b.website2) return fail(res, 400, 'bad_request', 'Rejected.');
  if (!b.name || !b.email || !b.company)
    return fail(res, 400, 'validation_failed', 'Name, email and company are required.');
  if (b.company === 'Unavailable Co') return fail(res, 503, 'demo_unavailable', 'Demos are paused.');
  const r: Req = {
    id: randomUUID(),
    name: String(b.name),
    company: String(b.company),
    email: String(b.email),
    verified: false,
    linkToken: randomUUID(),
    expiresAt: Date.now() + 14 * 86_400_000,
  };
  requests.set(r.id, r);
  byLink.set(r.linkToken, r);
  console.log(`LINK ${r.id} http://127.0.0.1:${PORT}/api/lite/demo/verify?t=${r.linkToken}`);
  json(res, 200, { requestId: r.id, status: 'verification-sent' });
}

function verify(url: URL, res: ServerResponse) {
  const r = byLink.get(url.searchParams.get('t') ?? '');
  if (!r || r.verified) {
    res.writeHead(303, { Location: '/demo/verified?error=expired' }).end();
    return;
  }
  r.verified = true;
  res
    .writeHead(303, { Location: '/demo/welcome', 'Set-Cookie': `ac_demo=${r.id}; Path=/; HttpOnly; SameSite=Lax` })
    .end();
}

function me(req: IncomingMessage, res: ServerResponse) {
  const r = requests.get(cookieId(req) ?? '');
  if (!r?.verified) return fail(res, 401, 'unauthorized', 'Not signed in.');
  if (r.company === 'Expired Co' || r.expiresAt < Date.now()) return fail(res, 410, 'gone', 'Expired.');
  json(res, 200, {
    firstName: r.name.split(' ')[0],
    company: r.company,
    building: { key: 'rental-2', name: 'Rental Building 2' },
    office: { level: 1, name: `${r.company} demo office` },
    expiresAt: new Date(r.expiresAt).toISOString(),
  });
}

function office(req: IncomingMessage, res: ServerResponse) {
  const r = requests.get(cookieId(req) ?? '');
  if (!r?.verified) return fail(res, 401, 'unauthorized', 'Not signed in.');
  const agents = AGENTS.map(([name, role, status, currentTask, summary], i) => ({
    id: `agent-${i + 1}`,
    name,
    role,
    status,
    currentTask,
    summary,
    updatedAt: new Date().toISOString(),
  }));
  const tasks = agents
    .slice(0, 3)
    .map((a, i) => ({ id: `t${i}`, title: `Sample task ${i + 1}`, agentId: a.id, status: 'in progress' }));
  json(res, 200, { agents, tasks, daySummary: 'Sample day: 6 enquiries sorted, 2 replies drafted.', simulated: true });
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const p = url.pathname;
  if (p === '/api/lite/demo/form-token') {
    const t = randomUUID();
    tokens.add(t);
    return json(res, 200, { token: t });
  }
  if (p === '/api/lite/demo' && req.method === 'POST') return createRequest(req, res);
  if (p === '/api/lite/demo/status') {
    const r = requests.get(url.searchParams.get('request') ?? '');
    return r
      ? json(res, 200, { status: r.verified ? 'ready' : 'verification-sent' })
      : fail(res, 400, 'bad_request', 'Unknown request.');
  }
  if (p === '/api/lite/demo/verify') return verify(url, res);
  if (p === '/api/lite/demo/me') return me(req, res);
  if (p === '/api/lite/demo/office') return office(req, res);
  if (p === '/api/lite/demo/signout')
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'ac_demo=; Path=/; Max-Age=0' });
  fail(res, 404, 'bad_request', 'Not found.');
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith('/api/lite/')) return void api(req, res, url);
  const up = httpRequest(
    { host: '127.0.0.1', port: NEXT, path: req.url, method: req.method, headers: req.headers },
    r => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on('error', () => res.writeHead(502).end('next dev is not up'));
  req.pipe(up);
});
server.on('upgrade', (req, socket, head) => {
  const up = connect(NEXT, '127.0.0.1', () => {
    up.write(
      `${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n')}\r\n\r\n`,
    );
    up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});
server.listen(PORT, '127.0.0.1', () => console.log(`lite stub on ${PORT} -> next ${NEXT}`));
