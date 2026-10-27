# City scene assets

Every asset the city draws, with its source and licence. No downloaded asset may be used without an entry here
(PLAN.md, decision 2). Shared file: workstreams append their own section.

## A1 — architecture, streets and environment

No downloaded assets. Everything is generated at runtime from code in this package:

| What | How | Where |
|---|---|---|
| Facades (glass curtain walls, limestone grids, brick, ribbon windows, fins, lantern crowns, louvres), window lights, blinds, storefronts | Fragment shader on instanced boxes, from world-space floor and bay coordinates | `src/buildings/facade.ts` |
| Building shapes, setbacks, crowns, spires, water tanks, penthouses, gardens, awnings | Procedural layout (seeded) and instanced primitives | `src/buildings/{designs,skyline,parts}.ts` |
| Building signs (brand names as plain text) | Text drawn with `fillText` into a canvas atlas at runtime; system fonts only, no font files | `src/buildings/signs.ts` |
| Roads, lane markings, crossings, sidewalks, curbs, puddles, lamp pools | Fragment shaders with value noise | `src/streets/ground.ts` |
| Trees, lamps, traffic signals, benches, fountain, flags | Instanced primitives; wind, water and flags animated in vertex shaders | `src/streets/*.tsx` |
| Sky, sun, moon, stars, clouds, rain | Shaders (gradient sky, noise-shaded cloud billboards, instanced rain streaks) | `src/environment/*` |

Brand names on dealership signs are the catalog's own building names, set as text; no logos or trademark
artwork are reproduced.
