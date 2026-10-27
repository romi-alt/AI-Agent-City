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
  // Signing out or locking reloads into the sign-in screen.
  new App(root, state, () => location.reload());
}

boot().catch(e => {
  root.innerHTML = `<div class="auth"><div class="auth-card"><h1>Can't reach the office</h1><p class="auth-sub">${String(e?.message ?? e)}</p><button class="btn-gold" onclick="location.reload()">Try again</button></div></div>`;
});
