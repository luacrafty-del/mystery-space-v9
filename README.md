# Space Mystery — Multiplayer

This adds real-time multiplayer on top of the original prototype: every
player sees every other connected player moving around the map live.

## What changed

- **`server.js`** (new) — a small Node.js server. It serves the game's
  files AND relays player positions over WebSocket to everyone else
  connected.
- **`network.js`** (new) — client-side code that connects to the
  server, spawns/moves/removes the crewmates for other players, and
  sends your own position ~20x/second (only while you're actually
  moving).
- **`player.js`** — the crewmate mesh (body + visor) was pulled out
  into a reusable `createCrewmate(color)` function so remote players
  can be drawn with the same model, just a different color.
- **`game.js`** — the main loop now also interpolates remote players
  and broadcasts your position each frame.
- **`index.html` / `style.css`** — added a small "Online: N players"
  status readout, and removed a stray leftover `9` character that was
  rendering on screen.

Each player is assigned a distinct color (red/blue/yellow/green/pink/
orange/cyan/purple) by the server when they connect.

## Running it

You need [Node.js](https://nodejs.org) installed.

```bash
npm install
npm start
```

Then open `http://localhost:8080` in a browser. Open it again in a
second tab/window (or from another device on the same network using
your computer's local IP, e.g. `http://192.168.1.23:8080`) to see a
second player join.

To let friends outside your network play, deploy `server.js` to any
Node host (Render, Railway, Fly.io, a VPS, etc.) — it needs nothing
but Node and the `ws` package, no database.

## Notes / limitations

- Player state (position, color) lives only in server memory — nobody
  persists across a server restart, and there's no lobby/room system;
  everyone who connects is in the same shared map.
- The wire-connecting task UI in `task.js`/`taskOverlay` was already
  incomplete in the original file (no click handlers, missing
  `#leftWires` element) — that's unchanged; this pass focused purely
  on making movement/presence multiplayer.
- `ai.js` was empty in the original upload and is still empty.
