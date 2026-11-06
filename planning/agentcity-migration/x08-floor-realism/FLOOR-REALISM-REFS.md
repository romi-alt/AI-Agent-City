# Floor realism: what the design-refs pack contains and how to use it

Source: `f10becbf-agent-city-design-refs.zip` = one `PROMPT.md` (9.7 KB) + 9 screenshots. There is no code, model, texture or
config in it. Everything "build related" is the prompt (a UI and camera brief) and photos of a luxury-tower site on a
monitor. The screenshots are small (150-500 px wide, filmed off a curved screen), so they show mood, not detail.

## 1. The screenshots (in `floor-refs-screenshots/`, contact sheet `floor-refs-contact-sheet.png`)

| File | Shows | Take for the floor |
|---|---|---|
| 01, 02, 03 | Tower at blue hour, frosted-glass picker panel docked right, big thin level number, slider | Picker UI only |
| 04, 05 | Panel gone, hairline top bar; camera rises and pushes toward the tower | Camera ladder: establishing, approach |
| 06 | Camera passes through the glass into an apartment | One continuous move into a floor, no cut |
| 07 | Interior arrival: wide room, floor-to-ceiling glass, headline bottom-left, hotspot pills | **Main interior reference** |
| 08 | Doorway transition (motion blur) | Hotspot flies through a door |
| 09 | Sub-room (bathroom) with its own headline and "Back to ..." link | Sub-space view |

Interior realism cues visible in 06-09:
- **Light:** warm 2700-3000 K cove strips hidden in ceiling recesses and under shelves, against cool blue dusk through the windows. Warm and cool never mix in one source.
- **Materials:** light timber veneer panelling, pale stone or large-format floor, white soft furnishings. Few materials, repeated.
- **Glass:** full-height windows with thin mullions, a real city or sea view behind, slight reflection.
- **Furniture:** low and sparse, lots of floor visible, nothing floating or tiny.
- **Framing:** wide lens from a doorway or corner, camera at about eye height, strong one-point perspective; a door in frame gives depth.
- **Text:** one light headline and one line of copy at the bottom left over a dark gradient; frosted pills as hotspots.

## 2. What PROMPT.md asks for (extract)

- **Experience:** calm "choose your floor" site. Hero = scene + one glass panel. Choose by slider / arrows / click, press CTA, one curved camera move through the facade into the office, hotspots fly into sub-spaces, back links reverse it.
- **Mapping:** tower = skyline; floor = agent or district; level number = agent index or key metric; unit type = agent role; hotspots = workspaces (Pipeline, Live calls, Inbox, Tasks, Performance); CTA = "Deploy agent" / "Open dashboard".
- **Components:** TopBar, AgentPicker, SelectionMarker (gold glow, others dim to about 70%), CameraDirector (named shots: establishing, approach, entry, interior, plus one per hotspot, GSAP along a CatmullRom curve), SceneHeadline, Hotspot, `useCityState` (city, flying, office, flying, workspace; input locked while flying).
- **Motion:** slider 250 ms; panel exit 400 ms; city to office 3.0 s power3.inOut with FOV 50 to 42; office to workspace 2.0 s; back 2.2 s; headline 600 ms with 120 ms stagger; hotspots in 300 ms after the camera settles. Reduced motion = 400 ms crossfade. Optional depth of field, vignette, slight motion blur.
- **Tokens:** `--accent #E8C27A` gold is the only accent; `--glass-bg rgba(255,255,255,.12)`, border `.26`, blur 22 px; Inter or Manrope in light weights; radius 6 px panel, 3 px buttons, pills 999 px; spacing 4/8/12/16/24/32/48/64; headline 72 px/300 (40 px mobile).
- **Scene rules:** blue-hour light (cool hemisphere, low warm sun, warm window emissives, light fog); restrained materials (glass, concrete, warm light); hero framed low with lots of sky and the target offset left of centre so the panel never covers it.
- **Performance:** 60 fps, DPR cap 1.75, instancing, lazy interiors.
- **Done when:** a checklist and a one-by-one comparison against the screenshots.

## 3. Conflicts with what we have (decide before building)

1. The prompt says "no saturated colours in the 3D scene". You asked for very colourful daytime buildings. Resolution: keep the colour in the city, apply the restraint inside the floor and the UI layer.
2. It says to use R3F, drei and GSAP. Our engine is plain Three.js with its own camera moves (`flyTo`), so we would reuse the engine's camera and add only GSAP-style curved paths, not rewrite in R3F.
3. It asks to wait for plan approval before big refactors.
4. The picker is "choose your floor / agent". We already have floors, buildings and agents; the picker would sit on top of the existing CityStore modes.

## 4. Prompts to make our floor more realistic (ready to run)

Each prompt targets the Fast Sales HQ floor in `apps/web/components/asc/engine/office.ts` (desks, agents, lights),
`people.ts` (agents) and `AscCityView.tsx` (camera and UI). Run one at a time.

**P1 Lighting like the references**
"On the Fast Sales floor, replace the flat ceiling light with warm cove lighting: emissive strips (about 2800 K) in ceiling
recesses and under shelving, and keep the window light cool blue at dusk. Add soft area-light falloff on the desks and a
low-intensity bloom. Do not tint the whole room one colour: warm sources stay warm, window light stays cool. Check day,
evening and night."

**P2 Materials**
"Reduce the floor to a few materials: light timber veneer on partitions and shelving, pale large-format stone or polished
concrete floor with a faint reflection, white or soft grey upholstery, dark metal for frames. Add subtle roughness maps
and a slight floor reflection. Remove the saturated colours inside the floor (leave the city outside as it is)."

**P3 Glass and the view**
"Make the outer wall floor-to-ceiling glass with thin mullions and a faint reflection, and put the live New York skyline
behind it at the time of day. Add a low parapet or window sill line so the eye reads a real building."

**P4 Layout and furniture scale**
"Re-space the desks into clear rows with aisles, a glass-walled meeting room, a reception or lounge corner with low
seating and a rug, plants, shelving and one feature wall. Keep furniture sparse and at real scale, with the floor visible.
No desk or chair may clip a wall or another desk."

**P5 Camera**
"Add named shots for the floor: establishing, entry through the glass, interior from a doorway at eye height (wide lens,
one-point perspective), and one per workspace hotspot. Move between them with one continuous curved path, no cuts, FOV
50 to 42 on entry, 2 to 3 s, power3.inOut. Respect reduced motion with a 400 ms crossfade."

**P6 UI layer**
"Add the glass panel picker, hairline top bar, bottom-left headline with a dark gradient, and frosted hotspot pills using
the token file in section 2. Gold is the only accent. Keep the tags and wall screens we already have, but dim them while
a flight is running."

**P7 Verify**
"Screenshot each shot at 1440x900 and 390x844, compare with floor-refs 06-09 one by one, list the differences and fix
what you can. Report frame rate honestly: only software rendering is available here, so say it is unmeasured."

## 4b. Suggested order

P1 lighting, then P2 materials, then P3 glass, P4 layout, P5 camera, P6 UI, P7 verify. P1 to P4 change the look and are
the "more realistic floor" you asked for; P5 and P6 are the cinematic flow from the prompt.

## Limits

- The references are phone or monitor captures at low resolution; I read mood and layout, not exact colours or sizes.
- The prompt is for a generic R3F project, so some of its details do not match our engine.
- Nothing here has been built or tested yet.
