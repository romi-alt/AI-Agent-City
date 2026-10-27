'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { deviceProof } from '../lib/device-key';

// The API's Socket.IO endpoint. Sockets go straight to the API origin (rewrites can't carry websockets); the session
// cookie still reaches it because cookies ignore ports (DESIGN.md "Topology").
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000';

type State = 'connecting' | 'live' | 'reconnecting' | 'revoked';

const TEXT: Record<State, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  revoked: 'Signed out on this device',
};

/** Small live-updates indicator for the header. The text always says the state; the dot is only decoration. */
export function RealtimeStatus() {
  const [state, setState] = useState<State>('connecting');

  useEffect(() => {
    const socket = io(REALTIME_URL, {
      path: '/socket.io',
      withCredentials: true,
      // A function, so every (re)connection signs a fresh proof with a new jti.
      auth: cb => {
        deviceProof('GET', '/socket.io').then(
          proof => cb({ proof }),
          () => cb({}),
        );
      },
    });
    let revoked = false;
    socket.on('connect', () => setState('live'));
    socket.on('connect_error', () => !revoked && setState('reconnecting'));
    socket.on('disconnect', reason => {
      if (revoked) return;
      // The server closing the socket (not a network drop) means our session no longer lets us in.
      if (reason === 'io server disconnect') socket.connect();
      setState('reconnecting');
    });
    socket.on('revoked', () => {
      revoked = true;
      setState('revoked');
      socket.disconnect();
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return (
    <span className={`realtime realtime-${state}`} data-testid="realtime-status" data-state={state} role="status">
      <span className="dot" aria-hidden="true" />
      {TEXT[state]}
      {state === 'revoked' && (
        <>
          {' '}
          <a href="/signin" data-testid="realtime-signin-again">
            Sign in again
          </a>
        </>
      )}
    </span>
  );
}
