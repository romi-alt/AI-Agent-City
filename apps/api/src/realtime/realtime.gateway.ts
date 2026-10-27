import type { IncomingMessage, ServerResponse } from 'node:http';
import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AUTH_ERRORS, SESSION_RESOLVER, type SessionContext, type SessionResolver } from '../auth/contracts.js';
import { API_ENV, type ApiEnv } from '../env.js';
import { type Revocation, RevocationBus } from '../platform/revocation-bus.js';
import {
  REALTIME_OPTIONS,
  REALTIME_PATH,
  type RealtimeOptions,
  tenantRoom,
  workspaceRoom,
} from './realtime.options.js';
import { revocationApplies, SocketIndex } from './socket-index.js';

/** Sent to a socket right before the server disconnects it because it lost access. */
export const REVOKED_EVENT = 'revoked';

/** Why the backstop re-check ended a socket (revocations carry their own reason from the bus). */
const RECHECK_REASONS = { invalid: 'session_invalid', tenantChanged: 'tenant_changed' } as const;

/** How long a revocation is remembered, to catch a handshake that resolved just before it was published. */
const RECENT_REVOCATION_MS = 10_000;

type SessionSocket = Socket & { data: { session?: SessionContext } };

/**
 * The authenticated Socket.IO endpoint (`/socket.io`). A connection is only accepted when the browser's Origin is
 * PUBLIC_ORIGIN and SESSION_RESOLVER accepts its session cookie and device proof; the checks run before the
 * connection exists, so an unauthenticated client never receives anything. A socket joins only its session's
 * current tenant (and workspace) room, and is cut off within a second of a revocation anywhere in the cluster.
 * CORS and the Origin check are installed in afterInit because PUBLIC_ORIGIN is only known at runtime.
 */
@WebSocketGateway({ path: REALTIME_PATH, serveClient: false, cors: false })
export class RealtimeGateway
  implements
    OnGatewayInit<Server>,
    OnGatewayConnection<SessionSocket>,
    OnGatewayDisconnect<SessionSocket>,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly log = new Logger('Realtime');
  private readonly index = new SocketIndex<SessionSocket>();
  private readonly recent: { at: number; r: Revocation }[] = [];
  private server?: Server;
  private unsubscribe?: () => void;
  private timer?: NodeJS.Timeout;
  private rechecking = false;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
    @Inject(RevocationBus) private readonly bus: RevocationBus,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {}

  async onModuleInit() {
    this.unsubscribe = await this.bus.subscribe(r => this.onRevocation(r));
    this.timer = setInterval(() => void this.recheckAll(), this.options.recheckIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    clearInterval(this.timer);
  }

  afterInit(server: Server) {
    this.server = server;
    const origin = new URL(this.env.PUBLIC_ORIGIN).origin;
    // CORS for the polling transport: only PUBLIC_ORIGIN, with credentials (the session cookie).
    server.engine.use((req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void) => {
      const from = req.headers.origin;
      if (from !== undefined && from !== origin) return next(new Error(AUTH_ERRORS.badOrigin));
      if (from === origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        res.writeHead(204);
        res.end();
        return;
      }
      next();
    });
    // Cross-site WebSocket hijacking defence: a handshake must come from PUBLIC_ORIGIN (no Origin is refused too).
    server.engine.opts.allowRequest = (req, done) =>
      req.headers.origin === origin ? done(null, true) : done(AUTH_ERRORS.badOrigin, false);
    // Authenticate in a middleware so a refused client is never connected, not "connected, then dropped".
    server.use((socket, next) => {
      void this.authenticate(socket as SessionSocket).then(
        ok => next(ok ? undefined : new Error(AUTH_ERRORS.notSignedIn)),
        err => {
          this.log.warn(`handshake check failed: ${err instanceof Error ? err.message : String(err)}`);
          next(new Error(AUTH_ERRORS.notSignedIn));
        },
      );
    });
  }

  private async authenticate(socket: SessionSocket): Promise<boolean> {
    const proof: unknown = socket.handshake.auth?.proof;
    const session = await this.sessions.resolveHandshake({
      cookieHeader: socket.handshake.headers.cookie,
      proof: typeof proof === 'string' ? proof : undefined,
      origin: socket.handshake.headers.origin,
    });
    if (!session) return false;
    socket.data.session = session;
    return true;
  }

  handleConnection(socket: SessionSocket) {
    const session = socket.data.session;
    if (!session) {
      // Unreachable while the middleware is in place; refuse rather than serve an unauthenticated socket.
      socket.disconnect(true);
      return;
    }
    this.index.add(socket, session);
    // A revocation published between the handshake check and now would otherwise be missed.
    this.pruneRecent();
    const raced = this.recent.find(e => revocationApplies(e.r, session));
    if (raced) {
      this.cut(socket, raced.r.reason);
      return;
    }
    // Only the session's current tenant: a session without one sees no tenant data at all.
    if (session.tenantId) void socket.join(tenantRoom(session.tenantId));
    if (session.tenantId && session.workspaceId) void socket.join(workspaceRoom(session.workspaceId));
  }

  handleDisconnect(socket: SessionSocket) {
    this.index.remove(socket.id);
  }

  /** Emit to everyone working in one tenant on every API instance reachable through this server's adapter. */
  toTenant(tenantId: string, event: string, payload: unknown): void {
    if (!this.server) throw new Error('Realtime gateway is not initialised');
    this.server.to(tenantRoom(tenantId)).emit(event, payload);
  }

  /** Sockets connected to this instance (for tests and diagnostics). */
  get connectedCount(): number {
    return this.index.size;
  }

  private onRevocation(r: Revocation) {
    this.recent.push({ at: Date.now(), r });
    this.pruneRecent();
    for (const socket of this.index.match(r)) this.cut(socket, r.reason);
  }

  /** Tell the client why, then disconnect; the engine flushes the event before closing the transport. */
  private cut(socket: SessionSocket, reason: string) {
    this.index.remove(socket.id);
    socket.emit(REVOKED_EVENT, { reason });
    socket.disconnect(true);
  }

  private pruneRecent() {
    const cutoff = Date.now() - RECENT_REVOCATION_MS;
    while (this.recent.length && this.recent[0]!.at < cutoff) this.recent.shift();
  }

  /**
   * Backstop for anything the bus missed (an instance that was briefly disconnected from Redis, an expiry that
   * nobody publishes): re-read every socket's session and end those that are gone or switched tenant.
   */
  async recheckAll(): Promise<void> {
    if (this.rechecking) return;
    this.rechecking = true;
    try {
      const bySession = new Map<string, SessionSocket[]>();
      for (const { socket, session } of this.index.entries()) {
        const list = bySession.get(session.sessionId) ?? [];
        list.push(socket);
        bySession.set(session.sessionId, list);
      }
      for (const [sessionId, sockets] of bySession) {
        let current: SessionContext | null;
        try {
          current = await this.sessions.current(sessionId);
        } catch (err) {
          // A failing store must not silently extend access: treat it like an invalid session.
          this.log.warn(`session re-check failed: ${err instanceof Error ? err.message : String(err)}`);
          current = null;
        }
        for (const socket of sockets) {
          const was = this.index.session(socket.id);
          if (!was) continue; // disconnected meanwhile
          if (!current) this.cut(socket, RECHECK_REASONS.invalid);
          else if (current.tenantId !== was.tenantId || current.workspaceId !== was.workspaceId)
            this.cut(socket, RECHECK_REASONS.tenantChanged);
          else this.index.refresh(socket.id, current);
        }
      }
    } finally {
      this.rechecking = false;
    }
  }
}
