# X01 — Cinematic city, marketing landing page and automated demo

The owner directed this stage directly ("AgentCity — cinematic 3D city, premium UI/UX & automated demo experience").
It runs out of the M00–M10 order:
- **Pulled forward:** parts of M05/M06 (Next.js + React Three Fiber city) and of the product stages (marketing and
  demo funnel).
- **Still pending:** M04 (porting the legacy API to REST/GraphQL), on its own track.

This file is the contract between the X01 workstreams.

## What exists, and what stays

- **`apps/legacy`:** the working product, an imperative Three.js city of procedural meshes. It is **unchanged**; it
  stays the running app until cutover.
- **`apps/web`:** Next.js 16 + React 19.3, with M03 sign-in (OIDC BFF, device-bound sessions, step-up, invitations)
  and a realtime indicator. The status page moved to `/status`.
- **`apps/api`:** NestJS, with M03 auth/access/realtime and the M04 common plumbing (request ids, structured errors,
  cursors).
- **Database (M02):** tenancy with RLS. Demo tenants (`tenant.kind = 'demo'`) exist and have no provider authority.
- **The city is ported, not invented:** layout, buildings and floors come from the legacy seed through
  `packages/domain`. The public layout `packages/city-scene/src/data/city-layout.json` is generated and tested:
  15 buildings, 183 floors, 303 desks, and no real person's name.

## Decisions

1. **Where the city lives:** React Three Fiber in a new package, `packages/city-scene`, rendered by `apps/web`.
   TARGET-STACK requires R3F; upgrading the legacy engine would be thrown away.
2. **Assets:** procedural and instanced geometry with shaders by default. Any downloaded model must have a
   verified licence (CC0 or CC-BY with attribution), recorded in `packages/city-scene/ASSETS.md` with its source URL
   and licence. No asset without a recorded licence. Prefer GPU animation (vertex shaders, instancing) over many
   skinned meshes.
3. **Public vs private:**
   - The landing page and `/city` show the public map only: catalog buildings, anonymous desks, synthetic activity.
   - Tenant data appears only after sign-in, through the API under RLS.
4. **Demo access uses the existing identity flow; no passwords anywhere.**
   - Keycloak creates the demo person and sends a one-time **verify-email** link (`execute-actions-email` with
     `VERIFY_EMAIL`).
   - The person then signs in with an **email code** (or a passkey).
   - The demo is attached by accepting a server-side invitation for the verified email.
   - Locally, mail goes to Mailpit. In production nothing is sent until a real SMTP sender is approved (no
     production sends in this phase).
5. **Demo isolation:**
   - Each request gets its own `demo` tenant, with one workspace and synthetic data labelled "Sample"/"Simulated".
   - It has an expiry date (`DEMO_TTL_DAYS`, default 14), after which access ends and the data is removed.
   - Demo agents never send anything. The database already refuses dispatches, receipts and money facts for demo
     tenants.
6. **Demo building:** demos are shown in **Rental Building 2** (`rental-2`), on a floor assigned round-robin. This
   is visual only: no `workspace_placement` is created, so demo visitors never occupy a real floor.

## Visitor journey

```
/ (landing) ─ form ─► POST /api/demo/requests ─► /demo/check-email
   │                                   └─ server: lead saved, demo tenant + sample data + invitation,
   │                                      Keycloak user (no password) + verify-email link sent (Mailpit locally)
   └─ "Explore AgentCity" ─► /city (public city, free exploration)
email link ─► Keycloak verifies the address ─► /demo/verified ─► sign in (email code; login_hint = address)
   ─► /demo/welcome: POST /api/demo/claim (accept invitation, switch tenant) ─► "Welcome to AgentCity, <first name>"
   ─► Start tour / Explore city ─► cinematic arrival ─► demo building ─► floor ─► /office (demo office, agents)
```

## API contract (demo module)

Every response uses the M04 structured errors: `{ error, message, requestId }`.

| Method and path | Access | Body / response |
|---|---|---|
| GET `/api/demo/form-token` | public | `{ token }`: an HMAC-signed issue time, so a form submitted too fast is refused |
| POST `/api/demo/requests` | public, rate-limited per IP and per email (Redis), honeypot, form-token age | `{ fullName, email, company, industry?, phone?, website?, marketingConsent: boolean, formToken, website2 /* honeypot, must be empty */ }` → `202 { requestId, status: 'verification-sent' }` for new **and** existing emails, so the response never reveals whether an email is known. Validation errors are `400` with `details` per field |
| GET `/api/demo/requests/:requestId` | public (unguessable id) | `{ status: 'verification-sent' \| 'ready' \| 'expired' }`, with no personal data |
| POST `/api/demo/claim` | session (email verified) | Accepts the visitor's demo invitation and switches the session to the demo tenant → `{ tenantId, workspaceId, firstName, company, building: { key, name }, office: { level, name }, expiresAt }` |
| GET `/api/demo/workspace` | session in a demo tenant | Welcome and office data: `{ firstName, company, industry, building, office, agents: [{ id, name, role, status, summary, tasks[], conversations[] }], activity[], expiresAt, simulated: true }` |
| GET `/api/admin/leads` | agency owner of the platform agency; step-up `permission` | Paginated leads (signed cursor). CSV export at `/api/admin/leads.csv` (step-up). Personal data is never logged |
| POST `/api/auth/login/start` | (M03) | Gains an optional `loginHint` (an email address) passed to Keycloak as `login_hint` |

**Storage:**
- `marketing.lead` (class `private`, personal data) holds:
  - the lead id, name, email, company, industry, phone, website;
  - consent: a boolean, the time it was given, and the notice version;
  - created_at, demo status, demo tenant/workspace ids, attribution (`utm_*`, referrer host);
  - `expires_at`.
- Each demo tenant has a demo profile with the synthetic agent team.
- Writes go through SECURITY DEFINER functions. The app role has no direct access to `marketing.*`.
- Expiry is `app.expire_demos()`, run by a worker job or the command `pnpm demo:expire`.

## Visual direction

- **Character:** stylised photorealism, modern Manhattan (Midtown and Hudson Yards). Distinct silhouettes:
  setbacks, crowns, spires, podiums, rooftop gardens, water tanks. Curtain-wall glass with mullions, brick and stone
  mid-rises, lit lobbies and storefronts.
- **Restraint:** no identical boxes, and no neon overload.
- **Palette:** midnight navy `#0f1b2d`, sunlight gold `#f5b335`, architectural teal `#1f8a8a`, sky blue `#6fb7e8`,
  warm coral `#ff7a5c`, greenery `#5b9a5b`, and neutral surfaces `#f6f3ec` / `#e7e1d6`. Fast Sales's accent
  `#f5b335` stays the city's gold.
- **Time and weather:**
  - Times of day: `day`, `golden`, `evening`, `night`. Weather: `clear`, `partly-cloudy`, `overcast`, `light-rain`.
  - Transitions are smooth, and both have manual controls.
- **Motion:**
  - Natural and staggered; no synchronised loops.
  - `prefers-reduced-motion` stops non-essential motion and turns flights into fades.
  - Animation pauses when the tab is hidden.
- **Quality:** presets `ultra`, `balanced` and `low` (budgets in `quality/quality.ts`). The initial level is chosen
  automatically from measured frame time and can be overridden manually. Without WebGL, a 2D fallback shows the
  buildings as a list or map with the same navigation.
- **Honesty:** frame-rate targets are reported only from measurements, with the hardware stated. This container
  renders with software GL, so its numbers are not device performance.

## Ownership (parallel work; do not edit another workstream's files)

| Workstream | Owns |
|---|---|
| **A1 environment and architecture** | `packages/city-scene/src/{environment,buildings,streets,quality}/**`, `packages/city-scene/ASSETS.md` (shared: append-only) |
| **A2 life** | `packages/city-scene/src/life/**` |
| **A3 camera, navigation, interiors, HUD** | `packages/city-scene/src/{camera,interior,ui}/**`, `apps/web/app/city/**` |
| **B marketing landing page** | `apps/web/app/page.tsx`, `apps/web/app/(marketing)/**`, `apps/web/components/marketing/**`, `apps/web/app/theme.css` (design tokens, imported by the root layout), `apps/web/app/layout.tsx` |
| **C demo backend** | `apps/api/src/demo/**`, `apps/api/test/demo*`, `packages/db/migrations/1793318400000_demo.sql`, `packages/db/test/demo*`, the `agentcity-provisioner` client in `infra/keycloak/agentcity-realm.json`, `loginHint` in `apps/api/src/auth/{oidc,auth.controller}.ts`, `apps/worker/src/demo*` |
| **D demo frontend** | `apps/web/app/demo/**`, `apps/web/app/(signed-in)/office/**`, `apps/web/app/(signed-in)/admin/**`, `apps/web/components/demo/**` (including `DemoRequestForm`, which B places on the landing page) |
| **Integrator** | everything else: `CityScene.tsx`, `types.ts`, `store.ts`, `context.tsx`, `index.ts`, package manifests, lockfile, env, compose, CI, MIGRATION-STATUS |

**Cross-workstream interfaces:**
- **Scene state:** read and write through `useCity()` / the store; never through module globals.
- **Picking:** buildings are pickable meshes with `userData.buildingKey` (A1). The camera (A3) reacts to
  `store.mode`, and `hovered` is set by A1.
- **Streets:** A2's traffic and pedestrians use `layout.streets` and must agree with A1's roads (lane offset 1,
  road half-width 2, sidewalk 2.7, as in the legacy `street.ts`). A2 exposes the traffic-light phase through
  `life/signals.ts`, so A1 can light the signal heads.
- **Time and weather:** A1 owns the light rig and exports `environment/palette.ts`
  (`useEnvironmentLight(): { sunDirection, sunColor, ambient, nightFactor, wetness }`). A2 reads `nightFactor` for
  headlights and aircraft lights; A3 reads it for interior lights.
- **The demo office scene:** A3's `Interior` renders a floor from `store.mode` (kind `office`). D supplies the agent
  data for the demo office via the `agents` prop on `<DemoOfficeScene agents=…>`, which A3 exports from
  `interior/`.
