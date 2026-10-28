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

### X02 additions (A1)

Still no downloaded assets. New procedural pieces:

| What | How | Where |
|---|---|---|
| Building facades in 3D (glazing, spandrels, mullions, piers, fins, roofs, parapets), entrances, lobbies, display cars, rooftop plant, solar, helipad | Instanced primitives from a pure facade kit | `src/buildings/{kit,designs,kitmesh}.ts` |
| Leaf texture for tree canopies | Drawn at runtime with canvas ellipses; no image files | `src/streets/Trees.tsx` |
| Fountain water, jets, veils; flag cloth; ponds; bay water; plaza paving | Shaders | `src/streets/{PlazaFeatures.tsx,ground.ts}` |
| Ambient occlusion | N8AO through @react-three/postprocessing (already a dependency) | `src/environment/PostFX.tsx` |

## A2 — city life (X02)

Traffic, aircraft, birds and rooftop details are generated in code (`src/life/**`). The people use one downloaded,
CC0-licensed character set, processed into a single file:

| Output | Built from | Licence | Source |
|---|---|---|---|
| `apps/web/public/city/models/characters.glb` (served at `/city/models/characters.glb`) | Quaternius **Universal Base Characters** (Standard, free): `Superhero_Male_FullBody` and `Superhero_Female_FullBody` (Godot/UE glTF), hairstyles `Hair_SimpleParted`, `Hair_Buzzed`, `Hair_Beard`, `Hair_Long`, `Hair_Buns`, `Hair_BuzzedFemale` ("Rigged to Head Bone" glTF) | CC0 1.0 (`License_Standard.txt` in the pack) | https://quaternius.itch.io/universal-base-characters (pack page https://quaternius.com/packs/universalbasecharacters.html); download `Universal Base Characters[Standard].zip`, sha256 `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` |
| (animation clips in the same file) | Quaternius **Universal Animation Library** (Standard): `UAL1_Standard.glb` | CC0 1.0 (`License.txt` in the pack) | https://quaternius.itch.io/universal-animation-library; download `Universal Animation Library[Standard].zip`, sha256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` |
| (animation clips in the same file) | Quaternius **Universal Animation Library 2** (Standard): `UAL2_Standard.glb` | CC0 1.0 (`License.txt` in the pack) | https://quaternius.itch.io/universal-animation-library-2; download `Universal Animation Library 2[Standard].zip`, sha256 `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` |

Processing (`packages/city-scene/scripts/build-characters.ts`, run with `CHAR_SRC=<unzipped files>`): all textures
removed (clothing is painted per body zone by our shader), clothed zones smoothed and thickened, a shirt and belt
zone added, simplified crowd levels of detail added, clips trimmed to rotations (fingers held), and a `Typing_Loop`
clip derived from the seated and driving clips. Output: 2.4 MB, no textures. The source packs are not committed.
Output sha256 at the time of writing: see `git log` for `characters.glb` (rebuilds change it).
