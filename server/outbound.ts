/**
 * Migration containment (M00): one server-side gate in front of every call to an outside provider —
 * email (SMTP), text messages (Twilio) and AI drafting (Anthropic). It is checked by the delivery and
 * drafting code itself, so agent approvals, manual sends, reports, the test email and AI drafts all pass
 * through it; nothing else in the server talks to a provider.
 *
 * A call is allowed only when BOTH are true:
 *  - the server was started with OUTBOUND_ENABLED=true (the kill switch; absent or any other value = off), and
 *  - Settings → Delivery is "live". The default "simulate" mode is the demo and never calls a provider.
 */

export type Provider = 'email' | 'sms' | 'llm';
export type GateVerdict = { ok: true } | { ok: false; reason: string };

export interface OutboundGate {
  check(provider: Provider): GateVerdict;
  /** Calls refused since start, per provider (shown to the owner, and used by tests). */
  readonly blocked: Record<Provider, number>;
  readonly switchOn: boolean;
}

export const KILL_SWITCH_REASON = 'Outbound is switched off on this server (OUTBOUND_ENABLED is not "true"). Nothing was sent.';
export const DEMO_REASON = 'Delivery mode is "simulate" (demo), so no provider was called.';

export function createOutboundGate(opts: { env?: NodeJS.ProcessEnv; mode: () => 'simulate' | 'live' }): OutboundGate {
  const switchOn = (opts.env ?? process.env).OUTBOUND_ENABLED === 'true';
  const blocked: Record<Provider, number> = { email: 0, sms: 0, llm: 0 };
  return {
    switchOn,
    blocked,
    check(provider) {
      if (!switchOn) { blocked[provider]++; return { ok: false, reason: KILL_SWITCH_REASON }; }
      if (opts.mode() !== 'live') { blocked[provider]++; return { ok: false, reason: DEMO_REASON }; }
      return { ok: true };
    },
  };
}
