import type { Ball, BallId, TableState, Vec2 } from '@dirtypool/contracts';
import {
  BALL_COUNT,
  BALL_DIAMETER,
  BALL_RADIUS,
  CUE_BALL_ID,
  FOOT_SPOT,
  HEAD_SPOT,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './table.const.js';
import { clearOfTraps } from './traps.js';

const SQRT3_OVER_2 = 0.8660254037844386;
// Standard-ish 8-ball rack read row by row from the apex: 8 sits in the centre of the third row.
export const RACK_ORDER: readonly BallId[] = [1, 9, 2, 10, 8, 3, 11, 7, 14, 4, 5, 13, 15, 6, 12];
const APEX_SLOT = 0;
const EIGHT_SLOT = 4;
const BACK_CORNER_SLOTS: readonly [number, number] = [10, 14];
const RACK_SLOTS = 15;

// A fresh rack for every game, so the same break does not always drop the same ball: the 1 at
// the apex, the 8 in the middle, a solid and a stripe in the back corners, the rest anywhere.
// Randomness comes from the caller, which keeps this package free of Math.random.
export function rackOrder(random: () => number): readonly BallId[] {
  const solids = shuffle([2, 3, 4, 5, 6, 7], random);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], random);
  const corners = shuffle([solids.pop(), stripes.pop()], random);
  const rest = shuffle([...solids, ...stripes], random);
  const order: (BallId | undefined)[] = Array.from({ length: RACK_SLOTS }, () => undefined);

  order[APEX_SLOT] = 1;
  order[EIGHT_SLOT] = 8;
  order[BACK_CORNER_SLOTS[0]] = corners[0];
  order[BACK_CORNER_SLOTS[1]] = corners[1];

  return order.map((id) => id ?? rest.pop()).filter((id): id is BallId => id !== undefined);
}

export function createRackedTable(order: readonly BallId[] = RACK_ORDER): TableState {
  const balls: Ball[] = [createBall(CUE_BALL_ID, HEAD_SPOT)];
  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    const x = FOOT_SPOT.x + row * BALL_DIAMETER * SQRT3_OVER_2;
    const firstY = FOOT_SPOT.y - (row * BALL_DIAMETER) / 2;

    for (let column = 0; column <= row; column += 1) {
      const id = order[index];

      if (id === undefined) {
        throw new Error('Rack order is incomplete');
      }

      balls.push(createBall(id, { x, y: firstY + column * BALL_DIAMETER }));
      index += 1;
    }
  }

  balls.sort((a, b) => a.id - b.id);

  if (balls.length !== BALL_COUNT) {
    throw new Error('Rack must contain 16 balls');
  }

  return { balls, traps: [] };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const held = items[index];

    items[index] = items[other] as T;
    items[other] = held as T;
  }

  return items;
}

export function placeCueBall(table: TableState, preferred: Vec2 = HEAD_SPOT): TableState {
  const others = table.balls.filter((ball) => ball.id !== CUE_BALL_ID && !ball.pocketed);
  let position = preferred;

  // Walk backwards toward the head rail until the cue ball no longer overlaps anything.
  while (others.some((ball) => overlaps(ball.position, position)) && position.x > BALL_RADIUS) {
    position = { x: position.x - BALL_RADIUS, y: position.y };
  }

  return {
    ...table,
    balls: table.balls.map((ball) =>
      ball.id === CUE_BALL_ID ? createBall(CUE_BALL_ID, position) : ball,
    ),
  };
}

// Ball in hand: the cue ball may go anywhere on the cloth that is clear of other balls, traps and
// pocket mouths. Returns null when the spot is not allowed.
export function placeBallInHand(table: TableState, position: Vec2): TableState | null {
  const inside =
    position.x >= BALL_RADIUS &&
    position.x <= TABLE_WIDTH - BALL_RADIUS &&
    position.y >= BALL_RADIUS &&
    position.y <= TABLE_HEIGHT - BALL_RADIUS;
  const clearOfBalls = table.balls.every(
    (ball) => ball.id === CUE_BALL_ID || ball.pocketed || !overlaps(ball.position, position),
  );
  const clearOfPockets = POCKETS.every((pocket) => {
    const dx = position.x - pocket.position.x;
    const dy = position.y - pocket.position.y;
    const reach = pocket.radius + pocket.mouth;

    return dx * dx + dy * dy >= reach * reach;
  });

  if (!inside || !clearOfBalls || !clearOfPockets || !clearOfTraps(table, position)) {
    return null;
  }

  return {
    ...table,
    balls: table.balls.map((ball) =>
      ball.id === CUE_BALL_ID ? createBall(CUE_BALL_ID, position) : ball,
    ),
  };
}

function overlaps(a: Vec2, b: Vec2): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy < BALL_DIAMETER * BALL_DIAMETER;
}

function createBall(id: BallId, position: Vec2): Ball {
  return { id, position, velocity: { x: 0, y: 0 }, pocketed: false };
}
