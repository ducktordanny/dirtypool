import type { Ball, BallId, TableState, Trap, Vec2 } from '@dirtypool/contracts';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  BALL_RESTITUTION,
  BUMPER_RADIUS,
  BUMPER_RESTITUTION,
  CUE_BALL_ID,
  CUSHION_RESTITUTION,
  EIGHT_BALL_ID,
  FAN_HALF_WIDTH,
  FAN_PUSH,
  FAN_REACH,
  FIXED_STEP,
  HOLE_RADIUS,
  ICE_FRICTION,
  ICE_RADIUS,
  LIP_OVERLAP,
  LIP_PULL,
  MUD_FRICTION,
  MUD_RADIUS,
  POCKETS,
  REST_SPEED,
  ROLLING_DECELERATION,
  SIDE_SPIN_GRIP,
  SPEED_DRAG,
  SPIN_DECAY,
  SPRING_MAX_EXIT,
  SPRING_RESTITUTION,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  WALL_HALF_LENGTH,
  WALL_RADIUS,
  WELL_CORE,
  WELL_DRAG,
  WELL_PULL,
  WELL_RADIUS,
} from './table.const.js';

// Balls this close, relative to their diameter, count as touching.
const CONTACT_SLACK = 1.02;

export type TableEvent =
  | { readonly kind: 'pocketed'; readonly ballId: BallId; readonly pocketIndex: number }
  | { readonly kind: 'cue-contact'; readonly ballId: BallId }
  // Impact speeds are the closing speed along the contact normal, in m/s, for sound.
  | {
      readonly kind: 'collision';
      readonly ballIds: readonly [BallId, BallId];
      readonly speed: number;
    }
  | { readonly kind: 'cushion'; readonly ballId: BallId; readonly speed: number }
  | {
      readonly kind: 'bumper';
      readonly trapId: number;
      readonly ballId: BallId;
      readonly speed: number;
    }
  // A hole ate the ball; the rules treat it exactly like a pocketed one.
  | { readonly kind: 'swallowed'; readonly trapId: number; readonly ballId: BallId };

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
  sx: number;
  sy: number;
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
  const plugged = pluggedPockets(table.traps);

  integrate(balls, table.traps, plugged);
  resolveBallCollisions(balls, events);
  resolveBumpers(balls, table.traps, events);
  resolveWalls(balls, table.traps, events);
  resolveCushions(balls, table.traps, plugged, events);
  pullIntoPockets(balls, plugged);
  capturePockets(balls, plugged, events);
  swallow(balls, table.traps, events);

  return { table: { balls: balls.map(toBall), traps: table.traps }, events };
}

function integrate(
  balls: MutableBall[],
  traps: readonly Trap[],
  plugged: readonly boolean[],
): void {
  for (const ball of balls) {
    if (ball.pocketed) {
      continue;
    }

    const well = fieldPull(ball, traps);
    const cloth = clothFriction(ball, traps);
    const friction = ROLLING_DECELERATION * cloth;
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

    if (speed === 0) {
      ball.sx = 0;
      ball.sy = 0;
    } else {
      ball.sx = decay(ball.sx, SPIN_DECAY * FIXED_STEP);
      ball.sy = decay(ball.sy, SPIN_DECAY * FIXED_STEP);
    }

    const slowed = speed - (friction + SPEED_DRAG * cloth * speed) * FIXED_STEP;
    // On a pocket lip the ball keeps creeping until it drops, however slow it is, and a field
    // that out-pulls the cloth keeps it moving unless another ball is already in the way.
    const resting =
      slowed <= REST_SPEED &&
      !onPocketLip(ball, plugged) &&
      (well.strength <= friction || propped(ball, balls, well));
    const factor = resting || speed === 0 ? 0 : Math.max(slowed, 0) / speed;

    ball.vx *= factor;
    ball.vy *= factor;

    // The pull comes after friction so a ball turning round on the slope never reads as at rest.
    if (!resting && well.strength > 0) {
      ball.vx = ball.vx * well.damping + well.x * FIXED_STEP;
      ball.vy = ball.vy * well.damping + well.y * FIXED_STEP;
    }

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
      const aBefore = { vx: a.vx, vy: a.vy };
      const bBefore = { vx: b.vx, vy: b.vy };

      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
      applyFollow(a, aBefore, impulse);
      applyFollow(b, bBefore, impulse);

      if (a.id === CUE_BALL_ID) {
        events.push({ kind: 'cue-contact', ballId: b.id });
      }

      events.push({ kind: 'collision', ballIds: [a.id, b.id], speed: approachSpeed });
    }
  }
}

interface WellPull {
  // Acceleration towards the wells, in m/s^2.
  x: number;
  y: number;
  // The strongest single pull, which decides whether the cloth can hold the ball still.
  strength: number;
  // Velocity kept per step by the wells' drag.
  damping: number;
}

// A ball touching another on its downhill side cannot roll any further in. Without this, balls
// crowded into a well would jostle each other forever and the shot would never end.
function propped(ball: MutableBall, balls: readonly MutableBall[], pull: WellPull): boolean {
  const reach = BALL_DIAMETER * CONTACT_SLACK;

  return balls.some((other) => {
    if (other === ball || other.pocketed) {
      return false;
    }

    const dx = other.x - ball.x;
    const dy = other.y - ball.y;

    return dx * dx + dy * dy < reach * reach && dx * pull.x + dy * pull.y > 0;
  });
}

// Every field acting on the ball: wells and holes pull everything, a magnet pulls its group only
// and a fan pushes along its direction while the ball is over it. Resting balls feel them too, so
// one left on a slope or under a fan moves as soon as the table is stepped.
function fieldPull(ball: MutableBall, traps: readonly Trap[]): WellPull {
  const result: WellPull = { x: 0, y: 0, strength: 0, damping: 1 };

  for (const trap of traps) {
    if (trap.kind === 'fan' && trap.direction !== undefined) {
      const along = trap.direction;
      const dx = ball.x - trap.position.x;
      const dy = ball.y - trap.position.y;
      const forward = dx * along.x + dy * along.y;
      const sideways = -dx * along.y + dy * along.x;

      if (Math.abs(forward) < FAN_REACH && Math.abs(sideways) < FAN_HALF_WIDTH) {
        result.x += along.x * FAN_PUSH;
        result.y += along.y * FAN_PUSH;
        result.strength = Math.max(result.strength, FAN_PUSH);
      }

      continue;
    }

    if (
      (trap.kind !== 'well' && trap.kind !== 'hole' && trap.kind !== 'magnet') ||
      (trap.kind === 'magnet' && trap.group !== ballGroupOf(ball.id))
    ) {
      continue;
    }

    const dx = trap.position.x - ball.x;
    const dy = trap.position.y - ball.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0 || distance >= WELL_RADIUS) {
      continue;
    }

    const depth = 1 - distance / WELL_RADIUS;
    const pull = WELL_PULL * Math.min(1, distance / WELL_CORE) * depth;

    result.x += (dx / distance) * pull;
    result.y += (dy / distance) * pull;
    result.strength = Math.max(result.strength, pull);
    result.damping *= 1 - WELL_DRAG * depth * FIXED_STEP;
  }

  return result;
}

function ballGroupOf(id: BallId): 'solids' | 'stripes' | null {
  if (id === CUE_BALL_ID || id === EIGHT_BALL_ID) {
    return null;
  }

  return id < EIGHT_BALL_ID ? 'solids' : 'stripes';
}

// How much harder (mud) or easier (ice) the cloth under the ball lets it roll.
function clothFriction(ball: MutableBall, traps: readonly Trap[]): number {
  let factor = 1;

  for (const trap of traps) {
    if (trap.kind === 'mud' && within(ball, trap.position, MUD_RADIUS)) {
      factor *= MUD_FRICTION;
    } else if (trap.kind === 'ice' && within(ball, trap.position, ICE_RADIUS)) {
      factor *= ICE_FRICTION;
    }
  }

  return factor;
}

function onIce(ball: MutableBall, traps: readonly Trap[]): boolean {
  return traps.some((trap) => trap.kind === 'ice' && within(ball, trap.position, ICE_RADIUS));
}

function within(ball: MutableBall, point: Vec2, reach: number): boolean {
  const dx = ball.x - point.x;
  const dy = ball.y - point.y;

  return dx * dx + dy * dy < reach * reach;
}

// Pockets closed by a plug, by index.
function pluggedPockets(traps: readonly Trap[]): boolean[] {
  return POCKETS.map((pocket) =>
    traps.some(
      (trap) =>
        trap.kind === 'plug' &&
        trap.position.x === pocket.position.x &&
        trap.position.y === pocket.position.y,
    ),
  );
}

// A bumper is a fixed post: the ball is pushed out and its approach speed bounces back. A spring
// throws it back faster, up to a cap so two springs cannot feed each other forever.
function resolveBumpers(balls: MutableBall[], traps: readonly Trap[], events: TableEvent[]): void {
  const reach = BALL_RADIUS + BUMPER_RADIUS;

  for (const trap of traps) {
    if (trap.kind !== 'bumper' && trap.kind !== 'spring') {
      continue;
    }

    for (const ball of balls) {
      if (ball.pocketed) {
        continue;
      }

      const dx = ball.x - trap.position.x;
      const dy = ball.y - trap.position.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= reach * reach || distanceSquared === 0) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;

      ball.x = trap.position.x + nx * reach;
      ball.y = trap.position.y + ny * reach;

      const inbound = -(ball.vx * nx + ball.vy * ny);

      if (inbound <= 0) {
        continue;
      }

      const exit =
        trap.kind === 'spring'
          ? Math.min(SPRING_MAX_EXIT, inbound * SPRING_RESTITUTION)
          : inbound * BUMPER_RESTITUTION;

      ball.vx += (inbound + exit) * nx;
      ball.vy += (inbound + exit) * ny;
      events.push({ kind: 'bumper', trapId: trap.id, ballId: ball.id, speed: inbound });
    }
  }
}

// A wall is a rubber capsule: the ball is pushed off the nearest point of its centre line and
// bounces like it would off a cushion, so it also sounds like one.
function resolveWalls(balls: MutableBall[], traps: readonly Trap[], events: TableEvent[]): void {
  const reach = BALL_RADIUS + WALL_RADIUS;

  for (const trap of traps) {
    if (trap.kind !== 'wall' || trap.direction === undefined) {
      continue;
    }

    const along = trap.direction;

    for (const ball of balls) {
      if (ball.pocketed) {
        continue;
      }

      const offset = (ball.x - trap.position.x) * along.x + (ball.y - trap.position.y) * along.y;
      const t = Math.max(-WALL_HALF_LENGTH, Math.min(WALL_HALF_LENGTH, offset));
      const nearestX = trap.position.x + along.x * t;
      const nearestY = trap.position.y + along.y * t;
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= reach * reach || distanceSquared === 0) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;

      ball.x = nearestX + nx * reach;
      ball.y = nearestY + ny * reach;

      const inbound = -(ball.vx * nx + ball.vy * ny);

      if (inbound <= 0) {
        continue;
      }

      ball.vx += (1 + CUSHION_RESTITUTION) * inbound * nx;
      ball.vy += (1 + CUSHION_RESTITUTION) * inbound * ny;
      events.push({ kind: 'cushion', ballId: ball.id, speed: inbound });
    }
  }
}

function resolveCushions(
  balls: MutableBall[],
  traps: readonly Trap[],
  plugged: readonly boolean[],
  events: TableEvent[],
): void {
  for (const ball of balls) {
    if (ball.pocketed || inPocketMouth(ball, plugged)) {
      continue;
    }

    let speed = 0;

    if (ball.x < BALL_RADIUS) {
      ball.x = BALL_RADIUS;
      speed = Math.max(speed, reflectX(ball, -1));
    } else if (ball.x > TABLE_WIDTH - BALL_RADIUS) {
      ball.x = TABLE_WIDTH - BALL_RADIUS;
      speed = Math.max(speed, reflectX(ball, 1));
    }

    if (ball.y < BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      speed = Math.max(speed, reflectY(ball, -1));
    } else if (ball.y > TABLE_HEIGHT - BALL_RADIUS) {
      ball.y = TABLE_HEIGHT - BALL_RADIUS;
      speed = Math.max(speed, reflectY(ball, 1));
    }

    if (speed > 0) {
      // Side spin needs grip, and there is none on ice.
      if (!onIce(ball, traps)) {
        applySideSpin(ball, speed);
      }

      events.push({ kind: 'cushion', ballId: ball.id, speed });
    }
  }
}

// Top or back spin turns into velocity along the ball's old line of travel the moment the hit
// takes speed away: a full hit converts all of it, a thin cut barely any.
function applyFollow(ball: MutableBall, before: { vx: number; vy: number }, impulse: number): void {
  if (ball.sy === 0) {
    return;
  }

  const speed = Math.sqrt(before.vx * before.vx + before.vy * before.vy);

  if (speed === 0) {
    return;
  }

  const share = Math.min(1, impulse / speed);
  const follow = ball.sy * share;

  ball.vx += (follow * before.vx) / speed;
  ball.vy += (follow * before.vy) / speed;
  ball.sy -= follow;
}

// Side spin grips the cushion and kicks the ball sideways along it, more so the squarer the hit.
// Positive spin sends it to the right of its outgoing direction, as seen on screen.
function applySideSpin(ball: MutableBall, inbound: number): void {
  if (ball.sx === 0) {
    return;
  }

  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

  if (speed === 0) {
    return;
  }

  const share = Math.min(1, inbound / speed);
  const kick = ball.sx * SIDE_SPIN_GRIP * share;

  // Rightwards of the outgoing direction, in table coordinates with y pointing down.
  ball.vx += (-ball.vy / speed) * kick;
  ball.vy += (ball.vx / speed) * kick;
  ball.sx -= ball.sx * share;
}

function decay(spin: number, amount: number): number {
  if (spin > 0) {
    return Math.max(0, spin - amount);
  }

  return Math.min(0, spin + amount);
}

// Reflects only when the ball is still moving into the cushion (outward sign given) and
// returns the speed it hit with, 0 when it did not.
function reflectX(ball: MutableBall, outward: number): number {
  const inbound = ball.vx * outward;

  if (inbound <= 0) {
    return 0;
  }

  ball.vx = -ball.vx * CUSHION_RESTITUTION;

  return inbound;
}

function reflectY(ball: MutableBall, outward: number): number {
  const inbound = ball.vy * outward;

  if (inbound <= 0) {
    return 0;
  }

  ball.vy = -ball.vy * CUSHION_RESTITUTION;

  return inbound;
}

// Inside the pocket opening the cushions give way.
function inPocketMouth(ball: MutableBall, plugged: readonly boolean[]): boolean {
  return POCKETS.some((pocket, index) => {
    if (plugged[index] === true) {
      return false;
    }

    const dx = ball.x - pocket.position.x;
    const dy = ball.y - pocket.position.y;
    const reach = pocket.radius + pocket.mouth;

    return dx * dx + dy * dy < reach * reach;
  });
}

// Overlapping the hole enough to tip in, or already past the nose line inside the mouth.
function onPocketLip(ball: MutableBall, plugged: readonly boolean[]): boolean {
  const pastNose =
    ball.x < BALL_RADIUS ||
    ball.x > TABLE_WIDTH - BALL_RADIUS ||
    ball.y < BALL_RADIUS ||
    ball.y > TABLE_HEIGHT - BALL_RADIUS;

  return POCKETS.some((pocket, index) => {
    if (plugged[index] === true) {
      return false;
    }

    const dx = ball.x - pocket.position.x;
    const dy = ball.y - pocket.position.y;
    const squared = dx * dx + dy * dy;
    const mouth = pocket.radius + pocket.mouth;
    const lip = pocket.radius + BALL_RADIUS * (1 - LIP_OVERLAP);

    return squared < lip * lip || (pastNose && squared < mouth * mouth);
  });
}

// A ball on a pocket lip rolls in instead of stopping on the edge.
function pullIntoPockets(balls: MutableBall[], plugged: readonly boolean[]): void {
  for (const ball of balls) {
    if (ball.pocketed || !onPocketLip(ball, plugged)) {
      continue;
    }

    for (const [index, pocket] of POCKETS.entries()) {
      if (plugged[index] === true) {
        continue;
      }

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

// A ball that reaches the middle of a hole is gone, parked at the hole like a pocketed one.
function swallow(balls: MutableBall[], traps: readonly Trap[], events: TableEvent[]): void {
  for (const trap of traps) {
    if (trap.kind !== 'hole') {
      continue;
    }

    for (const ball of balls) {
      if (ball.pocketed) {
        continue;
      }

      const dx = ball.x - trap.position.x;
      const dy = ball.y - trap.position.y;

      if (dx * dx + dy * dy < HOLE_RADIUS * HOLE_RADIUS) {
        ball.pocketed = true;
        ball.sx = 0;
        ball.sy = 0;
        ball.x = trap.position.x;
        ball.y = trap.position.y;
        ball.vx = 0;
        ball.vy = 0;
        events.push({ kind: 'swallowed', trapId: trap.id, ballId: ball.id });
      }
    }
  }
}

function capturePockets(
  balls: MutableBall[],
  plugged: readonly boolean[],
  events: TableEvent[],
): void {
  for (const ball of balls) {
    if (ball.pocketed) {
      continue;
    }

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex += 1) {
      const pocket = POCKETS[pocketIndex];

      if (pocket === undefined || plugged[pocketIndex] === true) {
        continue;
      }

      const dx = ball.x - pocket.position.x;
      const dy = ball.y - pocket.position.y;

      if (dx * dx + dy * dy < pocket.radius * pocket.radius) {
        ball.pocketed = true;
        ball.sx = 0;
        ball.sy = 0;
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
    sx: ball.spin?.x ?? 0,
    sy: ball.spin?.y ?? 0,
    pocketed: ball.pocketed,
  };
}

function toBall(ball: MutableBall): Ball {
  return {
    id: ball.id,
    position: { x: ball.x, y: ball.y },
    velocity: { x: ball.vx, y: ball.vy },
    pocketed: ball.pocketed,
    ...(ball.sx === 0 && ball.sy === 0 ? {} : { spin: { x: ball.sx, y: ball.sy } }),
  };
}
