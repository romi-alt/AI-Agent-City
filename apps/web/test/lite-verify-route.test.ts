// The emailed confirmation link must survive a mail scanner opening it: GET only forwards, POST spends the link.
// Drives the real route handlers against the in-memory store.
import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'test',
  LITE_STORE: 'memory',
  LITE_MAILER: 'console',
  LITE_SECRET: 'x'.repeat(32),
  PUBLIC_ORIGIN: 'https://demo.example',
  DEMO_FORM_MIN_SECONDS: '0',
});

const { GET, POST } = await import('../app/api/lite/demo/verify/route.ts');
const { getService } = await import('../lib/lite/runtime.ts');

/** Submits the demo form and returns the link the console mailer printed. */
async function requestLink(email: string): Promise<string> {
  const service = (await getService())!;
  const printed: string[] = [];
  const original = console.log;
  console.log = (...a: unknown[]) => void printed.push(a.join(' '));
  try {
    const { token } = await service.formToken('9.9.9.9');
    await service.submit(
      { fullName: 'Ada Lovelace', email, company: 'Acme', marketingConsent: false, formToken: token },
      '9.9.9.9',
    );
    await service.whenIdle();
  } finally {
    console.log = original;
  }
  const line = printed.find(l => l.includes('/api/lite/demo/verify?t='));
  assert.ok(line, 'a verification link was printed');
  return /https?:\/\/\S+/.exec(line)![0];
}

const post = (token: string, origin = 'https://demo.example') =>
  new Request('https://demo.example/api/lite/demo/verify', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: token }),
  });

test('opening the link (a scanner) forwards to the confirm page and leaves the link usable', async () => {
  const link = await requestLink('scan@acme.test');
  const token = new URL(link).searchParams.get('t')!;
  for (let i = 0; i < 3; i++) {
    const res = await GET(new Request(link));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `https://demo.example/demo/confirm?t=${encodeURIComponent(token)}`);
    assert.equal(res.headers.get('set-cookie'), null, 'opening the link must not sign anyone in');
  }
  const res = await POST(post(token));
  assert.equal(res.headers.get('location'), 'https://demo.example/demo/welcome');
  assert.match(res.headers.get('set-cookie') ?? '', /^ac_demo=.*HttpOnly/);
});

test('the link works once: a second post lands on the expired page', async () => {
  const token = new URL(await requestLink('once@acme.test')).searchParams.get('t')!;
  assert.equal((await POST(post(token))).headers.get('location'), 'https://demo.example/demo/welcome');
  const again = await POST(post(token));
  assert.equal(again.headers.get('location'), 'https://demo.example/demo/verified?error=expired');
  assert.equal(again.headers.get('set-cookie'), null);
});

test('a post from another site, or with a bad or missing token, is refused', async () => {
  const token = new URL(await requestLink('cross@acme.test')).searchParams.get('t')!;
  const cross = await POST(post(token, 'https://evil.example'));
  assert.equal(cross.headers.get('location'), 'https://demo.example/demo/verified?error=expired');
  assert.equal(cross.headers.get('set-cookie'), null);
  assert.equal((await POST(post('nope'))).headers.get('set-cookie'), null);
  const none = await GET(new Request('https://demo.example/api/lite/demo/verify'));
  assert.equal(none.headers.get('location'), 'https://demo.example/demo/verified?error=expired');
  // The cross-site attempt did not spend the link.
  assert.equal((await POST(post(token))).headers.get('location'), 'https://demo.example/demo/welcome');
});
