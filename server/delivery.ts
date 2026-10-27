import nodemailer from 'nodemailer';
import type { Sim } from '../src/core/sim';
import type { Lead, Message, Report } from '../src/core/types';

/**
 * Outbound email (SMTP) and text (Twilio). Nothing is sent unless:
 *  - Settings → delivery mode is "live", and
 *  - the provider is configured in the environment, and
 *  - the recipient is a real lead a person entered (simulated leads are never contacted), or a report recipient.
 */
const env = process.env;
const mailer = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : undefined;
const twilio = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM
  ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM } : undefined;

export function providers() {
  return { email: !!mailer, sms: !!twilio, from: env.MAIL_FROM ?? '' };
}

async function sendEmail(to: string | string[], subject: string, text: string) {
  if (!mailer) throw new Error('Email is not configured (set SMTP_URL).');
  await mailer.sendMail({ from: env.MAIL_FROM, to, subject, text });
}

async function sendSms(to: string, body: string) {
  if (!twilio) throw new Error('Texting is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64')}` },
    body: new URLSearchParams({ To: to, From: twilio.from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function attachDelivery(sim: Sim, flush: () => void) {
  sim.hooks.outbound = (m: Message, lead?: Lead) => {
    if (sim.settings.deliveryMode !== 'live') return sim.setMessageStatus(m.id, 'simulated', 'Delivery mode is "simulate" – nothing was sent.');
    if (!m.real || !lead?.real) return sim.setMessageStatus(m.id, 'simulated');
    const job = m.channel === 'email' ? sendEmail(m.to, m.subject ?? '(no subject)', m.body)
      : m.channel === 'text' ? sendSms(m.to, m.body) : Promise.resolve();
    job.then(() => sim.setMessageStatus(m.id, 'sent'))
      .catch((e: Error) => sim.setMessageStatus(m.id, 'failed', e.message))
      .finally(flush);
  };
  sim.hooks.report = (r: Report) => {
    if (!r.to.length) return;
    if (sim.settings.deliveryMode !== 'live') return;
    sim.setReportStatus(r.id, 'pending');
    sendEmail(r.to, r.subject, r.body)
      .then(() => sim.setReportStatus(r.id, 'sent'))
      .catch((e: Error) => sim.setReportStatus(r.id, 'failed', e.message))
      .finally(flush);
  };
}

export async function sendTestEmail(to: string) {
  await sendEmail(to, 'Fast Sales – test email', 'Email delivery from Sales City is working.');
}
