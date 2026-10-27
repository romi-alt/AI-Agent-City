# Sales City — Fast Sales virtual city

A 3D city of car dealerships, the Fast Sales Training Center, Rick Case Honda's associate buildings and rental
buildings. Every floor is staffed by human and AI sales agents who work email / phone / text task lists.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Views
- **City** – orbit the city (day/night). Tap a building sign to pick it; tap again or pick a floor to go inside.
- **Office** – one floor: desks, labelled agents, status rings, live task board. Tap an agent for its card.
- **Dashboard** – KPIs and a card per building.
- Right panel: **LIVE** (KPIs, pipeline, activity feed, daily email report), **CRM**, **CONTENT** (social agents),
  **TEAM**, **OK** (approvals – offers and posts wait for you), **FLOORS** (rent rental floors at $199/mo).

## Code map
| File | What it holds |
| --- | --- |
| `src/data/buildings.ts` | City layout, every building's floors, departments and agents |
| `src/data/tasks.ts` | Task lists from the docs (dealership, Fast Sales, social media) |
| `src/sim.ts` | Simulation: agents pick tasks, leads move through the pipeline, approvals, daily report |
| `src/scene/*` | three.js engine, city view, office view, meshes/textures |
| `src/ui/app.ts` | Top bar, overlays, right panel, dashboard, report modal |

Agents are **simulated** – nothing is sent to real customers yet. See `SPEC.md` for the source requirements.
