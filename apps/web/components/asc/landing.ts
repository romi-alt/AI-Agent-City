import { BUYERS, CLIENTS, VEHICLES, type Client } from './data';

// Behaviour of the front page outside the 3D scenes: the nav, scroll-in effects, count-ups, the agent cards' tilt and
// the simulated city feed in the hero. Works on the markup AscPage renders; returns a cleanup for React.

export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);

export interface Hud {
  /** One simulated sales event for a client building: updates the counters and adds a line to the feed. */
  cityEvent: (client: Client) => void;
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function countUp(el: HTMLElement, reduced: boolean, stopped: () => boolean) {
  const to = Number(el.dataset.count);
  const pre = el.dataset.prefix ? el.dataset.prefix.replace('&lt;', '<') : '';
  const suf = el.dataset.suffix || '';
  if (reduced) {
    el.textContent = pre + to.toLocaleString() + suf;
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    if (stopped()) return;
    const k = Math.min(1, (t - t0) / 1600);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = pre + Math.round(to * e).toLocaleString() + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initLanding(): { hud: Hud; dispose: () => void } {
  const reduced = prefersReducedMotion();
  let stopped = false;
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(
    k: K,
    fn: (e: WindowEventMap[K]) => void,
    o?: AddEventListenerOptions,
  ) => {
    window.addEventListener(k, fn, o);
    cleanups.push(() => window.removeEventListener(k, fn));
  };

  // nav turns glassy after a little scrolling
  const nav = $('#nav');
  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 30);
  onScroll();
  on('scroll', onScroll, { passive: true });

  // agent cards tilt toward the pointer (not for touch or reduced motion)
  if (!reduced && matchMedia('(hover:hover)').matches) {
    document.querySelectorAll<HTMLElement>('.asc .agent').forEach(el => {
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateY(-4px)`;
      };
      const leave = () => {
        el.style.transform = '';
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
        leave();
      });
    });
  }

  // scroll-in effects, count-ups and the control-room bars
  const io = new IntersectionObserver(
    entries =>
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const target = e.target as HTMLElement;
        target.classList.add('in');
        target.querySelectorAll<HTMLElement>('[data-count]').forEach(n => countUp(n, reduced, () => stopped));
        if (target.id === 'screen') {
          target.querySelectorAll<HTMLElement>('.fill').forEach((f, i) =>
            setTimeout(
              () => {
                f.style.width = `${f.dataset.w}%`;
              },
              200 + i * 120,
            ),
          );
        }
        io.unobserve(target);
      }),
    { threshold: 0.18 },
  );
  document.querySelectorAll('.asc .reveal').forEach(el => io.observe(el));
  cleanups.push(() => io.disconnect());

  // hero HUD (simulated, and labelled as such on the page)
  const S = {
    leads: 214 + Math.floor(Math.random() * 40),
    booked: 37 + Math.floor(Math.random() * 9),
    replies: [] as number[],
  };
  for (let i = 0; i < 20; i++) S.replies.push(28 + Math.random() * 26);
  const setStats = () => {
    const leads = $('#sLeads');
    const booked = $('#sBooked');
    const reply = $('#sReply');
    if (leads) leads.textContent = S.leads.toLocaleString();
    if (booked) booked.textContent = String(S.booked);
    const avg = S.replies.length ? S.replies.reduce((a, b) => a + b, 0) / S.replies.length : 0;
    if (reply) reply.textContent = `${Math.round(avg)}s`;
  };
  const animate = (el: HTMLElement | null, to: number, suffix = '') => {
    if (!el) return;
    if (reduced) {
      el.textContent = to + suffix;
      return;
    }
    const t0 = performance.now();
    const step = (t: number) => {
      if (stopped) return;
      const k = Math.min(1, (t - t0) / 1800);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString() + suffix;
      if (k < 1) requestAnimationFrame(step);
      else setStats();
    };
    requestAnimationFrame(step);
  };
  animate($('#sLeads'), S.leads);
  animate($('#sBooked'), S.booked);
  animate($('#sReply'), Math.round(S.replies.reduce((a, b) => a + b, 0) / S.replies.length), 's');

  const feed = (bold: string, rest: string, color: string) => {
    const ul = $('#feed');
    if (!ul) return;
    const li = document.createElement('li');
    li.style.setProperty('--c', color);
    const dot = document.createElement('i');
    const span = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = bold;
    span.append(b, ` ${rest}`);
    li.append(dot, span);
    ul.prepend(li);
    while (ul.children.length > 4) ul.lastElementChild?.remove();
  };
  const tickClock = () => {
    const c = $('#clock');
    if (c) c.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  tickClock();
  const clockTimer = setInterval(tickClock, 15000);
  cleanups.push(() => clearInterval(clockTimer));

  const [bayside, coastline] = [CLIENTS[1]!, CLIENTS[2]!];
  feed('Max', `sent the morning pipeline report to ${bayside.name}`, bayside.color);
  feed('Test drive booked', `· ${pick(BUYERS)} · ${pick(VEHICLES)} · ${coastline.name.split(' ')[0]}`, '#3ccf8e');
  feed('Vera', `replied to ${pick(BUYERS)} about a ${pick(VEHICLES)} · Bayside · 31s`, bayside.color);

  const cityEvent = (client: Client) => {
    const kind = Math.random();
    const secs = Math.round(24 + Math.random() * 34);
    const short = client.name.split(' ')[0] ?? client.name;
    if (kind < 0.62) {
      S.leads++;
      S.replies.push(secs);
      if (S.replies.length > 60) S.replies.shift();
      feed('Vera', `replied to ${pick(BUYERS)} about a ${pick(VEHICLES)} · ${short} · ${secs}s`, client.color);
    } else if (kind < 0.85) {
      S.booked++;
      feed('Test drive booked', `· ${pick(BUYERS)} · ${pick(VEHICLES)} · ${short}`, '#3ccf8e');
    } else {
      feed('Nico', `revived an aged lead for ${short}`, client.color);
    }
    setStats();
  };

  return {
    hud: { cityEvent },
    dispose: () => {
      stopped = true;
      cleanups.forEach(fn => fn());
    },
  };
}
