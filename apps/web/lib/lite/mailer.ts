// The one email this backend sends: the address-confirmation link, to the person who just typed the address into
// the demo form. Nothing else is ever sent, and nothing is sent to anyone a visitor's demo "contacts".

export interface Mailer {
  readonly name: string;
  sendVerification(to: { email: string; firstName: string }, link: string): Promise<void>;
}

export const VERIFICATION_SUBJECT = 'Confirm your email to open your AgentCity demo office';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function verificationText(firstName: string, link: string): string {
  return [
    `Hi ${firstName},`,
    '',
    'You asked for a demo office. Confirm that this is your email address to open it:',
    '',
    link,
    '',
    'The link works once and expires in 24 hours.',
    '',
    'What you will see is a simulated demo: the team, tasks and messages are examples, and nothing is sent to anyone.',
    'There is no password to set, and we will never ask you for one.',
    '',
    'If you did not ask for this, ignore this email and nothing happens.',
  ].join('\n');
}

export function verificationHtml(firstName: string, link: string): string {
  const url = esc(link);
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Hi ${esc(firstName)},</p>
<p>You asked for a demo office. Confirm that this is your email address to open it:</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px">Confirm my email</a></p>
<p style="font-size:13px;color:#555">If the button does not work, paste this address into your browser:<br>${url}</p>
<p>The link works once and expires in 24 hours.</p>
<p>What you will see is a simulated demo: the team, tasks and messages are examples, and nothing is sent to anyone. There is no password to set, and we will never ask you for one.</p>
<p style="font-size:13px;color:#555">If you did not ask for this, ignore this email and nothing happens.</p>
</body></html>`;
}

/** Resend over HTTPS. Failures throw an Error whose name carries the HTTP status, never the address or the body. */
export function createResendMailer(apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer {
  return {
    name: 'resend',
    async sendVerification(to, link) {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to.email],
          subject: VERIFICATION_SUBJECT,
          text: verificationText(to.firstName, link),
          html: verificationHtml(to.firstName, link),
        }),
      });
      if (!res.ok) {
        const err = new Error('resend rejected the message');
        err.name = `ResendHttp${res.status}`;
        throw err;
      }
    },
  };
}

/** Development only: prints the link to the server output instead of sending anything. */
export function createConsoleMailer(print: (line: string) => void = line => console.log(line)): Mailer {
  return {
    name: 'console',
    async sendVerification(_to, link) {
      print(`[lite-mailer] verification link: ${link}`);
    },
  };
}

/** Null when no mailer is configured (the service then answers demo_unavailable). */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  const production = env.NODE_ENV === 'production';
  if (env.RESEND_API_KEY && env.MAIL_FROM) return createResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  if (!production && (env.LITE_MAILER === 'console' || env.LITE_STORE === 'memory')) return createConsoleMailer();
  return null;
}
