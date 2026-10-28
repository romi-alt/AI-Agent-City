# X04: dense downtown district (owner brief, parallel workstreams)

The reference frame is `ref-city-street.png` (in this folder): the legacy app's street view, pastel mid-rises with
awnings and rooftop tanks, a street receding to a pale skyline. The owner also named `ref-city-dense.png`, but it was
not attached; do not invent it.

## Goal
Today the City view reads as an isolated square island floating in dark blue water. Make it one busy downtown district
inside a much larger city that continues to the horizon.

Keep every client building exactly as it is: Audi, Honda, Hyundai, Genesis, Acura, Volkswagen, Alfa Romeo, Maserati,
Fiat, Fast Sales, rc-new, rc-used and the rentals. That covers their positions, labels, click behaviour, floor
navigation, data and tenant scoping. **This is a scene and visual change only.**

**Reuse the legacy helpers.** Read them first: `apps/legacy/src/scene/cityView.ts`, `street.ts`, `meshes.ts` (decorBuilding,
tree, vehicles, pedestrians) and `textures.ts` (facade styles, sky gradient). Port helpers into city-scene;
`apps/legacy` itself stays unchanged.

## Requirements

1. **Remove the island edge.** Delete the water plane and the visible map border; no camera angle may ever show the edge
   of the world or empty void. Extend the ground and road grid well beyond the current map, with roads continuing past
   the district boundary and disappearing into fog.
2. **Surround the district with generated city, in three rings.** Everything is seeded and deterministic, and is never
   placed on client buildings, roads, or the camera's default view of the hero buildings.
   - **Ring 1 (adjacent blocks, full detail):** fill every block with rows of decorative mid-rises, 4–7 floors, placed edge
     to edge along the street with no side gaps, so each block reads as a continuous street wall.
     - Pastel palette: brick red #C8503F, salmon #E98A6B, mustard #F0B84A, mint #8FD3A6, teal #4FB6A6, candy pink
       #F2A2B8, sky blue #7BAAD6, lavender #9B8BD6.
     - Each building gets a regular white window grid, a ground-floor shopfront with a coloured awning, and a roof item
       (water tank on legs, AC units, rooftop garden, or antenna).
     - Vary height and colour from a seed.
   - **Ring 2 (middle distance, simplified):** more blocks as merged or instanced geometry, with no awnings, no props and
     a simple facade texture.
   - **Ring 3 (far skyline):** a band of tall, pale, low-detail tower silhouettes (#D9DEE6 to #EEF1F5) at the horizon,
     mostly hidden in fog. Plain boxes or a few billboard impostors are fine.
3. **Densify the district itself.**
   - Shrink the oversized plazas, empty lawns and wide sidewalks. Keep one small park and the fountain plaza; fill the
     remaining empty lots between client towers with low and mid-rise decor buildings, so the towers rise out of a
     dense base.
   - Client buildings stay the heroes: slightly taller than their surroundings, with their brand label, an "x/y working"
     tag (simulated in the public city, and labelled as such) and a needs-you badge always visible above neighbours.
4. **Atmosphere.**
   - **Sky:** a gradient from #5AA9E6 (top) to #D6ECFA (horizon), with linear fog in the horizon colour so Ring 2 fades
     and Ring 3 is a soft silhouette. Tune near/far to the new map size.
   - **Light:** a warm hemisphere light (#FFFFFF / #B5A48A, about 1.6) plus a warm sun (#FFF4E0, about 2.2) with soft
     shadows. The shadow camera covers the district only; the outer rings cast no shadows.
   - **Night:** day/night keeps working, and at night the windows in all rings glow, so the city reads as a lit skyline.
5. **Life.**
   - More traffic on every road including the outer rings: cars, taxis, vans and an occasional bus, stopping at
     intersections. Cars fade out in the fog instead of hitting a world edge.
   - Pedestrians on the sidewalks of the district and Ring 1.
   - Loose bird flocks crossing the sky now and then.
   - **Everything instanced:** no per-object meshes for cars, people, trees, windows or props.
6. **Camera.**
   - **Overview:** lower and closer, about 30–35° down from horizontal, FOV about 42, looking along a main street so it
     recedes into the distance (as in ref-city-street.png). The hero buildings fill the frame and the skyline sits on
     the horizon.
   - **Top:** framed tightly enough that generated blocks fill the edges of the screen.
   - **Orbit:** a slow orbit around the district at the new lower angle.
   - **Limits:** clamp max distance and the polar angle so the user can never zoom out far enough to see the edge of the
     generated city.
   - **Transitions:** moves between presets ease over about 1 s instead of jumping.
7. **UI.** Keep the breadcrumb, the preset switcher, settings and the camera pad. Building tags stay white pills with a
   subtle shadow, so the pastel city doesn't reduce label contrast.

## Performance (hard limits)
- 60 fps on a mid-range laptop at 1440×900, and smooth on a phone.
- InstancedMesh or merged geometry for every repeated outer-ring building, window, tree, vehicle and pedestrian, with
  shared materials and textures.
- Report draw calls and triangles before and after (`renderer.info`).
- Over budget: cut Ring 2 detail first, never Ring 1 or the heroes.
- This container only has SwiftShader (software GL), so report counts, not fps, and say so.

## Constraints
- Follow `CLAUDE.md`: strict TS, no enums or parameter properties, short functions, comments explain why.
- 3D labels take text parts, never HTML.
- No new heavy dependencies.
- No changes to data models, APIs, server code, tenant scope or safety defaults.

## Done when
- **Screenshots:** Playwright before/after at 1440×900 and 390×844 for Overview, Top and Orbit, next to the reference,
  with an honest list of remaining differences.
- **Edges:** from no preset or allowed zoom can the world edge be seen.
- **Hero buildings:** every one is still clickable and opens the same floors (check at least three).
- **Checks:** typecheck, build and the existing tests pass, with the real output.

## Shared contract (the ownership split)
- **D1, district** (worktree /home/user/x01-a1, branch `design/city-a1`). Owns `streets/**`, `environment/**`, and
  `buildings/**` except `buildings/surround/**`.
  - Removes the water and edge, extends the ground and the road grid, densifies the district, sets the atmosphere,
    lighting and fog, and the hero labels.
  - **First, commit a pure export the others need:** `streets/extent.ts` with `cityRoads(layout)` (the extended road
    centre-lines for the whole generated city, as `{ roadsX: number[]; roadsZ: number[]; extent: number }`),
    `districtBounds(layout)`, and `heroClearance(layout)` (rectangles generated buildings must avoid).
- **D2, surround** (worktree /home/user/x04-surround, branch `design/city-surround`). Owns the new folder
  `buildings/surround/**`: rings 1, 2 and 3, built on D1's `cityRoads` / `heroClearance`, with night window glow.
  Exports one `<Surround />` component that D1 mounts in the scene composition.
- **D3, life** (worktree /home/user/x01-a2, branch `design/city-a2`). Owns `life/**`: traffic on the extended roads
  (`cityRoads`), fade in fog, pedestrians in the district and Ring 1, and bird flocks.
- **D4, camera** (worktree /home/user/x04-camera, branch `design/city-camera`). Owns the city presets only:
  - new file `camera/presets.ts`, plus the minimum hooks in `camera/CameraRig.tsx` / `shots.ts` for the
    explore-mode views;
  - preset easing, and distance/polar clamps from `districtBounds` / `cityRoads`.
  - R3 (office camera) is editing `camera/**` at the same time on another branch, so keep your edits to
    `CameraRig.tsx` / `shots.ts` small and isolated.
- **Integration:** the integrator merges everything into `design/city-dense-district`. To pick up another workstream's
  exports, `git merge <their branch>` (local branches; all worktrees share one repository).
- **Running and screenshots:** run Next dev from your worktree with your own port (D1 3311, D2 3312, D3 3313, D4 3314).
  Chromium + Playwright are preinstalled: `require('playwright')`, with args `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`, screenshot timeout 240000. Save shots in `planning/agentcity-migration/x04-city-dense/`
  with your prefix (d1-, d2-, d3-, d4-).
- **Before you finish:** run the city-scene typecheck and tests, the web typecheck and `format:check`. Commit on your
  branch; never push; stop only your own servers.
