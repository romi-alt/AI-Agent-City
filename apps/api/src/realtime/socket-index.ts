import type { SessionContext } from '../auth/contracts.js';
import type { Revocation } from '../platform/revocation-bus.js';

/** The part of a Socket.IO socket the index needs (kept narrow so the index is easy to test). */
export interface IndexedSocket {
  id: string;
}

/**
 * Which sockets on this API instance belong to which session, device and person. A revocation event names one of
 * those; the index answers "which of my sockets does that cut off". Every instance hears every event through the
 * RevocationBus, so each one only has to find its own sockets.
 */
export class SocketIndex<S extends IndexedSocket> {
  private readonly sessions = new Map<string, { socket: S; session: SessionContext }>();
  private readonly bySession = new Map<string, Set<string>>();
  private readonly byDevice = new Map<string, Set<string>>();
  private readonly bySubject = new Map<string, Set<string>>();

  get size(): number {
    return this.sessions.size;
  }

  add(socket: S, session: SessionContext): void {
    this.remove(socket.id);
    this.sessions.set(socket.id, { socket, session });
    link(this.bySession, session.sessionId, socket.id);
    link(this.byDevice, session.deviceId, socket.id);
    link(this.bySubject, session.subject, socket.id);
  }

  /** Replace the session a socket was resolved with (the backstop re-read it); the keys never change. */
  refresh(socketId: string, session: SessionContext): void {
    const entry = this.sessions.get(socketId);
    if (entry) entry.session = session;
  }

  remove(socketId: string): void {
    const entry = this.sessions.get(socketId);
    if (!entry) return;
    this.sessions.delete(socketId);
    unlink(this.bySession, entry.session.sessionId, socketId);
    unlink(this.byDevice, entry.session.deviceId, socketId);
    unlink(this.bySubject, entry.session.subject, socketId);
  }

  session(socketId: string): SessionContext | undefined {
    return this.sessions.get(socketId)?.session;
  }

  entries(): { socket: S; session: SessionContext }[] {
    return [...this.sessions.values()];
  }

  /** The sockets a revocation applies to. Membership loss only cuts sockets currently working in that tenant. */
  match(r: Revocation): S[] {
    const ids =
      r.kind === 'session'
        ? this.bySession.get(r.sessionId)
        : r.kind === 'device'
          ? this.byDevice.get(r.deviceId)
          : this.bySubject.get(r.subject);
    if (!ids) return [];
    const out: S[] = [];
    for (const id of ids) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      if (r.kind === 'membership' && entry.session.tenantId !== r.tenantId) continue;
      out.push(entry.socket);
    }
    return out;
  }
}

/** True if the revocation applies to this session (used for revocations that raced a handshake). */
export function revocationApplies(r: Revocation, s: SessionContext): boolean {
  switch (r.kind) {
    case 'session':
      return r.sessionId === s.sessionId;
    case 'device':
      return r.deviceId === s.deviceId;
    case 'person':
      return r.subject === s.subject;
    case 'membership':
      return r.subject === s.subject && r.tenantId === s.tenantId;
  }
}

function link(map: Map<string, Set<string>>, key: string, id: string) {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(id);
}

function unlink(map: Map<string, Set<string>>, key: string, id: string) {
  const set = map.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) map.delete(key);
}
