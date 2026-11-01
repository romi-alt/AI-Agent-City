'use client';

import { useEffect } from 'react';
import '../../components/asc/asc.css';
import { DemoOverlay } from '../../components/asc/DemoOverlay';
import { initDemo } from '../../components/asc/demo-app';

/**
 * /city is the live demo city without the front page behind it: the same scene the "Live demo" button opens, started
 * straight away. The demo login is for the full demo overlay on the front page; the city itself is public, so the
 * visit is marked as signed in. Closing the overlay goes back to the front page.
 */
export function AscCity() {
  useEffect(() => {
    try {
      sessionStorage.setItem('asc-demo', '1');
    } catch {
      // storage blocked: the login dialog simply shows
    }
    const stop = initDemo();
    const onState = (e: Event) => {
      if (!(e as CustomEvent<{ open: boolean }>).detail?.open) window.location.assign('/');
    };
    window.addEventListener('asc:demo', onState);
    document.getElementById('cityOpen')?.click();
    return () => {
      window.removeEventListener('asc:demo', onState);
      stop();
    };
  }, []);
  return (
    <div className="asc" style={{ minHeight: '100vh', background: '#070a12' }}>
      <a id="cityOpen" href="#live-demo" data-open-demo hidden>
        Open the city
      </a>
      <DemoOverlay />
    </div>
  );
}
