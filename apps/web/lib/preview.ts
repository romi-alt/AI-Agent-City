// Public preview build (landing page and the 3D city only, no backend). Set NEXT_PUBLIC_PUBLIC_PREVIEW=true at
// build time; Next inlines it, so the demo form, sign-in links and every backend route are compiled out of reach.
export const PUBLIC_PREVIEW = process.env.NEXT_PUBLIC_PUBLIC_PREVIEW === 'true';
