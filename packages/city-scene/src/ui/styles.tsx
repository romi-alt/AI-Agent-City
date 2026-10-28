/**
 * HUD styles, shipped with the components (one <style> per page) so every host page gets the same look without
 * importing CSS from a package. Class names are prefixed `ac-` to stay out of the host's way.
 */
export const HUD_CSS = `
.ac-hud, .ac-city-page, .ac-map2d, .ac-veil, .ac-error {
  --ac-paper: #fafaf9; --ac-white: #ffffff; --ac-ink: #0c0c0d; --ac-ink-2: #3f3f46; --ac-muted: #5f5f68;
  --ac-faint: #8a8a93; --ac-line: #e7e5e4; --ac-line-2: #d6d3d1; --ac-tint: #f4f4f2; --ac-gold: #f5b335;
  --ac-focus: #2563eb; --ac-glass: rgba(255, 255, 255, 0.88);
  --ac-shadow: 0 1px 2px rgba(12, 12, 13, 0.05), 0 12px 32px -12px rgba(12, 12, 13, 0.18);
  --ac-font: var(--font-sans, var(--font-geist, "Geist")), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-family: var(--ac-font);
}
.ac-city-page { position: fixed; inset: 0; max-width: none; margin: 0; padding: 0; display: block; background: var(--ac-paper); color: var(--ac-ink); overflow: hidden; }
.ac-hud { position: absolute; inset: 0; pointer-events: none; font-size: 15px; line-height: 1.45; color: var(--ac-ink); z-index: 40;
  -webkit-font-smoothing: antialiased; letter-spacing: -0.005em; }
.ac-hud > * { pointer-events: auto; }
.ac-hud button, .ac-map2d button, .ac-hud a.ac-btn, .ac-map2d a.ac-btn, .ac-desk-tag {
  font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ac-glass { background: var(--ac-glass); border: 1px solid var(--ac-line); border-radius: 16px; box-shadow: var(--ac-shadow);
  -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); }
.ac-hud :focus-visible, .ac-map2d :focus-visible, .ac-desk-tag:focus-visible, .ac-veil :focus-visible, .ac-error :focus-visible {
  outline: 2px solid var(--ac-focus); outline-offset: 2px; }

/* Buttons: white secondary with a hairline, gold only for the one primary action, quiet text buttons. */
.ac-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px;
  border-radius: 10px; border: 1px solid var(--ac-line-2); background: var(--ac-white); color: var(--ac-ink);
  text-decoration: none; font-weight: 500; font-size: 15px; line-height: 1.2; letter-spacing: -0.01em;
  box-shadow: 0 1px 2px rgba(12, 12, 13, 0.05); transition: border-color 150ms ease, background-color 150ms ease; }
.ac-btn:hover { border-color: #a8a29e; }
.ac-btn svg { width: 16px; height: 16px; flex: none; }
.ac-btn:disabled { opacity: 0.4; cursor: default; }
.ac-btn.ac-primary { background: var(--ac-gold); border-color: transparent; color: var(--ac-ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 1px 2px rgba(12, 12, 13, 0.12); }
.ac-btn.ac-primary:hover { background: #f7bf52; }
.ac-btn.ac-quiet { background: transparent; border-color: transparent; box-shadow: none; color: var(--ac-muted); padding-inline: 10px; }
.ac-btn.ac-quiet:hover:not(:disabled) { color: var(--ac-ink); background: var(--ac-tint); }
.ac-icon-btn { width: 40px; height: 40px; padding: 0; display: inline-grid; place-items: center; border-radius: 10px;
  border: 1px solid transparent; background: transparent; color: var(--ac-ink-2); transition: background-color 150ms ease; }
.ac-icon-btn:hover { background: var(--ac-tint); color: var(--ac-ink); }
.ac-icon-btn[aria-pressed="true"], .ac-icon-btn[aria-expanded="true"] { background: var(--ac-tint); color: var(--ac-ink); border-color: var(--ac-line); }
.ac-icon-btn svg { width: 18px; height: 18px; }

/* Top bar: where you are on the left, view tools on the right. */
.ac-top { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.ac-top > * { pointer-events: auto; }
.ac-brandbar { display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 14px; min-height: 48px; max-width: min(720px, 100%); border-radius: 14px; }
.ac-brand { font-weight: 600; letter-spacing: -0.02em; margin-right: 10px; padding-right: 12px; border-right: 1px solid var(--ac-line);
  white-space: nowrap; color: var(--ac-ink); text-decoration: none; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; }
.ac-brand::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: var(--ac-gold); }
.ac-brand span { color: inherit; }
.ac-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 0; margin: 0; padding: 0; list-style: none; min-width: 0; }
.ac-crumbs li { display: flex; align-items: center; min-width: 0; }
.ac-crumbs li + li::before { content: "/"; color: var(--ac-line-2); padding: 0 2px; }
.ac-crumbs button { border: 0; background: transparent; color: var(--ac-muted); padding: 8px; border-radius: 8px; min-height: 40px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.ac-crumbs button:hover { color: var(--ac-ink); background: var(--ac-tint); }
.ac-crumbs [aria-current="page"] { color: var(--ac-ink); font-weight: 600; padding: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.ac-tools { display: flex; gap: 2px; padding: 4px; border-radius: 14px; }

/* The compact view control (Overview / Top / Orbit, or Explode floors), centred in the top bar. */
.ac-modebar { position: absolute; left: 50%; transform: translateX(-50%); top: 0; margin: 0; padding: 4px; border-radius: 14px; min-width: 0; }
.ac-modebar .ac-seg { border: 0; background: transparent; padding: 0; grid-auto-columns: minmax(84px, auto); }
.ac-modebar .ac-seg label { min-height: 38px; font-size: 13.5px; padding: 4px 14px; }
.ac-modebar .ac-seg label:has(input:checked) { background: var(--ac-tint); box-shadow: inset 0 0 0 1px var(--ac-line); }
.ac-switch { display: inline-flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 14px 0 10px; border: 0; border-radius: 10px;
  background: transparent; color: var(--ac-ink); font-size: 13.5px; font-weight: 500; }
.ac-switch:hover { background: var(--ac-tint); }
.ac-switch i { position: relative; width: 30px; height: 18px; border-radius: 999px; background: var(--ac-line-2); transition: background-color 150ms ease; flex: none; }
.ac-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 2px rgba(12, 12, 13, 0.2); transition: transform 150ms ease; }
.ac-switch.is-on i { background: var(--ac-ink); }
.ac-switch.is-on i::after { transform: translateX(12px); }

/* Popovers (view settings, keyboard help). */
.ac-pop { position: absolute; top: 60px; right: 0; width: min(340px, calc(100vw - 32px)); padding: 20px; display: grid; gap: 18px; z-index: 5;
  background: var(--ac-white); border-radius: 16px; }
.ac-pop h2 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
.ac-field { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; min-width: 0; }
.ac-field legend { font-size: 13px; color: var(--ac-muted); padding: 0; margin-bottom: 8px; font-weight: 500; }
.ac-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; background: var(--ac-tint); padding: 3px; border-radius: 10px; border: 1px solid var(--ac-line); }
.ac-seg label { position: relative; display: grid; place-items: center; min-height: 36px; padding: 4px 6px; border-radius: 8px; font-size: 13px;
  text-align: center; cursor: pointer; color: var(--ac-muted); transition: background-color 150ms ease, color 150ms ease; }
.ac-seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.ac-seg label:has(input:checked) { background: var(--ac-white); color: var(--ac-ink); font-weight: 500; box-shadow: 0 1px 2px rgba(12, 12, 13, 0.1); }
.ac-seg label:has(input:focus-visible) { outline: 2px solid var(--ac-focus); outline-offset: 1px; }
.ac-check { display: flex; align-items: flex-start; gap: 10px; min-height: 40px; cursor: pointer; font-size: 14px; color: var(--ac-ink-2); }
.ac-check input { width: 18px; height: 18px; margin-top: 1px; accent-color: var(--ac-ink); flex: none; }
.ac-keys { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
.ac-keys dt { color: var(--ac-ink); font-weight: 500; white-space: nowrap; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px;
  background: var(--ac-tint); border: 1px solid var(--ac-line); border-radius: 6px; padding: 2px 6px; justify-self: start; }
.ac-keys dd { margin: 0; color: var(--ac-muted); align-self: center; }

/* Camera controls, bottom left. */
.ac-cam { position: absolute; left: 16px; bottom: 16px; display: grid; grid-template-columns: repeat(3, 40px); gap: 2px; padding: 4px; border-radius: 14px; }

/* Side panel (desktop) / bottom sheet (phones). */
.ac-panel { position: absolute; top: 80px; right: 16px; bottom: 16px; width: min(380px, calc(100vw - 32px)); display: flex; flex-direction: column;
  overflow: hidden; background: rgba(255, 255, 255, 0.94); }
.ac-panel-scroll { overflow-y: auto; padding: 24px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-content: start; overscroll-behavior: contain; }
.ac-panel-head { display: grid; gap: 6px; }
.ac-kicker { font-size: 12.5px; color: var(--ac-muted); font-weight: 500; letter-spacing: 0; }
.ac-panel h2 { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 600; letter-spacing: -0.025em; outline: none; }
.ac-panel h2:focus { outline: none; }
.ac-panel p { margin: 0; color: var(--ac-muted); }
.ac-panel h3, .ac-list-title { margin: 0 0 8px !important; font-size: 12.5px !important; color: var(--ac-muted) !important; text-transform: none !important;
  letter-spacing: 0 !important; font-weight: 500; }
.ac-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ac-chips li { font-size: 13px; padding: 3px 10px; border-radius: 999px; background: var(--ac-tint); color: var(--ac-ink-2); border: 1px solid var(--ac-line); }
.ac-note { font-size: 14px; padding: 12px 14px; border-radius: 12px; background: var(--ac-tint); border: 1px solid var(--ac-line); color: var(--ac-ink-2); }
.ac-note.ac-gold { background: var(--ac-white); border-color: var(--ac-line-2); }
.ac-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ac-actions .ac-btn { flex: 1 1 auto; }
.ac-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; border-top: 1px solid var(--ac-line); }
.ac-list > li { border-bottom: 1px solid var(--ac-line); }
.ac-row { box-sizing: border-box; width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; text-align: left; min-height: 52px;
  padding: 10px 8px; border-radius: 8px; border: 0; background: transparent; color: var(--ac-ink); }
button.ac-row:hover, button.ac-row:focus-visible { background: var(--ac-tint); }
.ac-row[aria-current="true"], .ac-row[aria-pressed="true"] { background: var(--ac-tint); box-shadow: inset 2px 0 0 var(--ac-ink); }
.ac-row .ac-lvl { font-variant-numeric: tabular-nums; font-weight: 500; color: var(--ac-faint); min-width: 1.8em; font-size: 14px; }
.ac-row small { display: block; color: var(--ac-muted); font-size: 13px; margin-top: 1px; }
.ac-row .ac-meta { color: var(--ac-muted); font-size: 13px; white-space: nowrap; }
button.ac-row .ac-meta::after { content: " \\203A"; color: var(--ac-faint); }
.ac-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #9aa5b1; flex: none; box-shadow: 0 0 0 3px rgba(12, 12, 13, 0.04); }
.ac-swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex: none; box-shadow: inset 0 0 0 1px rgba(12, 12, 13, 0.12); }
.ac-agent { display: grid; gap: 8px; padding: 16px; border-radius: 12px; background: var(--ac-white); border: 1px solid var(--ac-line); }
.ac-agent h3 { margin: 0 !important; font-size: 18px !important; color: var(--ac-ink) !important; font-weight: 600 !important; letter-spacing: -0.015em !important; }
.ac-sheet-handle { display: none; }

/* Arrival: a quiet card at the foot of the view. */
.ac-arrival { position: absolute; left: 50%; bottom: 32px; transform: translateX(-50%); display: grid; justify-items: center; gap: 10px; text-align: center;
  width: min(460px, calc(100vw - 32px)); padding: 24px 24px 20px; }
.ac-arrival-title { margin: 0; font-size: clamp(22px, 3vw, 28px); font-weight: 600; letter-spacing: -0.03em; line-height: 1.15; color: var(--ac-ink); }
.ac-arrival-sub { margin: 0; color: var(--ac-muted); font-size: 15px; }
.ac-progress { width: 160px; height: 2px; border-radius: 2px; background: var(--ac-line); overflow: hidden; margin: 6px 0 4px; }
.ac-progress i { display: block; height: 100%; background: var(--ac-ink); transform-origin: left; }

/* The focusable scene region (keyboard camera); shows a ring only when focused. */
.ac-scene-focus { position: absolute; inset: 0; pointer-events: none; border-radius: 0; z-index: 1; }
.ac-scene-focus:focus-visible { outline: 2px solid var(--ac-focus); outline-offset: -2px; }
.ac-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* Labels in the 3D scene. */
.ac-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
.ac-label { position: absolute; left: 0; top: 0; will-change: transform; margin-top: -6px; }
.ac-labels .ac-desk-tag { pointer-events: auto; }
.ac-desk-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 8px; min-height: 28px; border-radius: 999px;
  border: 1px solid var(--ac-line, #e7e5e4); background: rgba(255, 255, 255, 0.94); color: #0c0c0d;
  font: 500 12.5px/1.1 var(--ac-font, system-ui, sans-serif); letter-spacing: -0.005em; white-space: nowrap;
  box-shadow: 0 1px 2px rgba(12, 12, 13, 0.08), 0 6px 16px -8px rgba(12, 12, 13, 0.3); transition: background-color 150ms ease; }
.ac-desk-tag b { font-weight: 600; }
.ac-desk-tag span { color: #5f5f68; font-weight: 400; }
.ac-desk-tag:hover { background: #ffffff; }
.ac-desk-tag.is-selected { background: #0c0c0d; color: #fafaf9; border-color: #0c0c0d; }
.ac-desk-tag.is-selected span { color: #d4d4d8; }
.ac-floor-tag { pointer-events: auto; display: inline-flex; align-items: baseline; gap: 8px; padding: 3px 10px 3px 8px; min-height: 24px;
  border-radius: 7px; border: 1px solid var(--ac-line, #e7e5e4); background: rgba(255, 255, 255, 0.92); color: #0c0c0d;
  font: 500 12px/1.2 var(--ac-font, system-ui, sans-serif); white-space: nowrap; transform-origin: left center;
  box-shadow: 0 1px 2px rgba(12, 12, 13, 0.08); transition: background-color 150ms ease; }
.ac-label.ac-floor-tag { margin-top: 0; }
.ac-floor-tag b { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 1.4em; color: #3f3f46; }
.ac-floor-tag span { color: #3f3f46; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.ac-floor-tag:hover { background: #ffffff; }
.ac-floor-tag.is-selected { background: #0c0c0d; color: #fafaf9; border-color: #0c0c0d; }
.ac-floor-tag.is-selected b, .ac-floor-tag.is-selected span { color: #fafaf9; }
.ac-callout { display: grid; gap: 2px; text-align: center; padding: 8px 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.94); color: #0c0c0d;
  border: 1px solid #e7e5e4; white-space: nowrap; font: 600 14px/1.3 system-ui, sans-serif; }
.ac-callout-kicker { font-size: 11px; color: #5f5f68; font-weight: 500; }

/* Loading and errors. */
.ac-veil { position: absolute; inset: 0; display: grid; place-items: center; background: var(--ac-paper); color: var(--ac-ink); z-index: 60; transition: opacity 0.6s ease; }
.ac-veil[data-done="true"] { opacity: 0; pointer-events: none; }
.ac-veil-box { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 24px; font-size: 15px; }
.ac-veil-box .ac-progress { width: 200px; }
.ac-veil-box strong { font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
.ac-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--ac-paper); color: var(--ac-ink); z-index: 70; }
.ac-error > div { max-width: 520px; display: grid; gap: 16px; }
.ac-error h1 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.03em; }
.ac-error p { margin: 0; color: var(--ac-muted); }

/* The 2D city (no WebGL). */
.ac-map2d { min-height: 100%; background: var(--ac-paper); color: var(--ac-ink); font-size: 15px; line-height: 1.5;
  display: grid; grid-template-columns: minmax(0, 1fr) min(400px, 100%); gap: 24px; padding: 32px; box-sizing: border-box; align-items: start; }
.ac-map2d header { grid-column: 1 / -1; display: grid; gap: 6px; }
.ac-map2d header h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.03em; color: var(--ac-ink); }
.ac-map2d header p { margin: 0; color: var(--ac-muted); }
.ac-map2d svg.ac-map-svg { width: 100%; height: auto; display: block; border-radius: 16px; background: #ffffff; border: 1px solid var(--ac-line);
  box-shadow: var(--ac-shadow); }
.ac-map2d .ac-panel { position: static; width: auto; max-height: none; background: #ffffff; }
.ac-map-lot { cursor: pointer; }
.ac-map-lot rect { transition: stroke 0.2s ease; }
.ac-map-lot:hover rect { stroke: #0c0c0d; stroke-width: 0.6; }
.ac-map-lot[aria-current="true"] rect { stroke: #0c0c0d; stroke-width: 1; }

@media (max-width: 720px) {
  .ac-top { top: 10px; left: 10px; right: 10px; }
  .ac-brand { display: none; }
  .ac-brandbar { padding-left: 4px; min-height: 44px; }
  .ac-crumbs button, .ac-crumbs [aria-current="page"] { max-width: 120px; }
  .ac-panel { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 52vh; border-radius: 20px 20px 0 0; border-bottom: 0; }
  .ac-panel-scroll { padding: 4px 20px calc(20px + env(safe-area-inset-bottom)); gap: 16px; }
  .ac-sheet-handle { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--ac-line-2); margin: 10px auto 6px; flex: none; }
  .ac-panel h2 { font-size: 20px; }
  .ac-cam { left: 10px; bottom: 10px; }
  .ac-hud[data-sheet="open"] .ac-cam { display: none; }
  .ac-pop { position: fixed; top: 62px; right: 10px; left: 10px; width: auto; }
  .ac-modebar { position: fixed; top: 64px; left: 10px; transform: none; }
  .ac-modebar .ac-seg { grid-auto-columns: minmax(64px, auto); }
  .ac-arrival { bottom: 16px; }
  .ac-map2d { grid-template-columns: 1fr; padding: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .ac-veil, .ac-btn, .ac-seg label, .ac-icon-btn { transition: none; }
}

/*
 * Office view only: the reference look (legacy app's floor view, apps/legacy/src/style.css). Cream surfaces, warm
 * hairlines, amber accent, small monospaced uppercase labels, Inter for text. Every rule is scoped to office mode
 * so the city, building and floor views keep their own look.
 */
.ac-hud[data-mode="office"] {
  --ac-paper: #f4f1ea; --ac-white: #ffffff; --ac-ink: #1f2328; --ac-ink-2: #3a3f46; --ac-muted: #676c74; --ac-faint: #8b9098;
  --ac-line: #e6e0d4; --ac-line-2: #d8cfbf; --ac-tint: #f7f4ee; --ac-gold: #f5b335; --ac-gold-ink: #3a2a05;
  --ac-glass: rgba(247, 244, 238, 0.82); --ac-shadow: 0 6px 24px rgba(40, 30, 10, 0.12);
  --ac-font: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ac-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  /* Room the side panel takes on the right (its width and gutter); the bottom sheet on phones takes none. */
  --ac-right: min(396px, 100vw);
  font-size: 14px; letter-spacing: 0;
}
.ac-hud[data-mode="office"] .ac-glass { border-radius: 12px; -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); }
.ac-hud[data-mode="office"] .ac-icon-btn:hover { background: var(--ac-white); }

/* Breadcrumb: the legacy menu, a stack of small monospaced uppercase links (horizontal again on phones). */
.ac-hud[data-mode="office"] .ac-brandbar { padding: 6px; min-height: 0; }
.ac-hud[data-mode="office"] .ac-brand, .ac-hud[data-mode="office"] .ac-crumbs button,
.ac-hud[data-mode="office"] .ac-crumbs [aria-current="page"] {
  font: 500 11px/1.2 var(--ac-mono); text-transform: uppercase; letter-spacing: 0.08em; }
.ac-hud[data-mode="office"] .ac-brand { font-weight: 700; color: var(--ac-ink); border-color: var(--ac-line); padding: 7px 10px; margin-right: 4px; }
.ac-hud[data-mode="office"] .ac-brand::before { border-radius: 2px; }
.ac-hud[data-mode="office"] .ac-crumbs button { color: var(--ac-muted); min-height: 32px; padding: 7px 10px; border-radius: 7px; }
.ac-hud[data-mode="office"] .ac-crumbs button:hover { color: var(--ac-ink); background: var(--ac-white); }
.ac-hud[data-mode="office"] .ac-crumbs [aria-current="page"] { color: var(--ac-ink); font-weight: 700; padding: 7px 10px; border-radius: 7px;
  background: var(--ac-white); box-shadow: inset 2px 0 0 var(--ac-gold); }
.ac-hud[data-mode="office"] .ac-crumbs li + li::before { color: var(--ac-line-2); }

/* Title chip, top centre of the part of the view the panel leaves visible. */
.ac-office-title-wrap { position: absolute; top: 16px; left: 200px; right: calc(var(--ac-right) + 200px); display: flex; justify-content: center;
  pointer-events: none; }
.ac-office-title { pointer-events: auto; display: grid; gap: 2px; padding: 8px 18px; text-align: center; max-width: 100%; }
.ac-office-title b { font-size: 14px; font-weight: 600; color: var(--ac-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-office-title span { font-size: 12px; color: var(--ac-muted); }

/* Legend, bottom left. */
.ac-legend { position: absolute; left: 16px; bottom: 16px; display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; padding: 7px 12px; list-style: none;
  font: 500 11px/1.4 var(--ac-mono); color: var(--ac-ink-2); }
.ac-legend li { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.ac-legend i { width: 8px; height: 8px; border-radius: 2px; flex: none; }

/* Camera pad, bottom right of the visible view: a frosted card of cream keys that turn amber on hover. */
.ac-hud[data-mode="office"] .ac-cam { left: auto; right: calc(var(--ac-right) + 16px); bottom: 16px; grid-template-columns: repeat(3, 34px); gap: 4px; padding: 8px; }
.ac-hud[data-mode="office"] .ac-cam .ac-icon-btn { width: 34px; height: 34px; border-radius: 7px; background: var(--ac-tint); color: var(--ac-ink-2); }
.ac-hud[data-mode="office"] .ac-cam .ac-icon-btn:hover { background: var(--ac-gold); color: var(--ac-gold-ink); }
.ac-hud[data-mode="office"] .ac-cam .ac-icon-btn svg { width: 16px; height: 16px; }

/* Panel: the legacy right panel's cream surface, hairlines and monospaced section labels. */
.ac-hud[data-mode="office"] .ac-panel { background: rgba(247, 244, 238, 0.96); border-color: var(--ac-line); }
.ac-hud[data-mode="office"] .ac-panel-scroll { padding: 20px; gap: 16px; }
.ac-hud[data-mode="office"] .ac-kicker, .ac-hud[data-mode="office"] .ac-panel h3, .ac-hud[data-mode="office"] .ac-list-title {
  font: 700 11px/1.3 var(--ac-mono) !important; text-transform: uppercase !important; letter-spacing: 0.08em !important; color: var(--ac-muted) !important; }
.ac-hud[data-mode="office"] .ac-panel h2 { font-size: 22px; letter-spacing: -0.02em; }
.ac-hud[data-mode="office"] .ac-panel p { font-size: 14px; }
.ac-hud[data-mode="office"] .ac-list { border-color: var(--ac-line); }
.ac-hud[data-mode="office"] .ac-list > li { border-color: var(--ac-line); }
.ac-hud[data-mode="office"] .ac-row { min-height: 48px; padding: 8px; border-radius: 7px; font-size: 14px; }
.ac-hud[data-mode="office"] button.ac-row:hover, .ac-hud[data-mode="office"] button.ac-row:focus-visible { background: var(--ac-white); }
.ac-hud[data-mode="office"] .ac-row[aria-pressed="true"] { background: var(--ac-white); box-shadow: inset 3px 0 0 var(--ac-gold); }
.ac-hud[data-mode="office"] .ac-row small { font-size: 12px; }
.ac-hud[data-mode="office"] .ac-row .ac-meta { font: 500 11px/1.2 var(--ac-mono); text-transform: uppercase; letter-spacing: 0.06em; }
.ac-hud[data-mode="office"] .ac-dot { width: 7px; height: 7px; box-shadow: none; }
.ac-hud[data-mode="office"] .ac-agent { background: var(--ac-white); border-color: var(--ac-line); border-left: 4px solid #4aa8d8; border-radius: 10px; padding: 14px; }
.ac-hud[data-mode="office"] .ac-agent[data-kind="human"] { border-left-color: #f2b33d; }
.ac-hud[data-mode="office"] .ac-agent h3 { font: 600 17px/1.25 var(--ac-font) !important; text-transform: none !important; letter-spacing: -0.01em !important;
  color: var(--ac-ink) !important; }
.ac-hud[data-mode="office"] .ac-btn { border-color: var(--ac-line-2); border-radius: 10px; font-size: 14px; min-height: 42px; }
.ac-hud[data-mode="office"] .ac-btn:hover { border-color: var(--ac-gold); }
.ac-hud[data-mode="office"] .ac-btn.ac-primary { background: var(--ac-gold); color: var(--ac-gold-ink); }
.ac-hud[data-mode="office"] .ac-btn.ac-quiet:hover:not(:disabled) { background: var(--ac-white); }
.ac-hud[data-mode="office"] .ac-sheet-handle { background: var(--ac-line-2); }

@media (min-width: 721px) {
  .ac-hud[data-mode="office"] .ac-brandbar { flex-direction: column; align-items: stretch; gap: 2px; }
  .ac-hud[data-mode="office"] .ac-brand { margin: 0 0 2px; border-right: 0; border-bottom: 1px solid var(--ac-line); padding: 8px 10px 10px; }
  .ac-hud[data-mode="office"] .ac-crumbs { flex-direction: column; align-items: stretch; flex-wrap: nowrap; gap: 2px; }
  .ac-hud[data-mode="office"] .ac-crumbs li + li::before { content: none; }
  .ac-hud[data-mode="office"] .ac-crumbs li > * { width: 100%; text-align: left; max-width: 200px; box-sizing: border-box; }
}
/* Narrower desktops: the chip clears the stacked breadcrumb instead of centring over the scene. */
@media (min-width: 721px) and (max-width: 1180px) {
  .ac-office-title-wrap { right: calc(var(--ac-right) + 16px); }
}
@media (max-width: 720px) {
  .ac-hud[data-mode="office"] { --ac-right: 0px; }
  .ac-office-title-wrap { top: 62px; left: 10px; right: 10px; }
  .ac-office-title { padding: 6px 14px; }
  .ac-office-title b { font-size: 13px; }
  .ac-office-title span { font-size: 11.5px; }
  /* Under the title on phones: the bottom sheet takes the foot of the screen. */
  .ac-legend { left: 50%; transform: translateX(-50%); bottom: auto; top: 118px; padding: 5px 10px; gap: 4px 10px; font-size: 10.5px; flex-wrap: nowrap; }
}
`;

export function HudStyles() {
  return <style data-agentcity-hud="">{HUD_CSS}</style>;
}
