'use client';
import { useEffect } from 'react';

/** Marks the site header as scrolled, so it turns from a translucent bar over the hero into a solid one. */
export function HeaderScroll() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.mk-site-header');
    if (!header) return;
    const update = () => header.toggleAttribute('data-scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return null;
}
