'use client';

// Full-screen mode for the office. Where the browser allows it (Fullscreen API) the office takes over the whole
// screen; everywhere else, such as iPhone Safari which cannot fullscreen an element, a CSS "immersive" mode fills the
// viewport and hides the site's own header and footer. Both are the same state to the page: `immersive`.
import { useCallback, useEffect, useState, type RefObject } from 'react';

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

const doc = (): FullscreenDocument => document as FullscreenDocument;
const nativeElement = (): Element | null => doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

async function requestNative(el: FullscreenElement): Promise<boolean> {
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false; // refused (for example by a permissions policy): the CSS mode still works
  }
}

async function exitNative(): Promise<void> {
  try {
    if (!nativeElement()) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // already out
  }
}

/** The page behind the office must not be reachable by keyboard or screen reader while it is covered. */
function setBackgroundInert(shell: HTMLElement | null, on: boolean) {
  const parent = shell?.parentElement;
  if (!parent) return;
  for (const el of Array.from(parent.children)) {
    if (el !== shell) (el as HTMLElement).inert = on;
  }
}

export function useImmersive(shell: RefObject<HTMLElement | null>) {
  const [immersive, setImmersive] = useState(false);
  const [native, setNative] = useState(false);

  const enter = useCallback(async () => {
    setImmersive(true);
    const el = shell.current as FullscreenElement | null;
    setNative(el ? await requestNative(el) : false);
  }, [shell]);

  const exit = useCallback(async () => {
    setImmersive(false);
    setNative(false);
    await exitNative();
  }, []);

  // The browser's own exit (Escape, a swipe, F11) arrives as an event; keep the page in step with it.
  useEffect(() => {
    const onChange = () => {
      if (!nativeElement()) {
        setNative(false);
        setImmersive(current => (current && native ? false : current));
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [native]);

  // CSS mode has no browser Escape, so provide it. A popover or dialog inside gets Escape first.
  useEffect(() => {
    if (!immersive || native) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"], [data-popover]')) return;
      e.preventDefault();
      e.stopPropagation();
      void exit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [immersive, native, exit]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dm-immersive-lock', immersive);
    setBackgroundInert(shell.current, immersive);
    return () => {
      root.classList.remove('dm-immersive-lock');
      setBackgroundInert(shell.current, false);
    };
  }, [immersive, shell]);

  return { immersive, native, enter, exit };
}
