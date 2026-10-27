# Sales City

A city of car dealerships, each staffed by agents (greeter, sales, finance, service, manager).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

- `src/types.ts` – City / Dealership / Agent model
- `src/city.ts` – the layout: which dealerships exist, where, and who works there
- `src/render.ts` – placeholder top-down canvas renderer (to be replaced once the visual style is chosen)
- `src/main.ts` – entry point; click a building to list its agents
