/** Socket.IO endpoint path on the API (DESIGN.md: the device proof's `htu` is PUBLIC_ORIGIN + this path). */
export const REALTIME_PATH = '/socket.io';

export interface RealtimeOptions {
  /** How often every connected socket's session is re-read as a backstop to the revocation bus. */
  recheckIntervalMs: number;
}

/** Override in tests (a short interval); production uses the default. */
export const REALTIME_OPTIONS = Symbol('REALTIME_OPTIONS');
export const DEFAULT_REALTIME_OPTIONS: RealtimeOptions = { recheckIntervalMs: 60_000 };

export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
export const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;
