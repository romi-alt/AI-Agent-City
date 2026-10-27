import { api, ApiError, type Me } from '../api';
import { esc, formData } from './util';

/**
 * Sign-in screens: password → 6-digit authenticator code (or a recovery code), first-time enrollment
 * with a QR code, and the lock screen. Resolves once the person is fully signed in.
 */
export function signIn(root: HTMLElement, me: Me): Promise<void> {
  return new Promise(done => {
    const enroll = new URLSearchParams(location.search).get('enroll');
    const card = (inner: string) => {
      root.innerHTML = `<div class="auth"><div class="auth-card">
        <div class="auth-brand"><div class="logo">FS</div><span>FAST SALES · VIRTUAL OFFICE</span></div>
        ${inner}
        <p class="auth-foot">🔒 ${location.protocol === 'https:' ? 'Encrypted connection · ' : ''}2-step sign-in · every sign-in is logged</p>
      </div></div>`;
      root.querySelector<HTMLInputElement>('input')?.focus();
    };
    const fail = (e: unknown) => {
      const el = root.querySelector<HTMLElement>('.auth-err');
      if (el) el.textContent = e instanceof Error ? e.message : 'Something went wrong.';
      root.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach(b => { b.disabled = false; b.textContent = b.dataset.label ?? b.textContent; });
      return e;
    };
    const busy = (form: HTMLFormElement, text: string) => {
      const b = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      b.dataset.label = b.textContent ?? '';
      b.disabled = true;
      b.textContent = text;
      root.querySelector<HTMLElement>('.auth-err')!.textContent = '';
    };
    const on = (sel: string, fn: (f: Record<string, string>, form: HTMLFormElement) => Promise<void>) => {
      root.querySelector<HTMLFormElement>(sel)!.addEventListener('submit', e => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        fn(formData(form), form).catch(fail);
      });
    };
    const leave = () => { history.replaceState(null, '', location.pathname); done(); };
    // Six digits typed or pasted into any code box submits it.
    root.addEventListener('input', e => {
      const el = e.target as HTMLInputElement;
      if (el.classList.contains('code') && /^\d{6}$/.test(el.value.replace(/\s/g, ''))) el.form?.requestSubmit();
    });

    // ── password ──────────────────────────────────────────────
    const password = () => {
      card(`<h1>Sign in</h1><p class="auth-sub">Welcome to the Fast Sales office.</p>
        <form id="f-pass">
          <label>Username<input name="username" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit" class="btn-gold">Continue</button>
          <p class="auth-err"></p>
        </form>
        ${me.setupNeeded ? '<p class="auth-hint">First time here? Use the setup link printed in the server console.</p>' : ''}`);
      on('#f-pass', async f => {
        busy(root.querySelector('#f-pass')!, 'Checking…');
        const r = await api.post<{ next: 'code' | 'in' }>('/api/auth/login', f);
        if (r.next === 'in') return leave();
        code(false);
      });
    };

    // ── authenticator code (also unlocks a locked screen) ─────
    const code = (locked: boolean) => {
      card(`<h1>${locked ? 'Office locked' : 'Enter your code'}</h1>
        <p class="auth-sub">Open your authenticator app and type the 6-digit code for <b>Fast Sales Office</b>.</p>
        <form id="f-code">
          <label>6-digit code<input name="code" class="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="11" required></label>
          ${locked ? '' : '<label class="check"><input type="checkbox" name="remember" value="1"> Remember this device for 30 days</label>'}
          <button type="submit" class="btn-gold">${locked ? 'Unlock' : 'Verify'}</button>
          <p class="auth-err"></p>
        </form>
        <p class="auth-hint">Lost your phone? Type one of your recovery codes (like ABCDE-FGHJK) instead.</p>
        <button class="auth-link" id="restart">${locked ? 'Sign out' : 'Start over'}</button>`);
      const input = root.querySelector<HTMLInputElement>('.code')!;
      on('#f-code', async (f, form) => {
        busy(form, 'Checking…');
        try {
          await api.post('/api/auth/verify', { code: f.code, remember: !!f.remember });
          leave();
        } catch (e) {
          if (e instanceof ApiError && e.body.restart) { password(); throw e; }
          input.select();
          throw e;
        }
      });
      root.querySelector('#restart')!.addEventListener('click', async () => {
        await api.post('/api/auth/logout').catch(() => {});
        me = { ...me, state: 'anon' };
        password();
      });
    };

    // ── first-time setup ──────────────────────────────────────
    const enrollFlow = async (token: string) => {
      let info: { bootstrap: boolean; username?: string; name?: string };
      try { info = await api.get(`/api/auth/enroll/${encodeURIComponent(token)}`); } catch (e) {
        card(`<h1>Link expired</h1><p class="auth-sub">${esc((e as Error).message)}</p><button class="btn-gold" id="go">Go to sign in</button>`);
        root.querySelector('#go')!.addEventListener('click', () => { history.replaceState(null, '', location.pathname); password(); });
        return;
      }
      card(`<h1>${info.bootstrap ? 'Set up the office' : `Welcome, ${esc(info.name)}`}</h1>
        <p class="auth-sub">${info.bootstrap ? 'Create the first admin account.' : `Your username is <b>${esc(info.username)}</b>. Choose a password.`}</p>
        <form id="f-enroll">
          ${info.bootstrap ? '<label>Your name<input name="name" required maxlength="60"></label><label>Username<input name="username" required pattern="[a-zA-Z0-9._\\-]{3,32}" autocomplete="username"></label>' : ''}
          <label>Password (10+ characters)<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
          <label>Repeat password<input name="password2" type="password" minlength="10" required autocomplete="new-password"></label>
          <button type="submit" class="btn-gold">Next: set up 2-step sign-in</button>
          <p class="auth-err"></p>
        </form>`);
      on('#f-enroll', async (f, form) => {
        if (f.password !== f.password2) throw new Error('The passwords don\'t match.');
        busy(form, 'Saving…');
        const r = await api.post<{ qr: string; secret: string }>('/api/auth/enroll/start', { token, ...f });
        card(`<h1>Scan this code</h1>
          <p class="auth-sub">In Google Authenticator, Microsoft Authenticator, 1Password or Authy, add an account and scan:</p>
          <img class="qr" src="${r.qr}" alt="QR code for your authenticator app">
          <details class="secret"><summary>Can't scan? Enter this key</summary><code>${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></details>
          <form id="f-confirm">
            <label>Then type the 6-digit code it shows<input name="code" class="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="7" required></label>
            <button type="submit" class="btn-gold">Turn on 2-step sign-in</button>
            <p class="auth-err"></p>
          </form>`);
        on('#f-confirm', async (f2, form2) => {
          busy(form2, 'Checking…');
          const { codes } = await api.post<{ codes: string[] }>('/api/auth/enroll/finish', { token, code: f2.code });
          showCodes(codes, leave);
        });
      });
    };

    const showCodes = (codes: string[], next: () => void) => {
      card(`<h1>Save your recovery codes</h1>
        <p class="auth-sub">If you lose your phone, each of these codes signs you in once. Store them somewhere safe – they won't be shown again.</p>
        <div class="codes">${codes.map(c => `<code>${c}</code>`).join('')}</div>
        <div class="row"><button class="btn-line" id="copy">Copy</button><button class="btn-line" id="dl">Download</button></div>
        <label class="check"><input type="checkbox" id="saved"> I saved my recovery codes</label>
        <button class="btn-gold" id="go" disabled>Enter the office</button>`);
      const text = `Fast Sales Office – recovery codes\n\n${codes.join('\n')}\n`;
      root.querySelector('#copy')!.addEventListener('click', () => navigator.clipboard?.writeText(text));
      root.querySelector('#dl')!.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = 'fast-sales-recovery-codes.txt';
        a.click();
      });
      root.querySelector<HTMLInputElement>('#saved')!.addEventListener('change', e => {
        root.querySelector<HTMLButtonElement>('#go')!.disabled = !(e.target as HTMLInputElement).checked;
      });
      root.querySelector('#go')!.addEventListener('click', next);
    };

    if (enroll) enrollFlow(enroll);
    else if (me.state === 'code') code(false);
    else if (me.state === 'locked') code(true);
    else password();
  });
}

