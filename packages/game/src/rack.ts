import type { Ball, BallId, TableState, Vec2 } from '@dirtypool/contracts';
import {
  BALL_COUNT,
  BALL_DIAMETER,
  BALL_RADIUS,
  CUE_BALL_ID,
  FOOT_SPOT,
  HEAD_SPOT,
} from './table.const.js';

const SQRT3_OVER_2 = 0.8660254037844386;
// Standard-ish 8-ball rack read row by row from the apex: 8 sits in the centre of the third row.
const RACK_ORDER: readonly BallId[] = [1, 9, 2, 10, 8, 3, 11, 7, 14, 4, 5, 13, 15, 6, 12];

export function createRackedTable(): TableState {
  const balls: Ball[] = [createBall(CUE_BALL_ID, HEAD_SPOT)];
  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    const x = FOOT_SPOT.x + row * BALL_DIAMETER * SQRT3_OVER_2;
    const firstY = FOOT_SPOT.y - (row * BALL_DIAMETER) / 2;

    for (let column = 0; column <= row; column += 1) {
      const id = RACK_ORDER[index];

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

  return { balls };
}

export function placeCueBall(table: TableState, preferred: Vec2 = HEAD_SPOT): TableState {
  const others = table.balls.filter((ball) => ball.id !== CUE_BALL_ID && !ball.pocketed);
  let position = preferred;

  // Walk backwards toward the head rail until the cue ball no longer overlaps anything.
  while (others.some((ball) => overlaps(ball.position, position)) && position.x > BALL_RADIUS) {
    position = { x: position.x - BALL_RADIUS, y: position.y };
  }

  return {
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
