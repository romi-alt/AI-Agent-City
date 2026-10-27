/** Small inline icons (decorative: every button that uses one also has a text label or aria-label). */
const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...P}>
    {d}
  </svg>
);
export const IconPlus = () => svg(<path d="M12 5v14M5 12h14" />);
export const IconMinus = () => svg(<path d="M5 12h14" />);
export const IconTurnLeft = () => svg(<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />);
export const IconTurnRight = () => svg(<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />);
export const IconUp = () => svg(<path d="m6 15 6-6 6 6" />);
export const IconDown = () => svg(<path d="m6 9 6 6 6-6" />);
export const IconLeft = () => svg(<path d="m15 6-6 6 6 6" />);
export const IconRight = () => svg(<path d="m9 6 6 6-6 6" />);
export const IconReset = () => svg(<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />);
export const IconHome = () => svg(<path d="M3 11 12 4l9 7M5 10v10h14V10" />);
export const IconSettings = () =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>,
  );
export const IconKeyboard = () =>
  svg(
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>,
  );
export const IconBuildings = () =>
  svg(<path d="M3 21h18M5 21V7l6-3v17M11 21V9l8 3v9M8 9v.01M8 13v.01M8 17v.01M15 14v.01M15 18v.01" />);
export const IconClose = () => svg(<path d="M18 6 6 18M6 6l12 12" />);
export const IconBack = () => svg(<path d="M19 12H5M12 19l-7-7 7-7" />);
