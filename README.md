# Dirty Pool

> 8-ball pool for two friends, with traps.

Dirty Pool is a browser pool game where both players sabotage the table before shooting. A trap goes down first, then the cue comes out. Every trap you place can hurt you too.

## Status

Playable in hotseat mode and online, with simplified 8-ball rules and four traps: bumpers, walls, gravity wells and black holes.

## Rules (v1)

- The table stays open after the break whatever drops; potting on the break keeps the turn. The first pocketed ball after that gives the shooter that group (solids or stripes); the opponent gets the other. While the table is open, any first contact but the 8 is fine.
- You must hit one of your own balls first, and you keep the turn only when one of your own balls drops. Pocketing only an opponent's ball passes the turn.
- The 8 must go last: sink it after clearing your group to win, any earlier and you lose. Sinking it on the break wins outright.
- A scratch, a wrong first contact, a shot that touches nothing or running out the shot clock is a foul: the turn passes and the opponent gets ball in hand, dragging the cue ball anywhere clear before shooting.
- Traps: each player starts with a pouch of four. Before a shot, the player on turn may drop one anywhere clear of balls, pockets and other traps. A trap lasts three shots (including timeouts) and is simulated for everyone, the placer included. A **bumper** is a fixed post balls bounce off; a **wall** is a short rubber bar at one of four angles; a **gravity well** pulls every ball inside its reach towards its centre, hard enough to capture a slow one, and a ball left resting on its slope rolls in on the next shot; a **black hole** pulls the same way and swallows any ball that reaches its middle, which counts as pocketed, so it can scratch you or decide the game on the 8.

## Plan

1. **Base** (done): deterministic simulation, Pixi table, aim-and-power controls with a cue, spin (top, back and side) set on the cue ball, hotseat play, websocket rooms.
2. **Online UI** (done): pick a nickname, create a room, join by code or pick an open room from the list on the home page, `/room/CODE` works as an invite link, shots are animated locally and the server state is adopted. A room seats two players; a third join is refused. A 30 second shot clock passes the turn, enforced by the server online and locally in hotseat. A dropped connection or a refresh rejoins the same seat: seats are held for two minutes and the browser keeps a per-tab seat token.
3. **Traps** (in progress): drop one on your own turn; bumper, wall, gravity well and black hole done. Next: the aim guide should account for traps, then fans or portals if the table needs more chaos.
4. **Feel**: debug panel for physics knobs.

## Technology Stack

- **Frontend:** The current Angular LTS release with standalone components and signals; PixiJS for the table, with balls drawn as shaded spheres by a WebGL 2 shader
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
pnpm start:api   # http://localhost:3001
pnpm start:ui    # http://localhost:4200
```

Copy `.env.example` to `.env` to override the API port or allowed origin.

```sh
pnpm test        # all packages
pnpm lint
pnpm format
```
