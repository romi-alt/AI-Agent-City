import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { Sim } from '../src/core/sim';
import type { Patch } from '../src/core/types';
import { AuthStore, DEVICE_MS, type Session, type User } from './auth';
import { attachBrain, brainStatus } from './brain';
import { attachDelivery, providers, sendTestEmail } from './delivery';
import { otpauthUrl } from './totp';

const PORT = Number(process.env.PORT ?? 3001);
const DATA = resolve(process.env.DATA_DIR ?? 'data');
const STATE_FILE = join(DATA, 'state.json');
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';
mkdirSync(DATA, { recursive: true });

// ── state ─────────────────────────────────────────────────────
const auth = new AuthStore(join(DATA, 'auth.json'));
const sim = loadSim();
const streams = new Map<Response, Session>();

function loadSim() {
  if (existsSync(STATE_FILE)) {
    try {
      const snap = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      if (snap.version === Sim.VERSION) return new Sim(snap);
      console.warn('[state] saved city is from an older version – starting a fresh city');
    } catch (e) { console.warn('[state] could not read saved city, starting fresh:', e); }
  }
  return Sim.create();
}

function saveSim() {
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(sim.snapshot()));
  renameSync(tmp, STATE_FILE);
}

/** Send whatever changed to every signed-in browser. */
function flush() {
  const p = sim.takePatch();
  if (p) broadcast('patch', p);
}

function broadcast(event: string, data: Patch | object) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [res, s] of streams) {
    if (!auth.sessions.has(s.hash) || s.stage !== 'full' || s.locked) { res.end(); streams.delete(res); continue; }
    res.write(msg);
  }
}

attachDelivery(sim, flush);
attachBrain(sim, flush);

// Signed-in people with a desk show as working while on duty.
for (const u of auth.users) if (u.agentId) { sim.linkUser(u.agentId, u.id); sim.setDuty(u.agentId, u.onDuty); }
sim.takePatch();

// The clock: `speed` ticks per second (each tick = 2 sim minutes). 1/120 ≈ real time.
let acc = 0;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  acc += ((now - last) / 1000) * sim.settings.speed;
  last = now;
  let n = 0;
  while (acc >= 1 && n < 20) { sim.tick(); acc--; n++; }
  if (n) flush();
}, 200);
setInterval(saveSim, 30_000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { saveSim(); auth.save(); process.exit(0); });

// ── http ──────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Every state-changing API call must carry this header. Browsers can't add it cross-site without CORS, which we never allow.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('x-fs') !== '1') return res.status(403).json({ error: 'Missing request header.' });
  next();
});

/** Crude per-IP limiter for the sign-in endpoints. */
const hits = new Map<string, number[]>();
function limit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter(t => t > now - windowMs);
    list.push(now);
    hits.set(key, list);
    if (list.length > max) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    next();
  };
}

const SID = 'fs_sid', DEV = 'fs_dev';
const cookieOpts = { httpOnly: true, sameSite: 'strict' as const, secure: SECURE_COOKIES, path: '/' };

interface Authed extends Request { session2?: Session; user?: User }

function readSession(req: Authed) {
  const s = auth.session(req.cookies?.[SID]);
  if (s) { req.session2 = s; req.user = auth.byId(s.userId); }
  return s;
}

function signedIn(req: Authed, res: Response, next: NextFunction) {
  const s = readSession(req);
  if (!s || s.stage !== 'full') return res.status(401).json({ error: 'Please sign in.' });
  if (s.locked) return res.status(423).json({ error: 'Locked. Enter your code to unlock.' });
  next();
}

function admin(req: Authed, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

const who = (req: Request) => ({ ip: req.ip ?? '?', ua: (req.get('user-agent') ?? '').slice(0, 160) });

function startSession(res: Response, userId: string, stage: Session['stage']) {
  res.cookie(SID, auth.newSession(userId, stage), cookieOpts);
}

function me(req: Authed) {
  const s = req.session2;
  const u = req.user;
  const state = !s || !u ? 'anon' : s.stage === 'password' ? 'code' : s.locked ? 'locked' : 'in';
  return {
    state,
    user: u && state !== 'anon' ? { ...auth.publicUser(u), recoveryLeft: u.recovery.length } : undefined,
    setupNeeded: !auth.activeUsers().length,
  };
}

// ── auth routes ───────────────────────────────────────────────
app.get('/api/auth/me', (req: Authed, res) => { readSession(req); res.json(me(req)); });

app.post('/api/auth/login', limit(20, 5 * 60_000), (req: Authed, res) => {
  const { username = '', password = '' } = req.body ?? {};
  const r = auth.login(String(username), String(password));
  auth.log({ username: String(username).slice(0, 60), ...who(req), result: r.result });
  if (!r.user) return res.status(401).json({ error: r.error });
  // A remembered device skips the code step (still needs the password).
  if (auth.deviceUser(req.cookies?.[DEV]) === r.user.id) {
    startSession(res, r.user.id, 'full');
    auth.log({ username: r.user.username, ...who(req), result: 'ok-remembered-device' });
    return res.json({ next: 'in' });
  }
  startSession(res, r.user.id, 'password');
  res.json({ next: 'code' });
});

app.post('/api/auth/verify', limit(20, 5 * 60_000), (req: Authed, res) => {
  const s = readSession(req);
  const u = req.user;
  if (!s || !u || (s.stage === 'full' && !s.locked)) return res.status(400).json({ error: 'Start over and sign in again.' });
  const result = auth.checkCode(u, String(req.body?.code ?? ''));
  if (!result || result === 'locked-out') {
    s.codeFails++;
    auth.log({ username: u.username, ...who(req), result: result ?? 'bad-code' });
    if (s.codeFails >= 5) { auth.endSession(req.cookies?.[SID]); res.clearCookie(SID, cookieOpts); return res.status(401).json({ error: 'Too many wrong codes. Start over.', restart: true }); }
    return res.status(401).json({ error: result === 'locked-out' ? 'Too many attempts. Try again in a few minutes.' : 'That code didn\'t work. Try the newest code in your app.' });
  }
  const wasLocked = s.stage === 'full' && s.locked;
  s.stage = 'full';
  s.locked = false;
  s.codeFails = 0;
  auth.save();
  if (req.body?.remember) res.cookie(DEV, auth.rememberDevice(u.id), { ...cookieOpts, maxAge: DEVICE_MS });
  auth.log({ username: u.username, ...who(req), result: wasLocked ? 'unlocked' : result });
  res.json({ next: 'in', recoveryLeft: u.recovery.length });
});

app.post('/api/auth/reset-password', limit(10, 10 * 60_000), (req: Authed, res) => {
  const { username = '', code = '', recovery = '', password = '' } = req.body ?? {};
  const r = auth.resetPassword(String(username), String(code), String(recovery), String(password));
  auth.log({ username: String(username).slice(0, 60), ...who(req), result: r.result });
  if (!r.user) return res.status(400).json({ error: r.error });
  res.json({ ok: true, recoveryLeft: r.user.recovery.length });
});

app.post('/api/auth/lock', signedIn, (req: Authed, res) => {
  req.session2!.locked = true;
  auth.save();
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req: Authed, res) => {
  auth.endSession(req.cookies?.[SID]);
  res.clearCookie(SID, cookieOpts);
  res.json({ ok: true });
});

app.get('/api/auth/enroll/:token', (req, res) => {
  const t = auth.enrollTarget(req.params.token);
  if (!t) return res.status(404).json({ error: 'This link has expired or was already used. Ask an admin for a new one.' });
  res.json(t === 'bootstrap' ? { bootstrap: true } : { bootstrap: false, username: t.username, name: t.name });
});

app.post('/api/auth/enroll/start', limit(20, 10 * 60_000), async (req, res) => {
  try {
    const { token, password, username, name } = req.body ?? {};
    const u = auth.startEnroll(String(token), String(password ?? ''), username, name);
    const url = otpauthUrl(u.pendingSecret!, u.username);
    res.json({ otpauth: url, secret: u.pendingSecret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.post('/api/auth/enroll/finish', limit(20, 10 * 60_000), (req, res) => {
  try {
    const { user, codes } = auth.finishEnroll(String(req.body?.token), String(req.body?.code ?? ''));
    auth.log({ username: user.username, ...who(req), result: 'enrolled' });
    startSession(res, user.id, 'full');
    res.json({ codes });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// ── the city ──────────────────────────────────────────────────
app.get('/api/state', signedIn, (req: Authed, res) => {
  const body = JSON.stringify({ snapshot: sim.snapshot(), me: me(req), integrations: integrations(), people: people() });
  if ((req.get('accept-encoding') ?? '').includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.type('json').send(gzipSync(body));
  } else res.type('json').send(body);
});

app.get('/api/stream', signedIn, (req: Authed, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  streams.set(res, req.session2!);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => { clearInterval(ping); streams.delete(res); });
});

function integrations() {
  return { ...providers(), claude: brainStatus() };
}
function people() {
  return auth.users.map(u => ({ id: u.id, name: u.name, onDuty: u.onDuty, agentId: u.agentId }));
}

const Tenant = z.object({ name: z.string().min(1).max(80), contact: z.string().max(80).default(''), email: z.string().max(120).default(''), phone: z.string().max(40).default('') });
const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve'), id: z.string(), ok: z.boolean(), edit: z.string().max(5000).optional() }),
  z.object({ type: z.literal('approveAll'), buildingId: z.string().optional() }),
  z.object({ type: z.literal('rent'), buildingId: z.string(), level: z.number(), tenant: Tenant }),
  z.object({ type: z.literal('vacate'), buildingId: z.string(), level: z.number() }),
  z.object({ type: z.literal('leadCreate'), lead: z.object({ buildingId: z.string(), name: z.string().min(1).max(80), email: z.string().max(120).optional(), phone: z.string().max(40).optional(), source: z.string().max(80).optional(), interest: z.string().max(80).optional(), floor: z.number().optional(), kind: z.enum(['customer', 'affiliate']).optional() }) }),
  z.object({ type: z.literal('leadUpdate'), id: z.string(), fields: z.object({ stage: z.string().optional(), name: z.string().max(80).optional(), email: z.string().max(120).optional(), phone: z.string().max(40).optional(), interest: z.string().max(80).optional() }) }),
  z.object({ type: z.literal('leadNote'), id: z.string(), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal('leadSend'), id: z.string(), channel: z.enum(['email', 'phone', 'text']), subject: z.string().max(200).optional(), body: z.string().min(1).max(5000) }),
  z.object({ type: z.literal('contentUpdate'), id: z.string(), fields: z.object({ hook: z.string().max(300).optional(), caption: z.string().max(3000).optional(), cta: z.string().max(200).optional(), hashtags: z.array(z.string().max(60)).max(15).optional(), day: z.number().optional(), time: z.string().regex(/^\d\d:\d\d$/).optional(), platform: z.string().max(30).optional(), topic: z.string().max(200).optional() }) }),
  z.object({ type: z.literal('inboxReply'), id: z.string(), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal('duty'), onDuty: z.boolean() }),
  z.object({ type: z.literal('desk'), agentId: z.string().nullable() }),
]);

app.post('/api/action', signedIn, (req: Authed, res) => {
  const parsed = Action.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Bad request' });
  const a = parsed.data;
  const u = req.user!;
  const by = u.name;
  let result: unknown = { ok: true };
  switch (a.type) {
    case 'approve': sim.resolve(a.id, a.ok, by, a.edit); break;
    case 'approveAll': for (const p of sim.approvals.filter(x => !a.buildingId || x.buildingId === a.buildingId)) sim.resolve(p.id, true, by); break;
    case 'rent': if (!sim.rentFloor(a.buildingId, a.level, a.tenant)) return res.status(400).json({ error: 'That floor is not available.' }); break;
    case 'vacate': if (!sim.vacateFloor(a.buildingId, a.level)) return res.status(400).json({ error: 'That floor has no tenant.' }); break;
    case 'leadCreate': result = { id: sim.createLead(a.lead, by).id }; break;
    case 'leadUpdate': sim.updateLead(a.id, a.fields, by); break;
    case 'leadNote': sim.addNote(a.id, a.text, by); break;
    case 'leadSend': if (!sim.sendManual(a.id, a.channel, a.subject, a.body, by)) return res.status(400).json({ error: 'This lead has no address for that channel.' }); break;
    case 'contentUpdate': sim.updateContent(a.id, a.fields); break;
    case 'inboxReply': sim.replyInbox(a.id, a.text, by); break;
    case 'duty':
      u.onDuty = a.onDuty;
      if (u.agentId) sim.setDuty(u.agentId, a.onDuty);
      auth.save();
      broadcast('people', people());
      break;
    case 'desk': {
      const agent = a.agentId ? sim.agent(a.agentId) : undefined;
      if (a.agentId && (!agent || agent.kind !== 'human')) return res.status(400).json({ error: 'Pick a person\'s desk.' });
      u.agentId = a.agentId ?? undefined;
      sim.linkUser(u.agentId, u.id);
      if (u.agentId) sim.setDuty(u.agentId, u.onDuty);
      auth.save();
      broadcast('people', people());
      break;
    }
  }
  flush();
  res.json(result);
});

app.post('/api/me/recovery-codes', signedIn, (req: Authed, res) => {
  res.json({ codes: auth.newRecoveryCodes(req.user!) });
});

// ── admin ─────────────────────────────────────────────────────
const Settings = z.object({
  companyName: z.string().min(1).max(60).optional(),
  reportRecipients: z.array(z.string().email()).max(20).optional(),
  deliveryMode: z.enum(['simulate', 'live']).optional(),
  crmUrlTemplate: z.string().max(300).refine(s => !s || /^https:\/\//.test(s), 'CRM link must start with https://').optional(),
  morningReportAt: z.number().min(0).max(1439).optional(),
  dailyReportAt: z.number().min(0).max(1439).optional(),
  aiDrafts: z.boolean().optional(),
  speed: z.number().min(0).max(20).optional(),
});

app.put('/api/admin/settings', signedIn, admin, (req, res) => {
  const parsed = Settings.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Bad settings' });
  sim.updateSettings(parsed.data);
  flush();
  res.json(sim.settings);
});

app.get('/api/admin/users', signedIn, admin, (_req, res) => res.json(auth.users.map(u => auth.publicUser(u))));

app.post('/api/admin/users', signedIn, admin, (req, res) => {
  const p = z.object({ username: z.string().regex(/^[a-zA-Z0-9._-]{3,32}$/, 'Usernames are 3–32 letters, numbers, dots or dashes.'), name: z.string().min(1).max(60), role: z.enum(['admin', 'member']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
  try {
    const { user, token } = auth.createUser(p.data.username, p.data.name, p.data.role);
    res.json({ user: auth.publicUser(user), link: `/?enroll=${token}` });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.post('/api/admin/users/:id/reset', signedIn, admin, (req: Authed, res) => {
  try { res.json({ link: `/?enroll=${auth.resetUser(String(req.params.id))}` }); } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.delete('/api/admin/users/:id', signedIn, admin, (req: Authed, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You can\'t remove yourself.' });
  const u = auth.byId(String(req.params.id));
  if (u?.agentId) sim.linkUser(undefined, u.id);
  auth.deleteUser(String(req.params.id));
  broadcast('people', people());
  res.json({ ok: true });
});

app.get('/api/admin/signins', signedIn, admin, (_req, res) => res.json(auth.signins.slice(0, 200)));
app.get('/api/admin/integrations', signedIn, admin, (_req, res) => res.json(integrations()));
app.post('/api/admin/test-email', signedIn, admin, async (req, res) => {
  try { await sendTestEmail(String(req.body?.to ?? '')); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// ── the app itself (production build) ─────────────────────────
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Sales City server on http://localhost:${PORT}`);
  if (auth.bootstrapToken) {
    const base = process.env.PUBLIC_URL ?? (process.env.NODE_ENV === 'production' ? `http://localhost:${PORT}` : 'http://localhost:5173');
    console.log(`\nNo users yet. Create the first admin here (one-time link):\n  ${base}/?enroll=${auth.bootstrapToken}\n`);
  }
});
