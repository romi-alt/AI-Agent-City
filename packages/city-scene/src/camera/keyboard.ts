/** What a key does to the camera. Pure so the mapping is tested and documented in one place. */
export type KeyCommand =
  | { type: 'pan'; right: number; forward: number }
  | { type: 'zoom'; dir: 1 | -1 }
  | { type: 'rotate'; dir: 1 | -1 }
  | { type: 'tilt'; dir: 1 | -1 }
  | { type: 'reset' }
  | { type: 'home' }
  | { type: 'back' };

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Help text for the keyboard, shown in the HUD. */
export const KEY_HELP: [string, string][] = [
  ['Arrows or W A S D', 'Move around'],
  ['Q / E', 'Turn left / right'],
  ['+ / −', 'Zoom in / out'],
  ['Page Up / Page Down', 'Tilt'],
  ['R', 'Reset this view'],
  ['H', 'Back to the city overview'],
  ['Esc', 'Go back one step'],
];

export function keyToCommand(e: KeyInput): KeyCommand | null {
  // Browser and OS shortcuts (copy, reload, zoom the page) stay theirs.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { type: 'pan', right: 0, forward: 1 };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { type: 'pan', right: 0, forward: -1 };
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { type: 'pan', right: -1, forward: 0 };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { type: 'pan', right: 1, forward: 0 };
    case '+':
    case '=':
      return { type: 'zoom', dir: 1 };
    case '-':
    case '_':
      return { type: 'zoom', dir: -1 };
    case 'q':
    case 'Q':
      return { type: 'rotate', dir: -1 };
    case 'e':
    case 'E':
      return { type: 'rotate', dir: 1 };
    case 'PageUp':
      return { type: 'tilt', dir: -1 };
    case 'PageDown':
      return { type: 'tilt', dir: 1 };
    case 'r':
    case 'R':
      return { type: 'reset' };
    case 'h':
    case 'H':
      return { type: 'home' };
    case 'Escape':
      return { type: 'back' };
    default:
      return null;
  }
}

/** Keys the camera ignores when they arrive from a control that uses them itself (lists, buttons, fields). */
export function keyBelongsToControl(key: string, tag: string, role: string | null): boolean {
  const t = tag.toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select') return key !== 'Escape';
  if (role === 'listbox' || role === 'menu' || role === 'radiogroup' || role === 'slider') return key !== 'Escape';
  // On buttons and links, arrows and letters are free, Space/Enter activate them.
  return key === ' ' || key === 'Enter';
}
