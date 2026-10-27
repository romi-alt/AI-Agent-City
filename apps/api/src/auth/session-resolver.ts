import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_ENV, type ApiEnv } from '../env.js';
import { SESSION_COOKIE, type SessionContext, type SessionResolver } from './contracts.js';
import { readCookie } from './http-util.js';
import { errorName, SessionService } from './session.service.js';

/** The path Socket.IO handshakes prove (DESIGN.md "Device binding"). */
export const SOCKET_PROOF_PATH = '/socket.io';

/**
 * SESSION_RESOLVER for Socket.IO: the same checks as the HTTP guard. A handshake must come from PUBLIC_ORIGIN (a
 * WebSocket upgrade is a GET, but cross-site WebSocket hijacking is still a CSRF), carry the session cookie and a
 * fresh device proof with `htm` GET and `htu` PUBLIC_ORIGIN + "/socket.io". Never throws for a bad client: null.
 */
@Injectable()
export class AuthSessionResolver implements SessionResolver {
  private readonly log = new Logger('Auth');

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async resolveHandshake(input: {
    cookieHeader: string | undefined;
    proof: string | undefined;
    origin: string | undefined;
  }): Promise<SessionContext | null> {
    if (input.origin !== this.env.PUBLIC_ORIGIN) return null;
    try {
      const { context } = await this.sessions.authenticate({
        token: readCookie(input.cookieHeader, SESSION_COOKIE),
        proof: input.proof,
        htm: 'GET',
        htu: this.env.PUBLIC_ORIGIN + SOCKET_PROOF_PATH,
        origin: input.origin,
        requireOrigin: true,
      });
      return context;
    } catch (err) {
      if ((err as { getStatus?: () => number }).getStatus) return null; // an auth refusal
      this.log.error(`Handshake session check failed (${errorName(err)})`);
      return null;
    }
  }

  current(sessionId: string): Promise<SessionContext | null> {
    return this.sessions.current(sessionId);
  }
}
