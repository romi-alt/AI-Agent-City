import { createHash, randomBytes } from 'node:crypto';

/**
 * A new invitation token: 256 random bits, base64url. Only its SHA-256 is stored; the token itself goes back once,
 * inside the link, to the person who created the invitation. It is never logged and never sent by the API.
 */
export function newInvitationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, sha256: hashInvitationToken(token) };
}

export const hashInvitationToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Where the invitee goes. The token is in the URL fragment, so the browser never sends it to a server (no access
 * logs, no Referer); the web page reads it and POSTs it to /api/invitations/accept after sign-in.
 */
export function invitationLink(publicOrigin: string, token: string) {
  const url = new URL('/invitations/accept', publicOrigin);
  url.hash = `token=${token}`;
  return url.toString();
}
