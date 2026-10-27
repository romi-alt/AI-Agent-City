'use client';
import { useEffect } from 'react';

/**
 * Fades [data-reveal] elements in as they scroll into view. Content is never hidden without this script: the CSS
 * only hides elements once <html> carries data-reveal-ready, and reduced motion skips it entirely.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute('data-in', '');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    // Anything already on screen is shown immediately, so the first view never flashes.
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute('data-in', '');
      else io.observe(el);
    }
    document.documentElement.setAttribute('data-reveal-ready', '');
    return () => io.disconnect();
  }, []);
  return null;
}
