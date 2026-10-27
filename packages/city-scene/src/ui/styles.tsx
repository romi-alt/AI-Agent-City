/**
 * HUD styles, shipped with the components (one <style> per page) so every host page gets the same look without
 * importing CSS from a package. Class names are prefixed `ac-` to stay out of the host's way.
 */
export const HUD_CSS = `
.ac-hud, .ac-city-page, .ac-map2d { --ac-bg: rgba(13, 24, 40, 0.84); --ac-bg-solid: #0f1b2d; --ac-line: rgba(246, 243, 236, 0.14);
  --ac-fg: #f6f3ec; --ac-muted: #b4c0cf; --ac-gold: #f5b335; --ac-teal: #1f8a8a; --ac-sky: #6fb7e8; --ac-coral: #ff7a5c;
  --ac-radius: 14px; --ac-shadow: 0 18px 50px rgba(5, 10, 20, 0.35); }
.ac-city-page { position: fixed; inset: 0; max-width: none; margin: 0; padding: 0; display: block; background: #0f1b2d; color: #f6f3ec; overflow: hidden; }
.ac-hud { position: absolute; inset: 0; pointer-events: none; font: 15px/1.45 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ac-fg); z-index: 40; }
.ac-hud > * { pointer-events: auto; }
.ac-hud button, .ac-map2d button, .ac-hud a.ac-btn, .ac-map2d a.ac-btn, .ac-desk-tag { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ac-glass { background: var(--ac-bg); border: 1px solid var(--ac-line); border-radius: var(--ac-radius); box-shadow: var(--ac-shadow);
  -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); }
.ac-hud :focus-visible, .ac-map2d :focus-visible, .ac-desk-tag:focus-visible { outline: 3px solid var(--ac-gold); outline-offset: 2px; }
.ac-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 16px; border-radius: 10px;
  border: 1px solid var(--ac-line); background: rgba(246, 243, 236, 0.06); color: var(--ac-fg); text-decoration: none; font-weight: 600; line-height: 1.2; }
.ac-btn:hover { background: rgba(246, 243, 236, 0.14); }
.ac-btn svg { width: 18px; height: 18px; flex: none; }
.ac-btn:disabled { opacity: 0.4; cursor: default; }
.ac-panel h2:focus { outline: none; }
.ac-btn.ac-primary { background: var(--ac-gold); border-color: var(--ac-gold); color: #1a1408; }
.ac-btn.ac-primary:hover { background: #ffc552; }
.ac-btn.ac-quiet { background: transparent; border-color: transparent; color: var(--ac-muted); padding-inline: 10px; }
.ac-btn.ac-quiet:hover { color: var(--ac-fg); background: rgba(246, 243, 236, 0.08); }
.ac-icon-btn { width: 44px; height: 44px; padding: 0; display: inline-grid; place-items: center; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--ac-fg); }
.ac-icon-btn:hover { background: rgba(246, 243, 236, 0.12); }
.ac-icon-btn[aria-pressed="true"], .ac-icon-btn[aria-expanded="true"] { background: rgba(245, 179, 53, 0.18); color: var(--ac-gold); }
.ac-icon-btn svg { width: 20px; height: 20px; }

/* Top bar: breadcrumb on the left, view settings on the right. */
.ac-top { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.ac-top > * { pointer-events: auto; }
.ac-brandbar { display: flex; align-items: center; gap: 4px; padding: 4px 6px 4px 14px; min-height: 52px; max-width: min(720px, 100%); }
.ac-brand { font-weight: 800; letter-spacing: 0.02em; margin-right: 8px; white-space: nowrap; color: var(--ac-fg); text-decoration: none; }
.ac-brand span { color: var(--ac-gold); }
.ac-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.ac-crumbs li { display: flex; align-items: center; min-width: 0; }
.ac-crumbs li + li::before { content: "›"; color: var(--ac-muted); padding: 0 4px; }
.ac-crumbs button { border: 0; background: transparent; color: var(--ac-muted); padding: 8px 8px; border-radius: 8px; min-height: 40px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.ac-crumbs button:hover { color: var(--ac-fg); background: rgba(246, 243, 236, 0.08); }
.ac-crumbs [aria-current="page"] { color: var(--ac-fg); font-weight: 700; padding: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.ac-tools { display: flex; gap: 4px; padding: 4px; }

/* Popovers (view settings, keyboard help). */
.ac-pop { position: absolute; top: 64px; right: 0; width: min(340px, calc(100vw - 32px)); padding: 16px; display: grid; gap: 14px; z-index: 5; }
.ac-pop h2 { font-size: 16px; margin: 0; }
.ac-field { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; min-width: 0; }
.ac-field legend { font-size: 13px; color: var(--ac-muted); padding: 0; margin-bottom: 6px; font-weight: 600; }
.ac-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; background: rgba(246, 243, 236, 0.06); padding: 4px; border-radius: 10px; }
.ac-seg label { position: relative; display: grid; place-items: center; min-height: 40px; padding: 4px 6px; border-radius: 8px; font-size: 13px; text-align: center; cursor: pointer; color: var(--ac-muted); }
.ac-seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.ac-seg input:checked + span { color: #1a1408; }
.ac-seg label:has(input:checked) { background: var(--ac-gold); color: #1a1408; font-weight: 700; }
.ac-seg label:has(input:focus-visible) { outline: 3px solid var(--ac-gold); outline-offset: 2px; }
.ac-check { display: flex; align-items: center; gap: 10px; min-height: 40px; cursor: pointer; }
.ac-check input { width: 20px; height: 20px; accent-color: var(--ac-gold); }
.ac-keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 14px; }
.ac-keys dt { color: var(--ac-gold); font-weight: 700; white-space: nowrap; }
.ac-keys dd { margin: 0; color: var(--ac-muted); }

/* Camera controls, bottom left. */
.ac-cam { position: absolute; left: 16px; bottom: 16px; display: grid; grid-template-columns: repeat(3, 44px); gap: 2px; padding: 6px; }
.ac-cam .ac-wide { grid-column: span 3; width: auto; display: flex; gap: 6px; font-size: 13px; font-weight: 600; }

/* Side panel (desktop) / bottom sheet (phones). */
.ac-panel { position: absolute; top: 84px; right: 16px; bottom: 16px; width: min(380px, calc(100vw - 32px)); display: flex; flex-direction: column; overflow: hidden; }
.ac-panel-scroll { overflow-y: auto; padding: 20px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-content: start; overscroll-behavior: contain; }
.ac-panel-head { display: grid; gap: 4px; }
.ac-kicker { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ac-gold); font-weight: 700; }
.ac-panel h2 { margin: 0; font-size: 22px; line-height: 1.2; outline: none; }
.ac-panel p { margin: 0; color: var(--ac-muted); }
.ac-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ac-chips li { font-size: 13px; padding: 4px 10px; border-radius: 999px; background: rgba(246, 243, 236, 0.08); color: var(--ac-fg); }
.ac-note { font-size: 14px; padding: 10px 12px; border-radius: 10px; background: rgba(111, 183, 232, 0.12); border: 1px solid rgba(111, 183, 232, 0.25); color: var(--ac-fg); }
.ac-note.ac-gold { background: rgba(245, 179, 53, 0.12); border-color: rgba(245, 179, 53, 0.35); }
.ac-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ac-actions .ac-btn { flex: 1 1 auto; }
.ac-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ac-list h3 { font-size: 13px; margin: 12px 0 4px; color: var(--ac-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.ac-row { width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; text-align: left; min-height: 48px; padding: 8px 12px;
  border-radius: 10px; border: 1px solid transparent; background: rgba(246, 243, 236, 0.04); color: var(--ac-fg); }
.ac-row:hover, .ac-row:focus-visible { background: rgba(246, 243, 236, 0.1); }
.ac-row[aria-current="true"], .ac-row[aria-pressed="true"] { border-color: var(--ac-gold); background: rgba(245, 179, 53, 0.12); }
.ac-row .ac-lvl { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--ac-gold); min-width: 2.2em; }
.ac-row small { display: block; color: var(--ac-muted); font-size: 13px; }
.ac-row .ac-meta { color: var(--ac-muted); font-size: 13px; white-space: nowrap; }
.ac-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #9aa5b1; flex: none; }
.ac-swatch { width: 14px; height: 14px; border-radius: 4px; display: inline-block; flex: none; }
.ac-agent { display: grid; gap: 8px; padding: 14px; border-radius: 12px; background: rgba(246, 243, 236, 0.06); border: 1px solid var(--ac-line); }
.ac-agent h3 { margin: 0; font-size: 18px; }
.ac-sheet-handle { display: none; }

/* Arrival. */
.ac-arrival { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: grid; justify-items: center; gap: 14px; text-align: center; width: min(520px, calc(100vw - 32px)); }
.ac-arrival-title { margin: 0; font-size: clamp(26px, 4vw, 40px); font-weight: 800; letter-spacing: -0.01em; text-shadow: 0 2px 24px rgba(5, 10, 20, 0.6); }
.ac-arrival-sub { margin: 0; color: #e6e9ee; text-shadow: 0 1px 12px rgba(5, 10, 20, 0.7); }
.ac-progress { width: 180px; height: 3px; border-radius: 3px; background: rgba(246, 243, 236, 0.25); overflow: hidden; }
.ac-progress i { display: block; height: 100%; background: var(--ac-gold); transform-origin: left; }

/* The focusable scene region (keyboard camera); shows a ring only when focused. */
.ac-scene-focus { position: absolute; inset: 0; pointer-events: none; border-radius: 0; z-index: 1; }
.ac-scene-focus:focus-visible { outline: 3px solid var(--ac-gold); outline-offset: -3px; }
.ac-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* Labels in the 3D scene. */
.ac-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
.ac-label { position: absolute; left: 0; top: 0; will-change: transform; margin-top: -6px; }
.ac-labels .ac-desk-tag { pointer-events: auto; }
.ac-callout { display: grid; gap: 2px; text-align: center; padding: 8px 14px; border-radius: 12px; background: rgba(15, 27, 45, 0.88); color: #f6f3ec;
  border: 1px solid rgba(245, 179, 53, 0.6); white-space: nowrap; font: 600 14px/1.3 system-ui, sans-serif; box-shadow: 0 8px 30px rgba(5, 10, 20, 0.4); }
.ac-callout-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #f5b335; }
.ac-desk-tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; min-height: 32px; border-radius: 999px; border: 1px solid rgba(246, 243, 236, 0.25);
  background: rgba(15, 27, 45, 0.86); color: #f6f3ec; font: 600 13px/1.1 system-ui, sans-serif; white-space: nowrap; cursor: pointer; box-shadow: 0 6px 18px rgba(5, 10, 20, 0.35); }
.ac-desk-tag span { color: #b4c0cf; font-weight: 500; }
.ac-desk-tag.is-selected { background: #f5b335; color: #1a1408; border-color: #f5b335; }
.ac-desk-tag.is-selected span { color: #3b2b05; }

/* Loading and errors. */
.ac-veil { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 40%, #1a2c47 0%, #0f1b2d 70%); color: #f6f3ec; z-index: 60; transition: opacity 0.6s ease; }
.ac-veil[data-done="true"] { opacity: 0; pointer-events: none; }
.ac-veil-box { display: grid; gap: 14px; justify-items: center; text-align: center; padding: 24px; font: 16px/1.5 system-ui, sans-serif; }
.ac-veil-box .ac-progress { width: 220px; }
.ac-veil-box strong { font-size: 20px; }
.ac-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: #0f1b2d; color: #f6f3ec; font: 16px/1.5 system-ui, sans-serif; z-index: 70; }
.ac-error > div { max-width: 520px; display: grid; gap: 14px; }
.ac-error h1 { margin: 0; font-size: 26px; }
.ac-error p { margin: 0; color: #b4c0cf; }

/* The 2D city (no WebGL). */
.ac-map2d { min-height: 100%; background: #0f1b2d; color: var(--ac-fg); font: 15px/1.5 "Inter", system-ui, sans-serif; display: grid; grid-template-columns: minmax(0, 1fr) min(400px, 100%); gap: 20px; padding: 20px; box-sizing: border-box; }
.ac-map2d header { grid-column: 1 / -1; display: grid; gap: 6px; }
.ac-map2d header h1 { margin: 0; font-size: 26px; color: var(--ac-fg); }
.ac-map2d header p { margin: 0; color: var(--ac-muted); }
.ac-map2d svg.ac-map-svg { width: 100%; height: auto; display: block; border-radius: var(--ac-radius); background: #13243b; border: 1px solid var(--ac-line); }
.ac-map2d .ac-panel { position: static; width: auto; max-height: none; }
.ac-map-lot { cursor: pointer; }
.ac-map-lot rect { transition: fill 0.2s ease; }
.ac-map-lot:hover rect, .ac-map-lot:focus-visible rect { stroke: #f5b335; stroke-width: 1.2; }
.ac-map-lot[aria-current="true"] rect { stroke: #f5b335; stroke-width: 1.6; }
.ac-map-lot:focus { outline: none; }
.ac-map-lot:focus-visible { outline: 2px solid #f5b335; }

@media (max-width: 720px) {
  .ac-top { top: 10px; left: 10px; right: 10px; }
  .ac-brand { display: none; }
  .ac-brandbar { padding-left: 6px; min-height: 48px; }
  .ac-crumbs button, .ac-crumbs [aria-current="page"] { max-width: 120px; }
  .ac-panel { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 52vh; border-radius: 18px 18px 0 0; border-bottom: 0; }
  .ac-panel-scroll { padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); }
  .ac-sheet-handle { display: block; width: 40px; height: 4px; border-radius: 2px; background: rgba(246, 243, 236, 0.35); margin: 8px auto 4px; flex: none; }
  .ac-panel h2 { font-size: 19px; }
  .ac-cam { left: 10px; bottom: 10px; grid-template-columns: repeat(3, 44px); }
  .ac-hud[data-sheet="open"] .ac-cam { display: none; }
  .ac-pop { position: fixed; top: 66px; right: 10px; left: 10px; width: auto; }
  .ac-arrival { bottom: 28px; }
  .ac-map2d { grid-template-columns: 1fr; padding: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .ac-veil { transition: none; }
}
`;

export function HudStyles() {
  return <style data-agentcity-hud="">{HUD_CSS}</style>;
}
