import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_ERRORS } from './contracts.js';

type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];

const STATUS: Record<AuthErrorCode, number> = {
  not_signed_in: HttpStatus.UNAUTHORIZED,
  device_proof_required: HttpStatus.UNAUTHORIZED,
  session_revoked: HttpStatus.UNAUTHORIZED,
  bad_origin: HttpStatus.FORBIDDEN,
  step_up_required: HttpStatus.FORBIDDEN,
  forbidden: HttpStatus.FORBIDDEN,
  no_tenant_selected: HttpStatus.CONFLICT,
};

/** The JSON error shape the web app reacts to: `{ error: <code>, … }`. */
export function authError(code: AuthErrorCode, extra: Record<string, unknown> = {}): HttpException {
  return new HttpException({ error: code, ...extra }, STATUS[code]);
}

/** Parses a Cookie header without trusting any middleware to have run (Socket.IO handshakes have none). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The request path as the browser addressed it (no query string), for the proof's `htu`. */
export function requestPath(req: Request): string {
  const url = req.originalUrl || req.url || '/';
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}

/** A single header value (Express joins or arrays repeated headers; repeated auth headers are refused). */
export function singleHeader(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

/**
 * `returnTo` must be a path on our own origin: one leading slash, no `//` (protocol-relative), no backslash
 * (browsers treat `/\` as `//`), no scheme, no control characters, bounded length.
 */
export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  // Resolve against a throwaway origin: anything that escapes it is not a same-origin path.
  try {
    const base = 'https://same-origin.invalid';
    const u = new URL(value, base);
    return u.origin === base && u.pathname.startsWith('/');
  } catch {
    return false;
  }
}

/** Short, human-readable device label from the User-Agent (display only; never used for any security decision). */
export function deviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Browser';
}
