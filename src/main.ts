import './style.css';
import { api } from './api';
import { App } from './ui/app';
import { signIn } from './ui/login';

const root = document.querySelector<HTMLElement>('#app')!;
try { document.documentElement.dataset.theme = localStorage.getItem('fs-theme') ?? 'light'; } catch { document.documentElement.dataset.theme = 'light'; }

async function boot() {
  const me = await api.me();
  if (me.state !== 'in' || new URLSearchParams(location.search).has('enroll')) await signIn(root, me);
  root.innerHTML = '<div class="auth"><p class="muted">Opening the office…</p></div>';
  const state = await api.state();
  // A client account whose client owns no buildings yet has nothing to show.
  if (!state.snapshot.buildings.length) {
    root.innerHTML = `<div class="empty-scope"><div><h2>Nothing to show yet</h2>
      <p class="muted">Your account isn't linked to any buildings yet. Ask the agency to add your buildings to your client.</p>
      <button class="btn-line" id="out">Sign out</button></div></div>`;
    root.querySelector('#out')!.addEventListener('click', async () => { await api.post('/api/auth/logout').catch(() => {}); location.reload(); });
    return;
  }
  // Signing out or locking reloads into the sign-in screen.
  new App(root, state, () => location.reload());
}

boot().catch(e => {
  root.innerHTML = `<div class="auth"><div class="auth-card"><h1>Can't reach the office</h1><p class="auth-sub"></p><button class="btn-gold" id="retry">Try again</button></div></div>`;
  // The error text can echo server or user input, so it is set as text, not HTML.
  root.querySelector('.auth-sub')!.textContent = String(e?.message ?? e);
  root.querySelector('#retry')!.addEventListener('click', () => location.reload());
});
