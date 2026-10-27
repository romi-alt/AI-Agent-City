// Mock of the demo-funnel API (PLAN.md "API contract (demo module)") for test/d-demo.smoke.ts. It answers the
// /api/demo/* and /api/admin/leads* routes itself, verifying device proofs the same way test/mock-api.ts does, and
// forwards everything else (sign-in start, /api/auth/me, memberships, Socket.IO) to an instance of that existing mock,
// so the M03 behaviour stays exactly as the M03 tests expect.
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { startMockApi, verifyProof, type MockApi, type Recorded } from './mock-api.ts';

export type ClaimMode = 'ok' | 'already' | 'not-verified' | 'no-demo' | 'expired';

export interface DemoMockState {
  /** Delay before answering POST /api/demo/requests, so a double submit would overlap. */
  requestDelayMs: number;
  /** The next POST /api/demo/requests answers 500 once. */
  failNextRequest: boolean;
  claim: ClaimMode;
  leadsNeedStepUp: boolean;
  csvNeedsStepUp: boolean;
}

export interface DemoMockApi {
  url: string;
  base: MockApi;
  requests: Recorded[];
  /** Times (ms) at which GET /api/demo/requests/:id was called, per id. */
  polls: Map<string, number[]>;
  state: DemoMockState;
  close(): Promise<void>;
}

export const SAMPLE_WORKSPACE = {
  firstName: 'Ada',
  company: 'Analytical Homes',
  industry: 'real-estate',
  building: { key: 'rental-2', name: 'Rental Building 2' },
  office: { level: 7, name: 'Suite 7A' },
  expiresAt: '2026-11-10T12:00:00Z',
  simulated: true,
  agents: [
    {
      id: 'ag-iris',
      name: 'Iris Vale',
      role: 'Lead qualifier',
      status: 'working',
      summary: 'Reads new enquiries, asks the right questions and scores each lead.',
      tasks: [
        { title: 'Qualified 4 new web enquiries', status: 'done', at: '2026-10-27T09:10:00Z' },
        { title: 'Scored the open-house sign-ups', status: 'done', at: '2026-10-27T08:40:00Z' },
      ],
      conversations: [
        {
          title: 'Enquiry about a two-bedroom flat',
          messages: [
            { from: 'Sample lead', text: 'Is the flat on Elm Street still available?' },
            { from: 'Iris Vale', text: 'It is! Would you like to book a viewing this week?' },
          ],
        },
      ],
    },
    {
      id: 'ag-theo',
      name: 'Theo Marsh',
      role: 'Follow-up writer',
      status: 'waiting-approval',
      summary: 'Drafts follow-ups in your tone and queues them for a person to approve.',
      tasks: [{ title: 'Drafted 3 follow-up emails', status: 'waiting for approval', at: '2026-10-27T09:30:00Z' }],
      conversations: [],
    },
    {
      id: 'ag-nova',
      name: 'Nova Reyes',
      role: 'Viewing scheduler',
      status: 'idle',
      summary: 'Finds times that suit everyone and proposes viewings.',
      tasks: ['Proposed a viewing for Thursday'],
      conversations: [],
    },
  ],
  activity: [
    { agentId: 'ag-iris', text: 'Qualified a new enquiry from the website', at: '2026-10-27T09:12:00Z' },
    { agentId: 'ag-theo', text: 'Drafted a follow-up and asked for approval', at: '2026-10-27T09:31:00Z' },
    { agentId: 'ag-nova', text: 'Proposed Thursday 10:00 for a viewing', at: '2026-10-27T09:45:00Z' },
  ],
};

const LEAD_COUNT = 60;
const leads = Array.from({ length: LEAD_COUNT }, (_, i) => ({
  id: `lead-${String(i + 1).padStart(3, '0')}`,
  createdAt: new Date(Date.UTC(2026, 9, 27, 12, 0) - i * 3_600_000).toISOString(),
  fullName: `Sample Person ${i + 1}`,
  email: `person${i + 1}@example.test`,
  company: `Company ${i + 1}`,
  industry: i % 2 ? 'automotive' : 'real-estate',
  phone: i % 3 ? null : '+44 20 7946 0000',
  website: i % 4 ? null : `https://company${i + 1}.example`,
  marketingConsent: i % 5 === 0,
  demoStatus: ['verification-sent', 'ready', 'claimed', 'expired'][i % 4],
  attribution: i % 2 ? { utmSource: 'newsletter', utmMedium: 'email' } : { referrerHost: 'search.example' },
  expiresAt: '2026-11-10T12:00:00Z',
}));

export async function startDemoMockApi(port: number, basePort: number, webOrigin: string): Promise<DemoMockApi> {
  const base = await startMockApi(basePort, webOrigin);
  const requests: Recorded[] = [];
  const polls = new Map<string, number[]>();
  const seenJti = new Set<string>();
  const state: DemoMockState = {
    requestDelayMs: 600,
    failNextRequest: false,
    claim: 'ok',
    leadsNeedStepUp: true,
    csvNeedsStepUp: false,
  };
  let requestCount = 0;
  let tokenCount = 0;
  const url = `http://127.0.0.1:${port}`;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const err = (res: ServerResponse, status: number, error: string, message: string, extra: object = {}) =>
    json(res, status, { error, message, requestId: `mock-${Date.now()}`, ...extra });
  const readRaw = (req: IncomingMessage) =>
    new Promise<Buffer>(resolve => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

  function forward(req: IncomingMessage, res: ServerResponse, raw: Buffer | null) {
    const out = httpRequest(
      { host: '127.0.0.1', port: basePort, method: req.method, path: req.url, headers: req.headers },
      upstream => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    out.on('error', () => res.destroy());
    if (raw) out.end(raw);
    else req.pipe(out);
  }

  const mine = (path: string) => path.startsWith('/api/demo/') || path.startsWith('/api/admin/');

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', url);
    if (!mine(u.pathname)) return forward(req, res, u.pathname.startsWith('/socket.io') ? null : await readRaw(req));

    const raw = (await readRaw(req)).toString('utf8');
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
    if (!proof.ok) return err(res, 401, 'device_proof_required', 'Sign this request with your device key.');
    const signedIn = (rec.cookie ?? '').includes(base.state.sessionCookie);
    const route = `${req.method} ${u.pathname}`;

    // ---- public ----
    if (route === 'GET /api/demo/form-token') return json(res, 200, { token: `ft-${++tokenCount}` });
    if (route === 'POST /api/demo/requests') {
      await new Promise(r => setTimeout(r, state.requestDelayMs));
      if (state.failNextRequest) {
        state.failNextRequest = false;
        return err(res, 500, 'internal_error', 'Something went wrong. Quote the request id.');
      }
      if (body?.company === 'Server Reject Co')
        return err(res, 400, 'validation_failed', 'Some details need another look.', {
          details: {
            issues: [{ path: ['email'], code: 'custom', message: 'Use your work email address, not a personal one.' }],
          },
        });
      if (!String(body?.formToken ?? '').startsWith('ft-'))
        return err(res, 400, 'validation_failed', 'Too fast.', {
          details: { issues: [{ path: ['formToken'], code: 'custom', message: 'Please try again.' }] },
        });
      requestCount += 1;
      return json(res, 202, { requestId: `req-${requestCount}`, status: 'verification-sent' });
    }
    const status = /^\/api\/demo\/requests\/([^/]+)$/.exec(u.pathname);
    if (req.method === 'GET' && status) {
      const id = decodeURIComponent(status[1]!);
      const times = polls.get(id) ?? [];
      times.push(Date.now());
      polls.set(id, times);
      if (id === 'req-missing') return err(res, 404, 'not_found', 'Not found.');
      if (id === 'req-expired') return json(res, 200, { status: 'expired' });
      if (id === 'req-poll') return json(res, 200, { status: times.length >= 3 ? 'ready' : 'verification-sent' });
      return json(res, 200, { status: 'verification-sent' });
    }

    // ---- signed in ----
    if (!signedIn) return err(res, 401, 'not_signed_in', 'Sign in to continue.');
    if (route === 'POST /api/demo/claim') {
      switch (state.claim) {
        case 'not-verified':
          return err(res, 403, 'email_not_verified', 'Confirm your email first.');
        case 'no-demo':
          return err(res, 404, 'not_found', 'Not found.');
        case 'expired':
          return err(res, 410, 'gone', 'This demo has expired.');
        case 'already':
          return err(res, 409, 'conflict', 'Already claimed.');
      }
      return json(res, 200, {
        tenantId: 't-demo-1',
        workspaceId: 'w-demo-1',
        firstName: SAMPLE_WORKSPACE.firstName,
        company: SAMPLE_WORKSPACE.company,
        building: SAMPLE_WORKSPACE.building,
        office: SAMPLE_WORKSPACE.office,
        expiresAt: SAMPLE_WORKSPACE.expiresAt,
      });
    }
    if (route === 'GET /api/demo/workspace') return json(res, 200, SAMPLE_WORKSPACE);
    if (route === 'GET /api/admin/leads') {
      if (state.leadsNeedStepUp)
        return err(res, 403, 'step_up_required', 'Confirm it’s you.', {
          reason: 'permission',
          details: { reason: 'permission' },
        });
      const first = Math.min(Number(u.searchParams.get('first') ?? 25), 100);
      const after = u.searchParams.get('after');
      if (after && !/^c-\d+$/.test(after)) return err(res, 400, 'invalid_cursor', 'Bad cursor.');
      const start = after ? Number(after.slice(2)) : 0;
      const items = leads.slice(start, start + first);
      const end = start + items.length;
      return json(res, 200, { items, pageInfo: { hasNextPage: end < leads.length, endCursor: `c-${end}` } });
    }
    if (route === 'GET /api/admin/leads.csv') {
      if (state.csvNeedsStepUp || state.leadsNeedStepUp)
        return err(res, 403, 'step_up_required', 'Confirm it’s you.', { reason: 'permission' });
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="agentcity-demo-leads.csv"',
      });
      return res.end(['id,fullName,email', ...leads.map(l => `${l.id},${l.fullName},${l.email}`)].join('\n'));
    }
    return err(res, 404, 'not_found', 'Not found.');
  });

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    url,
    base,
    requests,
    polls,
    state,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await base.close();
    },
  };
}
