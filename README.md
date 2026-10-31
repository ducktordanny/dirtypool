# Dirty Pool

> 8-ball pool for two friends, with traps.

Dirty Pool is a browser pool game where both players sabotage the table before shooting. Bumpers, walls, fans, portals, and black holes go down first, then the cue comes out. Every trap you place can hurt you too.

## Status

The base game is playable in hotseat mode: one screen, two players, simplified 8-ball rules. The API already hosts rooms and simulates shots for online play; the online UI and traps come next.

## Rules (v1)

- Players alternate. Any pocketed object ball scores a point and keeps the turn.
- The 8 must go last. Sinking it early loses the game.
- When the 8 goes down legally, the higher score wins (the shooter wins ties).
- A scratch or a shot that touches nothing passes the turn. After a scratch the cue ball goes back to the head spot.

## Plan

1. **Base** (done): deterministic simulation, Pixi table, drag-to-aim, hotseat play, websocket rooms.
2. **Traps**: simultaneous placement phase, five starter traps (bumper, wall, fan, portal, black hole), expiry after a few rounds.
3. **Online UI**: create/join a room by code, animate the opponent's shot, adopt the server state.
4. **Feel**: sounds, slow-mo on pocketing, shot clock, debug panel for physics knobs.

## Technology Stack

- **Frontend:** The current Angular LTS release with standalone components and signals; PixiJS for the table
- **Backend:** TypeScript, Node.js, and Fastify with `@fastify/websocket`
- **Contracts and validation:** Zod
- **Simulation:** a custom fixed-step engine in `packages/game`, shared by both sides and bit-for-bit deterministic
- **Package manager:** pnpm

## Repository Layout

```text
apps/
  ui/           # Angular application
  api/          # Fastify application
packages/
  contracts/    # Zod schemas and inferred types for game state and the websocket protocol
  game/         # Deterministic simulation and rules
```

## Local Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm start:api   # http://localhost:3000
pnpm start:ui    # http://localhost:4200
```

Copy `.env.example` to `.env` to override the API port or allowed origin.

```sh
pnpm test        # all packages
pnpm lint
pnpm format
```
