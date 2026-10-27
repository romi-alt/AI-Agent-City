import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isClientRole, type Client, type Role } from './scope';
import { newSecret, verifyTotp } from './totp';

export type { Role } from './scope';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** The client a client-admin or client-viewer belongs to. Agency people have none. */
  clientId?: string;
  passHash?: string;
  salt?: string;
  totpSecret?: string;
  /** Secret shown during enrollment, promoted to totpSecret once a code is confirmed. */
  pendingSecret?: string;
  lastStep?: number;
  recovery: string[];
  onDuty: boolean;
  agentId?: string;
  createdAt: number;
  enrollHash?: string;
  enrollExpires?: number;
  failed: number;
  lockedUntil?: number;
}

export interface Session {
  hash: string;
  userId: string;
  /** `password`: passed step 1, needs the 6-digit code. `full`: signed in. */
  stage: 'password' | 'full';
  locked: boolean;
  codeFails: number;
  created: number;
  lastSeen: number;
}

interface Device { hash: string; userId: string; expires: number }

export interface SignIn {
  t: number;
  username: string;
  ip: string;
  ua: string;
  result: 'ok' | 'ok-remembered-device' | 'ok-recovery-code' | 'bad-password' | 'bad-code' | 'locked-out' | 'unknown-user' | 'enrolled' | 'unlocked' | 'ok-password-reset' | 'bad-reset';
}

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const PASSWORD_STAGE_MS = 10 * 60_000;
const IDLE_MS = 12 * 3600_000;
const ABSOLUTE_MS = 7 * 24 * 3600_000;
export const DEVICE_MS = 30 * 24 * 3600_000;
const ENROLL_MS = 72 * 3600_000;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, passHash: scryptSync(password, salt, 64).toString('hex') };
}

function checkPassword(u: User, password: string) {
  if (!u.passHash || !u.salt) return false;
  const a = Buffer.from(u.passHash, 'hex');
  const b = scryptSync(password, u.salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recovery codes look like ABCDE-FGHJK (no 0/O/1/I to avoid misreads). */
function recoveryCodes() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(10);
    const s = [...b].map(x => chars[x % chars.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export class AuthStore {
  users: User[] = [];
  clients: Client[] = [];
  sessions = new Map<string, Session>();
  devices: Device[] = [];
  signins: SignIn[] = [];
  /** One-time link for creating the first admin; exists only while there are no users. */
  bootstrapToken?: string;
  private file: string;

  constructor(file: string) {
    this.file = file;
    if (existsSync(file)) {
      const d = JSON.parse(readFileSync(file, 'utf8'));
      this.users = d.users ?? [];
      this.clients = d.clients ?? [];
      // Accounts from before multi-client isolation: admins become agency owners, members agency staff.
      for (const u of this.users) {
        const r = u.role as string;
        if (r === 'admin') u.role = 'owner';
        else if (r === 'member') u.role = 'staff';
      }
      this.devices = d.devices ?? [];
      this.signins = d.signins ?? [];
      for (const s of d.sessions ?? []) this.sessions.set(s.hash, s);
    }
    if (!this.activeUsers().length) this.bootstrapToken = token();
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ users: this.users, clients: this.clients, devices: this.devices, signins: this.signins, sessions: [...this.sessions.values()] }), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  activeUsers() { return this.users.filter(u => u.totpSecret); }
  byId(id: string) { return this.users.find(u => u.id === id); }
  publicUser(u: User) {
    return { id: u.id, username: u.username, name: u.name, role: u.role, clientId: u.clientId, onDuty: u.onDuty, agentId: u.agentId, enrolled: !!u.totpSecret, createdAt: u.createdAt };
  }

  log(e: Omit<SignIn, 't'>) {
    this.signins.unshift({ t: Date.now(), ...e });
    if (this.signins.length > 500) this.signins.length = 500;
    this.save();
  }

  // ── sessions ────────────────────────────────────────────────
  newSession(userId: string, stage: Session['stage']) {
    const t = token();
    const now = Date.now();
    this.sessions.set(sha(t), { hash: sha(t), userId, stage, locked: false, codeFails: 0, created: now, lastSeen: now });
    this.save();
    return t;
  }

  session(t: string | undefined) {
    if (!t) return;
    const s = this.sessions.get(sha(t));
    if (!s) return;
    const now = Date.now();
    const expired = s.stage === 'password'
      ? now - s.created > PASSWORD_STAGE_MS
      : now - s.lastSeen > IDLE_MS || now - s.created > ABSOLUTE_MS;
    if (expired || !this.byId(s.userId)) { this.sessions.delete(s.hash); return; }
    s.lastSeen = now;
    return s;
  }

  endSession(t: string | undefined) {
    if (t) this.sessions.delete(sha(t));
    this.save();
  }

  /** Sign someone out everywhere, e.g. after what they may see has changed. */
  endSessionsFor(userId: string) {
    for (const s of [...this.sessions.values()]) if (s.userId === userId) this.sessions.delete(s.hash);
    this.save();
  }

  // ── remembered devices ("Remember this device for 30 days") ─
  rememberDevice(userId: string) {
    const t = token();
    this.devices = this.devices.filter(d => d.expires > Date.now());
    this.devices.push({ hash: sha(t), userId, expires: Date.now() + DEVICE_MS });
    this.save();
    return t;
  }

  deviceUser(t: string | undefined) {
    if (!t) return;
    return this.devices.find(d => d.hash === sha(t) && d.expires > Date.now())?.userId;
  }

  // ── step 1: password ────────────────────────────────────────
  login(username: string, password: string): { user?: User; error?: string; result: SignIn['result'] } {
    const u = this.users.find(x => x.username.toLowerCase() === username.trim().toLowerCase() && x.totpSecret);
    if (!u) {
      // Spend the same time as a real check so usernames can't be probed by timing.
      scryptSync(password, 'x'.repeat(32), 64);
      return { error: 'Wrong username or password.', result: 'unknown-user' };
    }
    if (u.lockedUntil && u.lockedUntil > Date.now()) return { error: 'Too many attempts. Try again in a few minutes.', result: 'locked-out' };
    if (!checkPassword(u, password)) {
      u.failed++;
      if (u.failed >= MAX_FAILS) { u.lockedUntil = Date.now() + LOCK_MS; u.failed = 0; }
      this.save();
      return { error: 'Wrong username or password.', result: 'bad-password' };
    }
    u.failed = 0;
    this.save();
    return { user: u, result: 'ok' };
  }

  // ── step 2: authenticator or recovery code ──────────────────
  checkCode(u: User, raw: string): SignIn['result'] | undefined {
    const code = raw.replace(/\s/g, '').toUpperCase();
    if (u.lockedUntil && u.lockedUntil > Date.now()) return 'locked-out';
    if (/^\d{6}$/.test(code) && u.totpSecret) {
      const step = verifyTotp(u.totpSecret, code, u.lastStep ?? -1);
      if (step !== undefined) { u.lastStep = step; u.failed = 0; this.save(); return 'ok'; }
    }
    if (/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(code)) {
      const norm = code.includes('-') ? code : `${code.slice(0, 5)}-${code.slice(5)}`;
      const ix = u.recovery.indexOf(sha(norm));
      if (ix >= 0) { u.recovery.splice(ix, 1); u.failed = 0; this.save(); return 'ok-recovery-code'; }
    }
    u.failed++;
    if (u.failed >= MAX_FAILS) { u.lockedUntil = Date.now() + LOCK_MS; u.failed = 0; }
    this.save();
    return undefined;
  }

  // ── forgotten password: authenticator code + one recovery code ─
  /** Both second factors stand in for the password. Signs the person out everywhere. */
  resetPassword(username: string, code: string, recovery: string, password: string): { user?: User; error?: string; result: SignIn['result'] } {
    const u = this.users.find(x => x.username.toLowerCase() === username.trim().toLowerCase() && x.totpSecret);
    const nope = 'Those details didn\'t match. Check your username, the newest code and your recovery code.';
    if (!u) { scryptSync(password, 'x'.repeat(32), 64); return { error: nope, result: 'unknown-user' }; }
    if (u.lockedUntil && u.lockedUntil > Date.now()) return { error: 'Too many attempts. Try again in a few minutes.', result: 'locked-out' };
    if (password.length < 10) return { error: 'Use at least 10 characters for your password.', result: 'bad-reset' };
    const step = /^\d{6}$/.test(code.replace(/\s/g, '')) ? verifyTotp(u.totpSecret!, code.replace(/\s/g, ''), u.lastStep ?? -1) : undefined;
    const rec = recovery.replace(/\s/g, '').toUpperCase();
    const norm = rec.includes('-') ? rec : `${rec.slice(0, 5)}-${rec.slice(5)}`;
    const ix = u.recovery.indexOf(sha(norm));
    if (step === undefined || ix < 0) {
      u.failed++;
      if (u.failed >= MAX_FAILS) { u.lockedUntil = Date.now() + LOCK_MS; u.failed = 0; }
      this.save();
      return { error: nope, result: 'bad-reset' };
    }
    u.recovery.splice(ix, 1);
    Object.assign(u, hashPassword(password), { lastStep: step, failed: 0 });
    for (const s of [...this.sessions.values()]) if (s.userId === u.id) this.sessions.delete(s.hash);
    this.save();
    return { user: u, result: 'ok-password-reset' };
  }

  // ── enrollment (first admin, new users, resets) ─────────────
  createUser(username: string, name: string, role: Role, clientId?: string) {
    if (this.users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('That username is taken.');
    this.checkClient(role, clientId);
    const t = token();
    const u: User = {
      id: randomBytes(8).toString('hex'), username, name, role, clientId: isClientRole(role) ? clientId : undefined, recovery: [], onDuty: true, createdAt: Date.now(),
      enrollHash: sha(t), enrollExpires: Date.now() + ENROLL_MS, failed: 0,
    };
    this.users.push(u);
    this.save();
    return { user: u, token: t };
  }

  /** Change what someone may see. They are signed out so their browser drops what it already has. */
  updateAccess(id: string, role: Role, clientId?: string) {
    const u = this.byId(id);
    if (!u) throw new Error('No such user.');
    this.checkClient(role, clientId);
    if (u.role === 'owner' && role !== 'owner' && this.users.filter(x => x.role === 'owner').length === 1) throw new Error('Keep at least one agency owner.');
    u.role = role;
    u.clientId = isClientRole(role) ? clientId : undefined;
    this.endSessionsFor(id);
    return u;
  }

  private checkClient(role: Role, clientId?: string) {
    if (isClientRole(role) && !this.clients.some(c => c.id === clientId)) throw new Error('Pick the client this person belongs to.');
  }

  // ── clients ─────────────────────────────────────────────────
  /** Save a client and the buildings it owns. A building belongs to at most one client. */
  saveClient(input: { id?: string; name: string; buildingIds: string[] }) {
    const name = input.name.trim();
    if (!name) throw new Error('Give the client a name.');
    const taken = this.clients.find(c => c.id !== input.id && c.buildingIds.some(b => input.buildingIds.includes(b)));
    if (taken) throw new Error(`A building you picked already belongs to ${taken.name}.`);
    let c = input.id ? this.clients.find(x => x.id === input.id) : undefined;
    if (input.id && !c) throw new Error('No such client.');
    if (!c) { c = { id: randomBytes(6).toString('hex'), name, buildingIds: [], createdAt: Date.now() }; this.clients.push(c); }
    const changed = c.buildingIds.join() !== [...input.buildingIds].sort().join();
    c.name = name;
    c.buildingIds = [...new Set(input.buildingIds)].sort();
    // Its people must reload to see the new set of buildings.
    if (changed) for (const u of this.users) if (u.clientId === c.id) this.endSessionsFor(u.id);
    this.save();
    return c;
  }

  deleteClient(id: string) {
    if (this.users.some(u => u.clientId === id)) throw new Error('Move or remove this client\'s people first.');
    this.clients = this.clients.filter(c => c.id !== id);
    this.save();
  }

  resetUser(id: string) {
    const u = this.byId(id);
    if (!u) throw new Error('No such user.');
    const t = token();
    Object.assign(u, { enrollHash: sha(t), enrollExpires: Date.now() + ENROLL_MS, passHash: undefined, salt: undefined, totpSecret: undefined, pendingSecret: undefined, recovery: [] });
    for (const s of [...this.sessions.values()]) if (s.userId === id) this.sessions.delete(s.hash);
    this.devices = this.devices.filter(d => d.userId !== id);
    this.save();
    return t;
  }

  deleteUser(id: string) {
    this.users = this.users.filter(u => u.id !== id);
    for (const s of [...this.sessions.values()]) if (s.userId === id) this.sessions.delete(s.hash);
    this.devices = this.devices.filter(d => d.userId !== id);
    this.save();
  }

  /** Who an enrollment link belongs to. `bootstrap` means "create the first admin". */
  enrollTarget(t: string): User | 'bootstrap' | undefined {
    if (this.bootstrapToken && t === this.bootstrapToken) return 'bootstrap';
    const u = this.users.find(x => x.enrollHash === sha(t) && (x.enrollExpires ?? 0) > Date.now());
    return u;
  }

  /** Set the password and hand out a new authenticator secret (confirmed in finishEnroll). */
  startEnroll(t: string, password: string, username?: string, name?: string) {
    let target = this.enrollTarget(t);
    if (!target) throw new Error('This link has expired. Ask an admin for a new one.');
    if (password.length < 10) throw new Error('Use at least 10 characters for your password.');
    if (target === 'bootstrap') {
      if (!username?.trim() || !name?.trim()) throw new Error('Enter your name and a username.');
      const existing = this.users.find(u => u.enrollHash === sha(t));
      target = existing ?? this.createUser(username.trim(), name.trim(), 'owner').user;
      target.enrollHash = sha(t);
      target.enrollExpires = Date.now() + ENROLL_MS;
    }
    Object.assign(target, hashPassword(password));
    target.pendingSecret = newSecret();
    this.save();
    return target;
  }

  finishEnroll(t: string, code: string) {
    const target = this.enrollTarget(t);
    const u = target === 'bootstrap' ? this.users.find(x => x.enrollHash === sha(t)) : target;
    if (!u?.pendingSecret || !u.passHash) throw new Error('Start over: set your password first.');
    const step = verifyTotp(u.pendingSecret, code.replace(/\s/g, ''));
    if (step === undefined) throw new Error('That code didn\'t match. Check the time on your phone and try again.');
    const codes = recoveryCodes();
    Object.assign(u, { totpSecret: u.pendingSecret, pendingSecret: undefined, lastStep: step, recovery: codes.map(sha), enrollHash: undefined, enrollExpires: undefined });
    if (target === 'bootstrap') this.bootstrapToken = undefined;
    this.save();
    return { user: u, codes };
  }

  newRecoveryCodes(u: User) {
    const codes = recoveryCodes();
    u.recovery = codes.map(sha);
    this.save();
    return codes;
  }
}
