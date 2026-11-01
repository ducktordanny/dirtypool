import type {
  GameState,
  TableState,
  Trap,
  TrapKind,
  TrapRequest,
  Vec2,
} from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  BUMPER_RADIUS,
  POCKETS,
  PORTAL_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TRAP_CLEARANCE,
  TRAP_LIFETIME_SHOTS,
  WALL_HALF_LENGTH,
  WALL_RADIUS,
} from './table.const.js';
import { normalize } from './vec2.util.js';

// Solid part of a round trap for placement: fields such as wells only need their core clear.
// A portal mouth also keeps a ball's width free so what comes out of it has room to land.
const DISC_FOOTPRINT: Readonly<Record<Exclude<TrapKind, 'wall' | 'plug'>, number>> = {
  bumper: BUMPER_RADIUS,
  spring: BUMPER_RADIUS,
  fan: BALL_RADIUS,
  well: BALL_RADIUS,
  magnet: BALL_RADIUS,
  hole: BALL_RADIUS,
  mud: BALL_RADIUS,
  ice: BALL_RADIUS,
  portal: PORTAL_RADIUS + BALL_RADIUS,
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

export function needsDirection(kind: TrapKind): boolean {
  return kind === 'wall' || kind === 'fan';
}

export function needsGroup(kind: TrapKind): boolean {
  return kind === 'magnet';
}

export function needsExit(kind: TrapKind): boolean {
  return kind === 'portal';
}

// Radius of the disc a trap needs clear around its centre, for marking a blocked drop.
export function trapFootprint(kind: TrapKind): number {
  switch (kind) {
    case 'wall':
      return WALL_HALF_LENGTH + WALL_RADIUS;
    case 'plug':
      return POCKETS[0]?.radius ?? BALL_RADIUS;
    default:
      return DISC_FOOTPRINT[kind];
  }
}

// A plug lands on the pocket under it; everything else goes exactly where it was dropped.
export function snapTrapPosition(kind: TrapKind, position: Vec2): Vec2 {
  return kind === 'plug' ? (pocketUnder(position)?.position ?? position) : position;
}

// The player on turn drops one trap from their pouch before shooting.
export function placeTrap(game: GameState, request: TrapRequest): TrapPlacement {
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

  const prepared = prepare(request);

  if (prepared === null || !fits(game.table, prepared)) {
    return { kind: 'blocked' };
  }

  const trap: Trap = {
    ...prepared,
    id: game.table.traps.reduce((max, existing) => Math.max(max, existing.id + 1), 0),
    owner: shooter,
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

// On the cloth and clear of balls, pocket mouths and other traps; a plug must sit on a free
// pocket instead. Walls and fans need a direction, magnets a group, portals a second mouth.
export function canPlaceTrap(table: TableState, request: TrapRequest): boolean {
  const prepared = prepare(request);

  return prepared !== null && fits(table, prepared);
}

// Whether the first mouth of a portal can go here, before the player has picked the other one.
export function canPlacePortalMouth(table: TableState, position: Vec2): boolean {
  return fits(table, { kind: 'portal', position });
}

// Ball in hand and spotting must avoid trap footprints too.
export function clearOfTraps(table: TableState, position: Vec2): boolean {
  return table.traps.every((trap) =>
    footprint(trap).every(({ point, radius }) => !within(point, position, radius + BALL_RADIUS)),
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

// Normalises a request into exactly the fields the trap will carry, or null when a required
// one is missing or unusable.
function prepare(request: TrapRequest): TrapRequest | null {
  const { kind } = request;
  const position = snapTrapPosition(kind, request.position);
  const direction =
    needsDirection(kind) && request.direction !== undefined
      ? normalize(request.direction)
      : undefined;
  const group = needsGroup(kind) ? request.group : undefined;
  const exit = needsExit(kind) ? request.exit : undefined;

  if (
    needsDirection(kind) &&
    (direction === undefined || (direction.x === 0 && direction.y === 0))
  ) {
    return null;
  }

  if (needsGroup(kind) && group === undefined) {
    return null;
  }

  if (needsExit(kind) && (exit === undefined || within(exit, position, trapFootprint(kind) * 2))) {
    return null;
  }

  return {
    kind,
    position,
    ...(direction === undefined ? {} : { direction }),
    ...(group === undefined ? {} : { group }),
    ...(exit === undefined ? {} : { exit }),
  };
}

function fits(table: TableState, request: TrapRequest): boolean {
  if (request.kind === 'plug') {
    const pocket = pocketUnder(request.position);

    return (
      pocket !== null &&
      !table.traps.some((trap) => trap.kind === 'plug' && samePoint(trap.position, pocket.position))
    );
  }

  const existing = table.traps.flatMap(footprint);

  return footprint(request).every(
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

function footprint(trap: TrapRequest): Footprint[] {
  switch (trap.kind) {
    case 'plug':
      return [{ point: trap.position, radius: pocketUnder(trap.position)?.radius ?? BALL_RADIUS }];
    case 'wall': {
      const along = trap.direction ?? { x: 1, y: 0 };

      return Array.from({ length: WALL_SAMPLES }, (_, index) => {
        const offset = (index / (WALL_SAMPLES - 1) - 0.5) * 2 * WALL_HALF_LENGTH;

        return {
          point: { x: trap.position.x + along.x * offset, y: trap.position.y + along.y * offset },
          radius: WALL_RADIUS,
        };
      });
    }
    case 'portal': {
      const radius = DISC_FOOTPRINT.portal;

      return trap.exit === undefined
        ? [{ point: trap.position, radius }]
        : [
            { point: trap.position, radius },
            { point: trap.exit, radius },
          ];
    }
    default:
      return [{ point: trap.position, radius: DISC_FOOTPRINT[trap.kind] }];
  }
}

function pocketUnder(position: Vec2): (typeof POCKETS)[number] | null {
  return (
    POCKETS.find((pocket) => {
      const dx = position.x - pocket.position.x;
      const dy = position.y - pocket.position.y;
      const reach = pocket.radius + pocket.mouth;

      return dx * dx + dy * dy < reach * reach;
    }) ?? null
  );
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

function within(a: Vec2, b: Vec2, reach: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const limit = reach + TRAP_CLEARANCE;

  return dx * dx + dy * dy < limit * limit;
}
