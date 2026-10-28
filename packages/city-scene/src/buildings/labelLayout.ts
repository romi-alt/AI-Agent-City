/**
 * Screen-space collision avoidance for the building tags. Pure and deterministic: the same projected anchors always
 * give the same answer, so tags never shuffle between identical frames. Greedy by priority: a tag first tries its
 * full form where it is, then a few pixels up or down, then the compact brand-only form, and last it is hidden (it
 * comes back as the camera moves in, or while it is hovered or selected). A tag that carries a needs-you badge is
 * never hidden: it keeps the best spot it can find.
 */
export interface LabelCandidate {
  /** Bottom-centre anchor of the tag on screen, in px. */
  x: number;
  y: number;
  /** Rendered size of the full tag and of its brand-only form, in px. */
  fullWidth: number;
  briefWidth: number;
  height: number;
  /** Hovered or focused tags are placed first, then needs-you tags, then nearer ones. */
  pinned: boolean;
  needsYou: boolean;
  /** Distance to the camera: smaller wins. */
  depth: number;
}

export type LabelForm = 'full' | 'brief' | 'hidden';
export interface LabelPlacement {
  form: LabelForm;
  /** Vertical nudge in px (negative is up). */
  dy: number;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const GAP = 4;

function boxOf(c: LabelCandidate, width: number, dy: number): Box {
  return { l: c.x - width / 2, r: c.x + width / 2, t: c.y + dy - c.height, b: c.y + dy };
}

function hits(a: Box, b: Box): boolean {
  return a.l < b.r + GAP && b.l < a.r + GAP && a.t < b.b + GAP && b.t < a.b + GAP;
}

function offsets(c: LabelCandidate, form: LabelForm): number[] {
  const near = [0, -8, 8, -16, 16];
  return form === 'brief' ? [...near, -(c.height + GAP), c.height + GAP] : near;
}

function rank(a: LabelCandidate, b: LabelCandidate): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
  return a.depth - b.depth;
}

function firstFree(c: LabelCandidate, placed: Box[]): (LabelPlacement & { box: Box }) | null {
  for (const form of ['full', 'brief'] as const) {
    const width = form === 'full' ? c.fullWidth : c.briefWidth;
    for (const dy of offsets(c, form)) {
      const box = boxOf(c, width, dy);
      if (!placed.some(p => hits(box, p))) return { form, dy, box };
    }
  }
  return null;
}

/** One placement per candidate, in the candidates' own order. */
export function placeLabels(cands: readonly LabelCandidate[]): LabelPlacement[] {
  const out: LabelPlacement[] = cands.map(() => ({ form: 'hidden', dy: 0 }));
  const placed: Box[] = [];
  const order = cands.map((_, i) => i).sort((i, j) => rank(cands[i]!, cands[j]!) || i - j);
  for (const i of order) {
    const c = cands[i]!;
    const free = firstFree(c, placed);
    if (free) {
      out[i] = { form: free.form, dy: free.dy };
      placed.push(free.box);
    } else if (c.needsYou || c.pinned) {
      // Never lose a badge or the tag under the pointer: show it brand-only in place, even if it touches.
      out[i] = { form: 'brief', dy: 0 };
      placed.push(boxOf(c, c.briefWidth, 0));
    }
  }
  return out;
}
