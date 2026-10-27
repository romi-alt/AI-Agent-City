import { api, ApiError, type Me } from '../api';
import { esc, formData } from './util';

/**
 * The sign-in page: password → 6-digit authenticator code (or a recovery code), forgotten password,
 * first-time setup with a QR code, and the lock screen. Resolves once the person is fully signed in.
 */

const LAST_USER = 'fs-last-user';
const remembered = () => { try { return localStorage.getItem(LAST_USER) ?? ''; } catch { return ''; } };
const remember = (u: string) => { try { localStorage.setItem(LAST_USER, u); } catch { /* private mode */ } };

const svg = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
  check: svg('<path d="M5 12l5 5L20 7"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  phone: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
};

/** A night skyline of the city for the left half of the page; lit windows flicker on and off. */
function skyline() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let x = 0, out = '';
  while (x < 600) {
    const w = 34 + Math.floor(rnd() * 36), h = 70 + Math.floor(rnd() * 170), y = 260 - h;
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="bld"/>`;
    for (let wy = y + 10; wy < 250; wy += 14)
      for (let wx = x + 6; wx < x + w - 8; wx += 10)
        if (rnd() < 0.42) out += `<rect x="${wx}" y="${wy}" width="5" height="7" class="win" style="animation-delay:${(rnd() * 9).toFixed(1)}s;animation-duration:${(6 + rnd() * 8).toFixed(1)}s"/>`;
    x += w + 4 + Math.floor(rnd() * 8);
  }
  return `<svg class="skyline" viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${out}<rect y="258" width="600" height="2" class="street"/></svg>`;
}

function strength(p: string) {
  if (!p) return { score: 0, label: '' };
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length < 10) s = Math.min(s, 1);
  const score = Math.max(1, Math.min(4, s));
  return { score, label: p.length < 10 ? 'Too short' : ['', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

export function signIn(root: HTMLElement, me: Me): Promise<void> {
  return new Promise(done => {
    const enroll = new URLSearchParams(location.search).get('enroll');
    let timers: number[] = [];

    root.innerHTML = `<div class="auth">
      <aside class="auth-hero">
        <div class="auth-brand"><div class="logo">FS</div><div><b>Fast Sales</b><small>Sales City · Virtual office</small></div></div>
        <div class="hero-copy">
          <p class="eyebrow">● Agents on duty</p>
          <h2>Your agents never clock out.</h2>
          <p>Fifteen buildings, every dealership floor staffed by AI agents working leads by email, phone and text, and checking with you on anything that matters.</p>
          <ul>
            <li>${ICON.shield}<span>Nothing reaches a real customer until you approve it</span></li>
            <li>${ICON.phone}<span>2-step sign-in with your authenticator app</span></li>
            <li>${ICON.key}<span>Every sign-in is logged and visible to admins</span></li>
          </ul>
        </div>
        ${skyline()}
      </aside>
      <main class="auth-main"><div class="auth-panel" aria-live="polite"></div></main>
    </div>`;
    const panel = root.querySelector<HTMLElement>('.auth-panel')!;

    const steps = (labels: string[], at: number) => `<ol class="steps">${labels.map((l, i) =>
      `<li class="${i < at ? 'done' : i === at ? 'on' : ''}"><span>${i < at ? ICON.check : i + 1}</span>${l}</li>`).join('')}</ol>`;

    /** Swap the right-hand panel. Stops any timers the last screen started. */
    const card = (inner: string) => {
      timers.forEach(clearInterval);
      timers = [];
      panel.innerHTML = `<div class="auth-brand mobile"><div class="logo">FS</div><div><b>Fast Sales</b><small>Sales City · Virtual office</small></div></div>
        ${inner}
        <p class="auth-foot">${ICON.lock}<span>${location.protocol === 'https:' ? 'Encrypted connection · ' : ''}2-step sign-in · every sign-in is logged</span></p>`;
      panel.classList.remove('enter');
      void panel.offsetWidth;
      panel.classList.add('enter');
      wireFields();
      panel.querySelector<HTMLInputElement>('input:not([type=hidden]):not([type=checkbox]):not([value]), .otp input')?.focus();
    };

    const field = (o: { label: string; name: string; icon: string; type?: string; auto?: string; value?: string; attrs?: string; aside?: string }) => `
      <label class="fld"><span class="fld-l">${o.label}${o.aside ?? ''}</span>
        <span class="fld-in">${o.icon}
          <input name="${o.name}" type="${o.type ?? 'text'}" ${o.auto ? `autocomplete="${o.auto}"` : ''} ${o.value ? `value="${esc(o.value)}"` : ''} ${o.attrs ?? ''} required>
          ${o.type === 'password' ? `<button type="button" class="peek" aria-label="Show password" tabindex="-1">${ICON.eye}</button>` : ''}
        </span>
        ${o.type === 'password' ? '<small class="caps" hidden>Caps Lock is on</small>' : ''}
      </label>`;

    const otp = (label = '6-digit code') => `<div class="otp-wrap"><span class="fld-l">${label}</span>
      <div class="otp" role="group" aria-label="${label}">${Array.from({ length: 6 }, (_, i) =>
        `<input inputmode="numeric" pattern="[0-9]*" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${i + 1}">${i === 2 ? '<i></i>' : ''}`).join('')}</div></div>`;

    const errBox = '<p class="auth-err" role="alert"></p>';

    /** Show/hide password, Caps Lock warning, and password strength on any field in the panel. */
    const wireFields = () => {
      panel.querySelectorAll<HTMLButtonElement>('.peek').forEach(b => b.addEventListener('click', () => {
        const input = b.parentElement!.querySelector('input')!;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.innerHTML = show ? ICON.eyeOff : ICON.eye;
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      }));
      panel.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => {
        const caps = input.closest('.fld')!.querySelector<HTMLElement>('.caps')!;
        const check = (e: KeyboardEvent) => { caps.hidden = !e.getModifierState?.('CapsLock'); };
        input.addEventListener('keydown', check);
        input.addEventListener('keyup', check);
        input.addEventListener('blur', () => { caps.hidden = true; });
      });
      const meter = panel.querySelector<HTMLElement>('.meter');
      if (meter) {
        const [p1, p2] = panel.querySelectorAll<HTMLInputElement>('input[name=password], input[name=password2]');
        const match = panel.querySelector<HTMLElement>('.match')!;
        const update = () => {
          const s = strength(p1!.value);
          meter.dataset.score = String(p1!.value ? s.score : 0);
          meter.querySelector('b')!.textContent = s.label;
          match.hidden = !p2!.value;
          match.className = `match ${p1!.value === p2!.value ? 'ok' : 'no'}`;
          match.innerHTML = p1!.value === p2!.value ? `${ICON.check} Passwords match` : 'Passwords don\'t match yet';
        };
        p1!.addEventListener('input', update);
        p2!.addEventListener('input', update);
      }
    };

    /** Six digit boxes: typing moves along, Backspace moves back, pasting or autofill fills them all. */
    const wireOtp = (onFull: () => void) => {
      const boxes = [...panel.querySelectorAll<HTMLInputElement>('.otp input')];
      const value = () => boxes.map(b => b.value).join('');
      boxes.forEach((b, i) => {
        b.addEventListener('focus', () => b.select());
        b.addEventListener('input', () => {
          const digits = b.value.replace(/\D/g, '');
          if (!digits) { b.value = ''; return; }
          [...digits].slice(0, 6 - i).forEach((d, k) => { boxes[i + k]!.value = d; });
          const next = Math.min(i + digits.length, 5);
          boxes[next]!.focus();
          if (/^\d{6}$/.test(value())) onFull();
        });
        b.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1]!.value = ''; boxes[i - 1]!.focus(); e.preventDefault(); }
          if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1]!.focus();
          if (e.key === 'ArrowRight' && i < 5) boxes[i + 1]!.focus();
        });
      });
      return {
        value,
        clear: () => { boxes.forEach(b => { b.value = ''; }); boxes[0]?.focus(); },
      };
    };

    /** The ring that shows when the code in the authenticator app turns over (every 30 seconds). */
    const countdown = () => {
      const ring = panel.querySelector<SVGCircleElement>('.ring circle.fg');
      const label = panel.querySelector<HTMLElement>('.ring-l');
      if (!ring || !label) return;
      const tick = () => {
        const left = 30 - Math.floor(Date.now() / 1000) % 30;
        ring.style.strokeDashoffset = String(62.8 * (1 - left / 30));
        label.textContent = `New code in ${left}s`;
      };
      tick();
      timers.push(window.setInterval(tick, 1000));
    };
    const ringHtml = '<div class="ring"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" class="bg"/><circle cx="12" cy="12" r="10" class="fg"/></svg><small class="ring-l"></small></div>';

    const fail = (e: unknown) => {
      const el = panel.querySelector<HTMLElement>('.auth-err');
      if (el) el.innerHTML = `${ICON.alert}<span>${esc(e instanceof Error ? e.message : 'Something went wrong.')}</span>`;
      panel.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach(b => { b.disabled = false; b.classList.remove('busy'); });
      panel.classList.remove('shake');
      void panel.offsetWidth;
      panel.classList.add('shake');
    };
    const busy = (form: HTMLFormElement) => {
      const b = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      b.disabled = true;
      b.classList.add('busy');
      const err = panel.querySelector<HTMLElement>('.auth-err');
      if (err) err.textContent = '';
    };
    const on = (sel: string, fn: (f: Record<string, string>, form: HTMLFormElement) => Promise<void>) => {
      panel.querySelector<HTMLFormElement>(sel)!.addEventListener('submit', e => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        if (form.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled) return;
        fn(formData(form), form).catch(fail);
      });
    };
    const link = (id: string, fn: () => void) => panel.querySelector(`#${id}`)?.addEventListener('click', e => { e.preventDefault(); fn(); });

    const leave = () => { timers.forEach(clearInterval); history.replaceState(null, '', location.pathname); done(); };
    const welcome = (name?: string, warn = '') => {
      card(`<div class="welcome"><div class="tick">${ICON.check}</div><h1>${name ? `Welcome back, ${esc(name.split(' ')[0]!)}` : 'You\'re in'}</h1>
        ${warn ? `<p class="auth-warn">${ICON.alert}<span>${esc(warn)}</span></p>` : ''}<p class="auth-sub">Opening the office…</p></div>`);
      setTimeout(leave, warn ? 3500 : 700);
    };
    const signOut = async () => {
      await api.post('/api/auth/logout').catch(() => {});
      me = { ...me, state: 'anon', user: undefined };
      password();
    };

    // ── step 1: username + password ───────────────────────────
    const password = (notice = '') => {
      const last = remembered();
      card(`${steps(['Password', 'Verify'], 0)}
        <h1>Sign in</h1>
        <p class="auth-sub">Welcome back to the Fast Sales office.</p>
        ${notice ? `<p class="auth-ok">${ICON.check}<span>${esc(notice)}</span></p>` : ''}
        <form id="f-pass" novalidate>
          ${field({ label: 'Username', name: 'username', icon: ICON.user, auto: 'username', value: last, attrs: 'autocapitalize="none" spellcheck="false"' })}
          ${field({ label: 'Password', name: 'password', icon: ICON.lock, type: 'password', auto: 'current-password', aside: '<a href="#" class="auth-link sm" id="forgot">Forgot password?</a>' })}
          ${errBox}
          <button type="submit" class="btn-gold"><span>Continue</span></button>
        </form>
        ${me.setupNeeded ? '<p class="auth-hint">First time here? Open the setup link printed in the server console.</p>' : ''}`);
      if (last) panel.querySelector<HTMLInputElement>('input[name=password]')!.focus();
      link('forgot', () => forgot());
      on('#f-pass', async (f, form) => {
        if (!f.username?.trim() || !f.password) throw new Error('Enter your username and password.');
        busy(form);
        const r = await api.post<{ next: 'code' | 'in' }>('/api/auth/login', f);
        remember(f.username.trim());
        const now = await api.me();
        me = now;
        if (r.next === 'in') return welcome(now.user?.name);
        code(false);
      });
    };

    // ── step 2: authenticator code, or a recovery code. Also the lock screen. ──
    const code = (locked: boolean) => {
      const u = me.user;
      card(`${locked ? '' : steps(['Password', 'Verify'], 1)}
        ${u ? `<div class="who${locked ? ' big' : ''}"><span class="avatar">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></div>
          <a href="#" class="auth-link sm" id="restart">${locked ? 'Sign out' : 'Not you?'}</a></div>` : ''}
        <h1>${locked ? `${ICON.lock} Office locked` : 'Two-step verification'}</h1>
        <p class="auth-sub mode-otp">Open your authenticator app and enter the 6-digit code for <b>Fast Sales Office</b>.</p>
        <p class="auth-sub mode-rec" hidden>Enter one of the recovery codes you saved when you set up your account. Each code works once.</p>
        <form id="f-code" novalidate>
          <div class="mode-otp">${otp()}${ringHtml}</div>
          <div class="mode-rec" hidden>${field({ label: 'Recovery code', name: 'recovery', icon: ICON.key, attrs: 'placeholder="ABCDE-FGHJK" autocapitalize="characters" spellcheck="false" disabled' })}</div>
          ${locked ? '' : '<label class="check"><input type="checkbox" name="remember" value="1"><span>Remember this device for 30 days</span></label>'}
          ${errBox}
          <button type="submit" class="btn-gold"><span>${locked ? 'Unlock' : 'Verify'}</span></button>
        </form>
        <a href="#" class="auth-link" id="toggle">Lost your phone? Use a recovery code</a>
        ${!u && !locked ? '<a href="#" class="auth-link sm" id="restart">Start over</a>' : ''}`);
      let rec = false;
      const boxes = wireOtp(() => panel.querySelector<HTMLFormElement>('#f-code')!.requestSubmit());
      countdown();
      link('restart', signOut);
      link('toggle', () => {
        rec = !rec;
        panel.querySelectorAll<HTMLElement>('.mode-otp').forEach(el => { el.hidden = rec; });
        panel.querySelectorAll<HTMLElement>('.mode-rec').forEach(el => { el.hidden = !rec; });
        const input = panel.querySelector<HTMLInputElement>('input[name=recovery]')!;
        input.disabled = !rec;
        panel.querySelector('#toggle')!.textContent = rec ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code';
        panel.querySelector<HTMLElement>('.auth-err')!.textContent = '';
        if (rec) input.focus(); else boxes.clear();
      });
      on('#f-code', async (f, form) => {
        const value = rec ? (f.recovery ?? '').trim() : boxes.value();
        if (rec ? !value : !/^\d{6}$/.test(value)) throw new Error(rec ? 'Enter a recovery code.' : 'Enter all 6 digits.');
        busy(form);
        try {
          const r = await api.post<{ recoveryLeft: number }>('/api/auth/verify', { code: value, remember: !!f.remember });
          welcome(u?.name, rec && r.recoveryLeft <= 3 ? `Only ${r.recoveryLeft} recovery code${r.recoveryLeft === 1 ? '' : 's'} left. Make new ones in Settings → My account.` : '');
        } catch (e) {
          if (e instanceof ApiError && e.body.restart) { me = { ...me, state: 'anon', user: undefined }; password(); fail(e); return; }
          if (!rec) boxes.clear();
          throw e;
        }
      });
    };

    // ── forgotten password ────────────────────────────────────
    const forgot = () => {
      card(`<a href="#" class="auth-link sm back" id="back">← Back to sign in</a>
        <h1>Reset your password</h1>
        <p class="auth-sub">You need your phone <b>and</b> one of your saved recovery codes. No recovery codes? Ask an admin to send you a new setup link (Settings → People → Reset).</p>
        <form id="f-reset" novalidate>
          ${field({ label: 'Username', name: 'username', icon: ICON.user, auto: 'username', value: remembered(), attrs: 'autocapitalize="none" spellcheck="false"' })}
          ${otp('6-digit code from your app')}
          ${field({ label: 'Recovery code', name: 'recovery', icon: ICON.key, attrs: 'placeholder="ABCDE-FGHJK" autocapitalize="characters" spellcheck="false"' })}
          ${field({ label: 'New password', name: 'password', icon: ICON.lock, type: 'password', auto: 'new-password', attrs: 'minlength="10"' })}
          <div class="meter" data-score="0"><i></i><i></i><i></i><i></i><b></b></div>
          ${field({ label: 'Repeat new password', name: 'password2', icon: ICON.lock, type: 'password', auto: 'new-password', attrs: 'minlength="10"' })}
          <small class="match" hidden></small>
          ${errBox}
          <button type="submit" class="btn-gold"><span>Change password</span></button>
        </form>`);
      const boxes = wireOtp(() => panel.querySelector<HTMLInputElement>('input[name=recovery]')!.focus());
      link('back', () => password());
      on('#f-reset', async (f, form) => {
        if (!f.username?.trim()) throw new Error('Enter your username.');
        if (!/^\d{6}$/.test(boxes.value())) throw new Error('Enter the 6-digit code from your app.');
        if (!f.recovery?.trim()) throw new Error('Enter one of your recovery codes.');
        if ((f.password ?? '').length < 10) throw new Error('Use at least 10 characters for your new password.');
        if (f.password !== f.password2) throw new Error('The new passwords don\'t match.');
        busy(form);
        try {
          const r = await api.post<{ recoveryLeft: number }>('/api/auth/reset-password', { username: f.username, code: boxes.value(), recovery: f.recovery, password: f.password });
          remember(f.username.trim());
          password(`Password changed. You have ${r.recoveryLeft} recovery code${r.recoveryLeft === 1 ? '' : 's'} left. Sign in with your new password.`);
        } catch (e) { boxes.clear(); throw e; }
      });
    };

    // ── first-time setup (first admin, or a link an admin sent) ──
    const ENROLL = ['Account', 'Authenticator', 'Recovery codes'];
    const enrollFlow = async (token: string) => {
      let info: { bootstrap: boolean; username?: string; name?: string };
      try { info = await api.get(`/api/auth/enroll/${encodeURIComponent(token)}`); } catch (e) {
        card(`<h1>Link expired</h1><p class="auth-sub">${esc((e as Error).message)}</p><button class="btn-gold" id="go"><span>Go to sign in</span></button>`);
        panel.querySelector('#go')!.addEventListener('click', () => { history.replaceState(null, '', location.pathname); password(); });
        return;
      }
      card(`${steps(ENROLL, 0)}
        <h1>${info.bootstrap ? 'Set up the office' : `Welcome, ${esc(info.name)}`}</h1>
        <p class="auth-sub">${info.bootstrap ? 'Create the first admin account. You can invite the rest of the team from Settings afterwards.' : `Your username is <b>${esc(info.username)}</b>. Choose a password to finish setting up your account.`}</p>
        <form id="f-enroll" novalidate>
          ${info.bootstrap ? `${field({ label: 'Your name', name: 'name', icon: ICON.user, auto: 'name', attrs: 'maxlength="60"' })}
            ${field({ label: 'Username', name: 'username', icon: ICON.user, auto: 'username', attrs: 'autocapitalize="none" spellcheck="false" maxlength="32"' })}` : ''}
          ${field({ label: 'Password', name: 'password', icon: ICON.lock, type: 'password', auto: 'new-password', attrs: 'minlength="10"' })}
          <div class="meter" data-score="0"><i></i><i></i><i></i><i></i><b></b></div>
          ${field({ label: 'Repeat password', name: 'password2', icon: ICON.lock, type: 'password', auto: 'new-password', attrs: 'minlength="10"' })}
          <small class="match" hidden></small>
          ${errBox}
          <button type="submit" class="btn-gold"><span>Next: set up 2-step sign-in</span></button>
        </form>`);
      on('#f-enroll', async (f, form) => {
        if (info.bootstrap) {
          if (!f.name?.trim()) throw new Error('Enter your name.');
          if (!/^[a-zA-Z0-9._-]{3,32}$/.test(f.username ?? '')) throw new Error('Usernames are 3–32 letters, numbers, dots, dashes or underscores.');
        }
        if ((f.password ?? '').length < 10) throw new Error('Use at least 10 characters for your password.');
        if (f.password !== f.password2) throw new Error('The passwords don\'t match.');
        busy(form);
        const r = await api.post<{ qr: string; secret: string }>('/api/auth/enroll/start', { token, ...f });
        const username = info.username ?? f.username!;
        card(`${steps(ENROLL, 1)}
          <h1>Connect your phone</h1>
          <div class="qr-row">
            <img class="qr" src="${r.qr}" alt="QR code for your authenticator app">
            <ol class="how">
              <li>Open Google Authenticator, Microsoft Authenticator, 1Password or Authy.</li>
              <li>Add an account and scan this code.</li>
              <li>Type the 6-digit code it shows below.</li>
            </ol>
          </div>
          <details class="secret"><summary>Can't scan? Enter this key instead</summary>
            <div class="secret-row"><code>${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code><button type="button" class="btn-line sm" id="copy-secret">${ICON.copy}<span>Copy</span></button></div>
          </details>
          <form id="f-confirm" novalidate>
            ${otp()}
            ${errBox}
            <button type="submit" class="btn-gold"><span>Turn on 2-step sign-in</span></button>
          </form>`);
        link('copy-secret', () => {
          navigator.clipboard?.writeText(r.secret);
          panel.querySelector('#copy-secret span')!.textContent = 'Copied';
        });
        const boxes = wireOtp(() => panel.querySelector<HTMLFormElement>('#f-confirm')!.requestSubmit());
        on('#f-confirm', async (_f2, form2) => {
          if (!/^\d{6}$/.test(boxes.value())) throw new Error('Enter all 6 digits.');
          busy(form2);
          try {
            const { codes } = await api.post<{ codes: string[] }>('/api/auth/enroll/finish', { token, code: boxes.value() });
            remember(username);
            showCodes(codes, () => welcome(info.name ?? f.name));
          } catch (e) { boxes.clear(); throw e; }
        });
      });
    };

    const showCodes = (codes: string[], next: () => void) => {
      card(`${steps(ENROLL, 2)}
        <h1>Save your recovery codes</h1>
        <p class="auth-sub">If you lose your phone, each code signs you in once and lets you reset a forgotten password. Keep them somewhere safe. They won't be shown again.</p>
        <div class="codes">${codes.map(c => `<code>${c}</code>`).join('')}</div>
        <div class="row"><button class="btn-line" id="copy">${ICON.copy}<span>Copy</span></button><button class="btn-line" id="dl">${ICON.download}<span>Download</span></button></div>
        <label class="check"><input type="checkbox" id="saved"><span>I saved my recovery codes</span></label>
        <button class="btn-gold" id="go" disabled><span>Enter the office</span></button>`);
      const text = `Fast Sales Office – recovery codes\n\n${codes.join('\n')}\n`;
      link('copy', () => { navigator.clipboard?.writeText(text); panel.querySelector('#copy span')!.textContent = 'Copied'; });
      link('dl', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = 'fast-sales-recovery-codes.txt';
        a.click();
      });
      panel.querySelector<HTMLInputElement>('#saved')!.addEventListener('change', e => {
        panel.querySelector<HTMLButtonElement>('#go')!.disabled = !(e.target as HTMLInputElement).checked;
      });
      panel.querySelector('#go')!.addEventListener('click', next);
    };

    if (enroll) enrollFlow(enroll);
    else if (me.state === 'code') code(false);
    else if (me.state === 'locked') code(true);
    else password();
  });
}
