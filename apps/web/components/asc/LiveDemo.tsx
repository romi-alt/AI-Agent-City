'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

// The sign-in dialog and the switch for the live demo. The demo itself (the 3D city and its controls) is a separate
// chunk that is downloaded only after a visitor signs in.
const DemoApp = dynamic(() => import('./DemoApp'), { ssr: false, loading: () => null });

const LOGIN_KEY = 'asc-demo';
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private mode: nothing remembered */
    }
  },
};

export function LiveDemo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [booted, setBooted] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const openDemo = useCallback(() => {
    setBooted(true);
    setOpen(true);
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new CustomEvent('asc:demo', { detail: { open: true } }));
  }, []);
  const closeDemo = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = '';
    window.dispatchEvent(new CustomEvent('asc:demo', { detail: { open: false } }));
    opener.current?.focus();
  }, []);

  // Every "live demo" button and link on the page (server-rendered, marked data-open-demo).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-open-demo]');
      if (!el) return;
      e.preventDefault();
      opener.current = el;
      if (store.get(LOGIN_KEY) === '1') openDemo();
      else {
        setError('');
        dialog.current?.showModal();
      }
    };
    document.addEventListener('click', onClick);
    if (location.hash === '#live-demo' && store.get(LOGIN_KEY) === '1') openDemo();
    return () => {
      document.removeEventListener('click', onClick);
      document.body.style.overflow = '';
    };
  }, [openDemo]);

  return (
    <>
      <dialog
        className="dl"
        id="demoLogin"
        ref={dialog}
        aria-labelledby="dlTitle"
        onClick={e => e.target === dialog.current && dialog.current?.close()}
      >
        <form
          id="dlForm"
          autoComplete="off"
          onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (String(f.get('user')).trim().toLowerCase() === 'demo' && f.get('pw') === 'autosales') {
              store.set(LOGIN_KEY, '1');
              dialog.current?.close();
              openDemo();
            } else setError('Use the public demo login: demo / autosales');
          }}
        >
          <button className="x" type="button" id="dlClose" aria-label="Close" onClick={() => dialog.current?.close()}>
            ✕
          </button>
          <span className="eyebrow">AutoSalesCity · live demo</span>
          <h3 id="dlTitle">Sign in to the demo city</h3>
          <div className="demo-creds">
            <span>Public demo login</span>
            <b>
              Username: <code>demo</code>
            </b>
            <b>
              Password: <code>autosales</code>
            </b>
          </div>
          <label htmlFor="dlUser">Username</label>
          <input id="dlUser" name="user" defaultValue="demo" autoCapitalize="none" spellCheck={false} required />
          <label htmlFor="dlPw">Password</label>
          <input id="dlPw" name="pw" type="password" defaultValue="autosales" required />
          <button className="btn primary" type="submit" style={{ justifyContent: 'center', marginTop: 8 }}>
            Enter the demo city →
          </button>
          <p className="err" id="dlErr" role="alert">
            {error}
          </p>
          <p className="fine">Demo only: buildings, people, cars and numbers are fictional. No real customer data.</p>
        </form>
      </dialog>
      {booted && <DemoApp open={open} onClose={closeDemo} />}
    </>
  );
}
