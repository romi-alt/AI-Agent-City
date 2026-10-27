import nodemailer from 'nodemailer';
import type { Sim } from '../src/core/sim';
import type { Lead, Message, Report } from '../src/core/types';
import type { OutboundGate } from './outbound';

/**
 * Outbound email (SMTP) and text (Twilio). Every send — approved agent messages, manual sends, reports and
 * the owner's test email — asks the outbound gate first (see outbound.ts). Nothing is sent unless:
 *  - the server kill switch is on (OUTBOUND_ENABLED=true) and Settings → delivery mode is "live", and
 *  - the provider is configured in the environment, and
 *  - the recipient is a real lead a person entered (simulated leads are never contacted), or a report recipient.
 */

/** The provider calls themselves. Injected so tests can count calls with fakes. */
export interface Transport {
  email(to: string | string[], subject: string, text: string): Promise<void>;
  sms(to: string, body: string): Promise<void>;
  readonly configured: { email: boolean; sms: boolean; from: string };
}

export function envTransport(env = process.env): Transport {
  const mailer = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : undefined;
  const twilio = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM
    ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM } : undefined;
  return {
    configured: { email: !!mailer, sms: !!twilio, from: env.MAIL_FROM ?? '' },
    async email(to, subject, text) {
      if (!mailer) throw new Error('Email is not configured (set SMTP_URL).');
      await mailer.sendMail({ from: env.MAIL_FROM, to, subject, text });
    },
    async sms(to, body) {
      if (!twilio) throw new Error('Texting is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64')}` },
        body: new URLSearchParams({ To: to, From: twilio.from, Body: body }),
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

export function createDelivery(transport: Transport, gate: OutboundGate) {
  return {
    providers: () => transport.configured,

    attach(sim: Sim, flush: () => void) {
      sim.hooks.outbound = (m: Message, lead?: Lead) => {
        // Simulated leads are never contacted, whatever the settings.
        if (!m.real || !lead?.real) return sim.setMessageStatus(m.id, 'simulated');
        // There is no phone provider: a call is something a person makes, never "sent" by the system.
        if (m.channel === 'phone') return sim.setMessageStatus(m.id, 'skipped', 'No phone provider is connected. Calls are made and logged by people.');
        const verdict = gate.check(m.channel === 'email' ? 'email' : 'sms');
        if (!verdict.ok) return sim.setMessageStatus(m.id, sim.settings.deliveryMode === 'live' ? 'skipped' : 'simulated', verdict.reason);
        const job = m.channel === 'email' ? transport.email(m.to, m.subject ?? '(no subject)', m.body) : transport.sms(m.to, m.body);
        job.then(() => sim.setMessageStatus(m.id, 'sent'))
          .catch((e: Error) => sim.setMessageStatus(m.id, 'failed', e.message))
          .finally(flush);
      };
      sim.hooks.report = (r: Report) => {
        if (!r.to.length) return;
        const verdict = gate.check('email');
        if (!verdict.ok) return sim.setReportStatus(r.id, sim.settings.deliveryMode === 'live' ? 'skipped' : 'simulated', verdict.reason);
        sim.setReportStatus(r.id, 'pending');
        transport.email(r.to, r.subject, r.body)
          .then(() => sim.setReportStatus(r.id, 'sent'))
          .catch((e: Error) => sim.setReportStatus(r.id, 'failed', e.message))
          .finally(flush);
      };
    },

    /** The owner's "Send test email" button. Refused with the gate's reason when outbound is off. */
    async sendTest(to: string) {
      const verdict = gate.check('email');
      if (!verdict.ok) throw new Error(verdict.reason);
      await transport.email(to, 'Fast Sales – test email', 'Email delivery from Sales City is working.');
    },
  };
}
