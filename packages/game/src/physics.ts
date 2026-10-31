import type { Ball, BallId, TableState } from '@dirtypool/contracts';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  BALL_RESTITUTION,
  CUE_BALL_ID,
  CUSHION_RESTITUTION,
  FIXED_STEP,
  LIP_OVERLAP,
  LIP_PULL,
  POCKETS,
  REST_SPEED,
  ROLLING_DECELERATION,
  SPEED_DRAG,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './table.const.js';

export type TableEvent =
  | { readonly kind: 'pocketed'; readonly ballId: BallId; readonly pocketIndex: number }
  | { readonly kind: 'cue-contact'; readonly ballId: BallId }
  | { readonly kind: 'cushion'; readonly ballId: BallId };

export interface StepResult {
  readonly table: TableState;
  readonly events: readonly TableEvent[];
}

interface MutableBall {
  readonly id: BallId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export function isAtRest(table: TableState): boolean {
  return table.balls.every(
    (ball) => ball.pocketed || (ball.velocity.x === 0 && ball.velocity.y === 0),
  );
}

// Advances the table by one FIXED_STEP. Pure: the input table is never mutated.
export function stepTable(table: TableState): StepResult {
  const balls = table.balls.map(toMutable);
  const events: TableEvent[] = [];

  integrate(balls);
  resolveBallCollisions(balls, events);
  resolveCushions(balls, events);
  pullIntoPockets(balls);
  capturePockets(balls, events);

  return { table: { balls: balls.map(toBall) }, events };
}

function integrate(balls: MutableBall[]): void {
  for (const ball of balls) {
    if (ball.pocketed) {
      continue;
    }

    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

    if (speed === 0) {
      continue;
    }

    const slowed = speed - (ROLLING_DECELERATION + SPEED_DRAG * speed) * FIXED_STEP;
    // On a pocket lip the ball keeps creeping until it drops, however slow it is.
    const resting = slowed <= REST_SPEED && !onPocketLip(ball);
    const factor = resting ? 0 : Math.max(slowed, 0) / speed;

    ball.vx *= factor;
    ball.vy *= factor;
    ball.x += ball.vx * FIXED_STEP;
    ball.y += ball.vy * FIXED_STEP;
  }
}

function resolveBallCollisions(balls: MutableBall[], events: TableEvent[]): void {
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];

    if (a === undefined || a.pocketed) {
      continue;
    }

    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];

      if (b === undefined || b.pocketed) {
        continue;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= BALL_DIAMETER * BALL_DIAMETER || distanceSquared === 0) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = (BALL_DIAMETER - distance) / 2;

      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const approachSpeed = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;

      if (approachSpeed <= 0) {
        continue;
      }

      const impulse = ((1 + BALL_RESTITUTION) / 2) * approachSpeed;

      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;

      if (a.id === CUE_BALL_ID) {
        events.push({ kind: 'cue-contact', ballId: b.id });
      }
    }
  }
}

function resolveCushions(balls: MutableBall[], events: TableEvent[]): void {
  for (const ball of balls) {
    if (ball.pocketed || inPocketMouth(ball)) {
      continue;
    }

    let hit = false;

    if (ball.x < BALL_RADIUS) {
      ball.x = BALL_RADIUS;
      hit = reflectX(ball, -1) || hit;
    } else if (ball.x > TABLE_WIDTH - BALL_RADIUS) {
      ball.x = TABLE_WIDTH - BALL_RADIUS;
      hit = reflectX(ball, 1) || hit;
    }

    if (ball.y < BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      hit = reflectY(ball, -1) || hit;
    } else if (ball.y > TABLE_HEIGHT - BALL_RADIUS) {
      ball.y = TABLE_HEIGHT - BALL_RADIUS;
      hit = reflectY(ball, 1) || hit;
    }

    if (hit) {
      events.push({ kind: 'cushion', ballId: ball.id });
    }
  }
}

// Reflects only when the ball is still moving into the cushion (outward sign given).
function reflectX(ball: MutableBall, outward: number): boolean {
  if (ball.vx * outward <= 0) {
    return false;
  }

  ball.vx = -ball.vx * CUSHION_RESTITUTION;

  return true;
}

function reflectY(ball: MutableBall, outward: number): boolean {
  if (ball.vy * outward <= 0) {
    return false;
  }

  ball.vy = -ball.vy * CUSHION_RESTITUTION;

  return true;
}

// Inside the pocket opening the cushions give way.
function inPocketMouth(ball: MutableBall): boolean {
  return POCKETS.some((pocket) => {
    const dx = ball.x - pocket.position.x;
    const dy = ball.y - pocket.position.y;
    const reach = pocket.radius + pocket.mouth;

    return dx * dx + dy * dy < reach * reach;
  });
}

// Overlapping the hole enough to tip in, or already past the nose line inside the mouth.
function onPocketLip(ball: MutableBall): boolean {
  const pastNose =
    ball.x < BALL_RADIUS ||
    ball.x > TABLE_WIDTH - BALL_RADIUS ||
    ball.y < BALL_RADIUS ||
    ball.y > TABLE_HEIGHT - BALL_RADIUS;

  return POCKETS.some((pocket) => {
    const dx = ball.x - pocket.position.x;
    const dy = ball.y - pocket.position.y;
    const squared = dx * dx + dy * dy;
    const mouth = pocket.radius + pocket.mouth;
    const lip = pocket.radius + BALL_RADIUS * (1 - LIP_OVERLAP);

    return squared < lip * lip || (pastNose && squared < mouth * mouth);
  });
}

// A ball on a pocket lip rolls in instead of stopping on the edge.
function pullIntoPockets(balls: MutableBall[]): void {
  for (const ball of balls) {
    if (ball.pocketed || !onPocketLip(ball)) {
      continue;
    }

    for (const pocket of POCKETS) {
      const dx = pocket.position.x - ball.x;
      const dy = pocket.position.y - ball.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0 && distance < pocket.radius + pocket.mouth) {
        ball.vx += (dx / distance) * LIP_PULL * FIXED_STEP;
        ball.vy += (dy / distance) * LIP_PULL * FIXED_STEP;
      }
    }
  }
}

function capturePockets(balls: MutableBall[], events: TableEvent[]): void {
  for (const ball of balls) {
    if (ball.pocketed) {
      continue;
    }

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex += 1) {
      const pocket = POCKETS[pocketIndex];

      if (pocket === undefined) {
        continue;
      }

      const dx = ball.x - pocket.position.x;
      const dy = ball.y - pocket.position.y;

      if (dx * dx + dy * dy < pocket.radius * pocket.radius) {
        ball.pocketed = true;
        ball.x = pocket.position.x;
        ball.y = pocket.position.y;
        ball.vx = 0;
        ball.vy = 0;
        events.push({ kind: 'pocketed', ballId: ball.id, pocketIndex });
        break;
      }
    }
  }
}

function toMutable(ball: Ball): MutableBall {
  return {
    id: ball.id,
    x: ball.position.x,
    y: ball.position.y,
    vx: ball.velocity.x,
    vy: ball.velocity.y,
    pocketed: ball.pocketed,
  };
}

function toBall(ball: MutableBall): Ball {
  return {
    id: ball.id,
    position: { x: ball.x, y: ball.y },
    velocity: { x: ball.vx, y: ball.vy },
    pocketed: ball.pocketed,
  };
}
