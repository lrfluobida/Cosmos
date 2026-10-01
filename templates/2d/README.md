# Generic 2D project

Requires Node.js 22.22.2 and npm 10.9.7 or a compatible Node 22 release.

```powershell
npm ci
npm run build
npm run preview
```

Open http://127.0.0.1:4173 in a desktop browser. Click the mint sprite to change its color and count. Click the stage to move it. The scene button opens a second scene; its back button returns to the stage. Ctrl+C stops preview. `npm run dev` starts Vite for editing.

`src/main.ts` contains the generic sprite, pointer input and two scenes. `window.cosmosDebug` exposes frozen snapshots for observation only; it cannot set game state. Browser tests must use normal player input to change state.

This platform template is a generic interaction example. It contains no benchmark-specific game rules and is not a Cosmos-generated game. Initialization and builds need no model API credentials. Runtime roles, budgets and generated content are separate implementation tasks.

The sprite is drawn locally from basic shapes; no remote art, fonts or network services are required at play time. Dependency versions and integrity records are in `package-lock.json`.
