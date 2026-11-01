import type { GameState, TableState, Trap, TrapKind, Vec2 } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  BUMPER_RADIUS,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TRAP_CLEARANCE,
  TRAP_LIFETIME_SHOTS,
} from './table.const.js';

// Solid part of a trap for placement: a well is a field, only its core needs clear cloth.
const FOOTPRINT: Readonly<Record<TrapKind, number>> = {
  bumper: BUMPER_RADIUS,
  well: BALL_RADIUS,
};

export type TrapPlacement =
  | { readonly kind: 'placed'; readonly game: GameState }
  | { readonly kind: 'not-aiming' | 'no-traps-left' | 'already-placed' | 'blocked' };

export function trapFootprint(kind: TrapKind): number {
  return FOOTPRINT[kind];
}

// The player on turn drops one trap from their pouch before shooting.
export function placeTrap(game: GameState, kind: TrapKind, position: Vec2): TrapPlacement {
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

  if (!canPlaceTrap(game.table, kind, position)) {
    return { kind: 'blocked' };
  }

  const trap: Trap = {
    id: game.table.traps.reduce((max, existing) => Math.max(max, existing.id + 1), 0),
    kind,
    owner: shooter,
    position,
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

// On the cloth and clear of balls, pocket mouths and other traps.
export function canPlaceTrap(table: TableState, kind: TrapKind, position: Vec2): boolean {
  const footprint = FOOTPRINT[kind];
  const inside =
    position.x >= footprint &&
    position.x <= TABLE_WIDTH - footprint &&
    position.y >= footprint &&
    position.y <= TABLE_HEIGHT - footprint;
  const clearOfBalls = table.balls.every(
    (ball) => ball.pocketed || !within(ball.position, position, footprint + BALL_RADIUS),
  );
  const clearOfPockets = POCKETS.every(
    (pocket) =>
      !within(pocket.position, position, footprint + pocket.radius + pocket.mouth + BALL_RADIUS),
  );
  const clearOfTraps = table.traps.every(
    (trap) => !within(trap.position, position, footprint + FOOTPRINT[trap.kind]),
  );

  return inside && clearOfBalls && clearOfPockets && clearOfTraps;
}

// Ball in hand and spotting must avoid trap footprints too.
export function clearOfTraps(table: TableState, position: Vec2): boolean {
  return table.traps.every(
    (trap) => !within(trap.position, position, FOOTPRINT[trap.kind] + BALL_RADIUS),
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

function within(a: Vec2, b: Vec2, reach: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const limit = reach + TRAP_CLEARANCE;

  return dx * dx + dy * dy < limit * limit;
}
