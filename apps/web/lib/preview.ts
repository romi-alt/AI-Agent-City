// Public preview build (landing page and the 3D city only, no backend). Set NEXT_PUBLIC_PUBLIC_PREVIEW=true at
// build time; Next inlines it, so the demo form, sign-in links and every backend route are compiled out of reach.
export const PUBLIC_PREVIEW = process.env.NEXT_PUBLIC_PUBLIC_PREVIEW === 'true';

// The public preview with the real, server-backed demo funnel switched on (/demo/** and /api/lite/**). Everything else
// that needs a backend stays out of reach. Needs NEXT_PUBLIC_PUBLIC_PREVIEW=true as well.
export const LITE_DEMO = process.env.NEXT_PUBLIC_LITE_DEMO === 'true';

// Where "Talk to us" goes. Set NEXT_PUBLIC_CONTACT_EMAIL to change it; no booking tool is assumed.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@autosalescity.site';
