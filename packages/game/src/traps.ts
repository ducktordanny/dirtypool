import type { GameState, TableState, Trap, TrapKind, Vec2 } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  BUMPER_RADIUS,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TRAP_CLEARANCE,
  TRAP_LIFETIME_SHOTS,
  WALL_HALF_LENGTH,
  WALL_RADIUS,
} from './table.const.js';
import { normalize } from './vec2.util.js';

// Solid part of a round trap for placement: a well or hole is a field, only its core needs
// clear cloth.
const DISC_FOOTPRINT: Readonly<Record<Exclude<TrapKind, 'wall'>, number>> = {
  bumper: BUMPER_RADIUS,
  well: BALL_RADIUS,
  hole: BALL_RADIUS,
};
// A wall is checked at this many points along its length.
const WALL_SAMPLES = 5;

interface Footprint {
  readonly point: Vec2;
  readonly radius: number;
}

export type TrapPlacement =
  | { readonly kind: 'placed'; readonly game: GameState }
  | { readonly kind: 'not-aiming' | 'no-traps-left' | 'already-placed' | 'blocked' };

// Radius of the disc a trap needs clear around its centre, for marking a blocked drop.
export function trapFootprint(kind: TrapKind): number {
  return kind === 'wall' ? WALL_HALF_LENGTH + WALL_RADIUS : DISC_FOOTPRINT[kind];
}

// The player on turn drops one trap from their pouch before shooting.
export function placeTrap(
  game: GameState,
  kind: TrapKind,
  position: Vec2,
  direction?: Vec2,
): TrapPlacement {
  if (game.phase !== 'aiming') {
    return { kind: 'not-aiming' };
  }

  const shooter = game.currentPlayer;
  const player = game.players[shooter];

  if (player.trapsLeft === 0) {
    return { kind: 'no-traps-left' };
  }

  if (game.trapPlaced) {
    return { kind: 'already-placed' };
  }

  const along = wallDirection(kind, direction);

  if (!canPlaceTrap(game.table, kind, position, along)) {
    return { kind: 'blocked' };
  }

  const trap: Trap = {
    id: game.table.traps.reduce((max, existing) => Math.max(max, existing.id + 1), 0),
    kind,
    owner: shooter,
    position,
    ...(along === undefined ? {} : { direction: along }),
    shotsLeft: TRAP_LIFETIME_SHOTS,
  };
  const players: GameState['players'] = [
    shooter === 0 ? { ...player, trapsLeft: player.trapsLeft - 1 } : game.players[0],
    shooter === 1 ? { ...player, trapsLeft: player.trapsLeft - 1 } : game.players[1],
  ];

  return {
    kind: 'placed',
    game: {
      ...game,
      players,
      table: { ...game.table, traps: [...game.table.traps, trap] },
      trapPlaced: true,
    },
  };
}

// On the cloth and clear of balls, pocket mouths and other traps. A wall needs a direction.
export function canPlaceTrap(
  table: TableState,
  kind: TrapKind,
  position: Vec2,
  direction?: Vec2,
): boolean {
  const along = wallDirection(kind, direction);

  if (kind === 'wall' && along === undefined) {
    return false;
  }

  const existing = table.traps.flatMap((trap) =>
    footprint(trap.kind, trap.position, trap.direction),
  );

  return footprint(kind, position, along).every(
    ({ point, radius }) =>
      point.x >= radius &&
      point.x <= TABLE_WIDTH - radius &&
      point.y >= radius &&
      point.y <= TABLE_HEIGHT - radius &&
      table.balls.every(
        (ball) => ball.pocketed || !within(ball.position, point, radius + BALL_RADIUS),
      ) &&
      POCKETS.every(
        (pocket) =>
          !within(pocket.position, point, radius + pocket.radius + pocket.mouth + BALL_RADIUS),
      ) &&
      existing.every((other) => !within(other.point, point, radius + other.radius)),
  );
}

// Ball in hand and spotting must avoid trap footprints too.
export function clearOfTraps(table: TableState, position: Vec2): boolean {
  return table.traps.every((trap) =>
    footprint(trap.kind, trap.position, trap.direction).every(
      ({ point, radius }) => !within(point, position, radius + BALL_RADIUS),
    ),
  );
}

// Every shot uses up one life of every trap; the ones that run out disappear.
export function ageTraps(table: TableState): TableState {
  if (table.traps.length === 0) {
    return table;
  }

  return {
    ...table,
    traps: table.traps
      .filter((trap) => trap.shotsLeft > 1)
      .map((trap) => ({ ...trap, shotsLeft: trap.shotsLeft - 1 })),
  };
}

function wallDirection(kind: TrapKind, direction: Vec2 | undefined): Vec2 | undefined {
  if (kind !== 'wall' || direction === undefined) {
    return undefined;
  }

  const unit = normalize(direction);

  return unit.x === 0 && unit.y === 0 ? undefined : unit;
}

function footprint(kind: TrapKind, position: Vec2, direction: Vec2 | undefined): Footprint[] {
  if (kind !== 'wall') {
    return [{ point: position, radius: DISC_FOOTPRINT[kind] }];
  }

  const along = direction ?? { x: 1, y: 0 };

  return Array.from({ length: WALL_SAMPLES }, (_, index) => {
    const offset = (index / (WALL_SAMPLES - 1) - 0.5) * 2 * WALL_HALF_LENGTH;

    return {
      point: { x: position.x + along.x * offset, y: position.y + along.y * offset },
      radius: WALL_RADIUS,
    };
  });
}

function within(a: Vec2, b: Vec2, reach: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const limit = reach + TRAP_CLEARANCE;

  return dx * dx + dy * dy < limit * limit;
}
