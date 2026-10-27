export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const money = (n: number) => (n ? `$${n.toLocaleString()}` : '—');
export function age(min: number) {
  if (min < 60) return `${Math.max(0, Math.round(min))}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}
export function hhmm(min: number) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
export function fromHHMM(s: string) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }

let toastTimer: number | undefined;
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  let el = document.querySelector<HTMLElement>('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = text;
  el.className = `toast ${kind} show`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3200);
}

/** Is the person typing inside this element? Then don't re-render it underneath them. */
export function editing(el: Element | null) {
  const a = document.activeElement;
  return !!el && !!a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

export function formData(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
