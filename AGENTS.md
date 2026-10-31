# AGENTS.md

## Project Overview

Dirty Pool is a two-player 8-ball pool game for the browser with a sabotage twist: before shooting, players place traps on the table that change how balls move. It is meant to be played by two friends, on one screen (hotseat) or online by sharing a room code.

The key product measure is whether a round is fun and fast: short turns, surprising physics, and no setup friction beyond opening a link.

## Stack

- Current Angular LTS frontend using standalone components and signals, rendering the table with PixiJS
- TypeScript and Node.js backend using Fastify with websockets for rooms
- Zod for the websocket protocol and runtime validation
- A framework-free, deterministic game simulation shared by frontend and backend
- pnpm workspace monorepo

Do not introduce Nx, a database, Redis, a message queue, or a physics engine without a concrete requirement. Rooms live in memory.

## Repository Layout

```text
apps/
  ui/           # Angular application
  api/          # Fastify application
packages/
  contracts/    # Zod schemas and inferred types for game state and the websocket protocol
  game/         # Deterministic simulation and rules, no framework or DOM dependencies
```

## Architecture Rules

- Keep the system a modular monolith.
- Share contracts and the game package with the frontend, never backend internals.
- Validate every websocket message from a client at runtime with schemas from `packages/contracts`.
- The server is authoritative for online games: it simulates each shot and broadcasts the resulting state. Clients animate the shot locally with the same simulation and then adopt the server state.
- Keep the simulation deterministic. Step with `FIXED_STEP` only, iterate balls in a fixed order, and use only arithmetic and `Math.sqrt` in simulation code. Never call trigonometric functions, `Math.random`, or `Date` inside `packages/game`.
- Keep `packages/game` pure: functions take state and return new state. No DOM, no Angular, no Node APIs.
- Separate physics (`physics.ts`), shot execution (`simulate.ts`), and rules (`rules.ts`). Rules read simulation events, they never touch ball positions directly except to place the cue ball.
- Traps are part of the table state and must be simulated by the same fixed-step code on both sides.

## Domain Guidelines

- Lengths are metres and speeds metres per second. The table is 2.24 x 1.12 m with a standard 57.15 mm ball.
- Ball ids are 0 (cue) to 15, with 8 as the eight ball. Ids are stable for the whole game; pocketed balls stay in the array with `pocketed: true`.
- Rules are 8-ball, lightly simplified: the first pocketed ball assigns solids/stripes, you must hit your own group first and pocket one of your own to keep the turn, the 8 must go last, a scratch or no-contact shot passes the turn. No called pockets and no ball in hand unless players ask.
- Shots are `{ direction, power }` with a unit direction and power in 0..1. The server never trusts anything else from a client.
- Traps must be able to hurt the player who placed them. Avoid trap designs that only affect the opponent.

## Frontend Guidelines

- Use the current Angular LTS release and standalone components everywhere.
- Prefer signals throughout: signal inputs, outputs, state, and computed values.
- Think in components. Keep `App` focused on composition, avoid 300+ line components that own an entire feature, and prefer a small number of smart components that compose focused dumb presentational components.
- Organize frontend code by responsibility: `components`, `services`, `types`, `utils`, and `config`. Do not leave unrelated files in a flat `app` directory.
- Use role suffixes in frontend filenames, such as `.component.ts`, `.service.ts`, `.const.ts`, `.type.ts`, and `.util.ts`.
- Keep the PixiJS rendering inside the table component. Game logic never imports `pixi.js`.
- Animate shots by stepping the shared simulation on each frame. Never interpolate or guess ball positions in the renderer.
- Prefer a collection of reusable UI element components over broad global styling. Keep global styles limited to document-level defaults and tokens.
- Use RxJS operators for HTTP and observable error flows instead of nested `try`/`catch`. Reserve `try`/`catch` for non-observable boundaries.
- Prefer powers-of-two values for spacing and sizing (`1`, `2`, `4`, `8`, `16`, `32`, `64`, `128`). When that scale does not fit, prefer even-number values.
- The table must be playable with mouse and touch, on phones and desktops.
- Do not add NgRx until application state demonstrates a need for it.
- Prefer component and directive `host` metadata over `@HostBinding` and `@HostListener` decorators.
- Avoid manual RxJS subscriptions. Prefer signals, Angular interoperability utilities, and declarative streams.
- Never nest subscriptions. When a manual subscription is unavoidable, make its lifetime and teardown explicit.

### Effects

Every dependency of an `effect` must be read first and assigned explicitly. Put all remaining work in `untracked` so incidental signal reads do not become dependencies.

```ts
effect(() => {
  const table = this.table();
  const viewport = this.viewport();

  untracked(() => {
    this.placeBalls(table, viewport);
  });
});
```

## Backend Guidelines

- Keep route handlers thin and place domain behavior in application modules such as `rooms`.
- Validate request and websocket boundaries with schemas from `packages/contracts`.
- Treat every client message as untrusted input and answer malformed messages with an error message instead of closing the socket.
- Never let a client decide whose turn it is or what the table looks like.

## Development Practices

- Use strict TypeScript settings.
- Do not use TypeScript's `any` type. Use a concrete type or `unknown` with explicit narrowing.
- In all frontend and backend classes, declare members in this order: public, protected, then private.
- ESLint and Prettier are configured at the repository root and run through Husky before commits.
- Prefer the smallest implementation that satisfies the current requirement.
- Add dependencies only when they provide concrete value over platform or framework capabilities.
- Add or update tests for behavior changes, especially physics, rules, and room handling. Determinism tests must stay bit-for-bit (`deepEqual`).
- Keep credentials in environment variables and out of version control.
- Update `README.md` when product scope, architecture, or major technology decisions change.

## Commit Messages

Follow Angular's commit-message convention:

```text
<type>(<scope>): <short summary>
```

- Use one of these types: `build`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, or `test`.
- Use the affected workspace package as the optional scope, such as `ui`, `api`, `contracts`, or `game`.
- Omit the scope for repository-wide changes or documentation that is not specific to one package.
- Write the summary in the imperative present tense, start it with a lowercase letter, and do not end it with a period.
- Include a body of at least 20 characters for every commit except `docs` commits. Explain the motivation and relevant behavior, not just the changed files.
- Use the footer for issue references, deprecations, and breaking changes. Begin breaking-change notices with `BREAKING CHANGE:`.
- Format reverts as `revert: <original header>` and explain the reverted commit and reason in the body.

Examples:

```text
feat(game): add bumper trap
fix(api): reject shots out of turn
docs: document local development
```
