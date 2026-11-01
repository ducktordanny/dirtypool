import type { BallId, TableState, Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS } from '@dirtypool/game';
import { Container, Graphics } from 'pixi.js';
import { TABLE_COLORS } from '../../config/table-render.const';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';
import { type BallMesh, createBallMesh, rollOrientation } from './ball-shader.util';
import { ballTexture } from './ball-texture.util';

// Light comes from the top-left: shadows fall down-right, in metres.
const SHADOW_OFFSET = { x: 0.007, y: 0.009 };
// Larger jumps are repositioning (new game, cue ball in hand), not rolling.
const MAX_ROLL_DISTANCE = 0.2;
const SINK_DURATION_MS = 340;
const SINK_SCALE = 0.55;

export interface SinkAnimation {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly startedAt: number;
}

export interface BallSprite {
  readonly view: Container;
  readonly ball: BallMesh;
  readonly radius: number;
  lastPosition: Vec2 | null;
  pocketed: boolean;
  sink: SinkAnimation | null;
}

export function createBallSprite(id: BallId, radius: number): BallSprite {
  const view = new Container();
  const ball = createBallMesh(ballTexture(id), radius);

  view.addChild(ball.mesh);

  return { view, ball, radius, lastPosition: null, pocketed: false, sink: null };
}

// The ball drops towards the pocket centre, shrinks and fades as it goes under the rim.
export function startSink(sprite: BallSprite, pocket: Vec2, now: number): void {
  sprite.pocketed = true;
  sprite.sink = { from: sprite.lastPosition ?? pocket, to: pocket, startedAt: now };
  sprite.view.visible = true;
}

export function animateSink(sprite: BallSprite, now: number, viewport: Viewport): void {
  const sink = sprite.sink;

  if (sink === null) {
    return;
  }

  const progress = Math.min(1, (now - sink.startedAt) / SINK_DURATION_MS);
  const eased = progress * progress;
  const position = toScreen(
    {
      x: sink.from.x + (sink.to.x - sink.from.x) * eased,
      y: sink.from.y + (sink.to.y - sink.from.y) * eased,
    },
    viewport,
  );

  sprite.view.position.copyFrom(position);
  sprite.view.scale.set(1 - (1 - SINK_SCALE) * eased);
  sprite.view.alpha = 1 - eased * eased;

  if (progress >= 1) {
    sprite.view.visible = false;
    sprite.sink = null;
  }
}

export function resetSink(sprite: BallSprite): void {
  sprite.pocketed = false;
  sprite.sink = null;
  sprite.view.scale.set(1);
  sprite.view.alpha = 1;
  sprite.view.visible = true;
}

// Moves the sprite and rolls the sphere by the distance travelled.
export function placeBallSprite(sprite: BallSprite, position: Vec2, viewport: Viewport): void {
  const previous = sprite.lastPosition;

  sprite.lastPosition = position;
  sprite.view.position.copyFrom(toScreen(position, viewport));

  if (previous === null) {
    return;
  }

  const dx = position.x - previous.x;
  const dy = position.y - previous.y;

  if (Math.hypot(dx, dy) <= MAX_ROLL_DISTANCE) {
    rollOrientation(sprite.ball, dx, dy, BALL_RADIUS);
  }
}

export function drawBallShadows(graphics: Graphics, table: TableState, viewport: Viewport): void {
  const radius = BALL_RADIUS * viewport.scale;

  graphics.clear();

  for (const ball of table.balls) {
    if (ball.pocketed) {
      continue;
    }

    const centre = toScreen(
      { x: ball.position.x + SHADOW_OFFSET.x, y: ball.position.y + SHADOW_OFFSET.y },
      viewport,
    );

    graphics
      .ellipse(centre.x, centre.y, radius * 1.15, radius * 1.05)
      .fill({ color: TABLE_COLORS.shadow, alpha: 0.12 })
      .ellipse(centre.x, centre.y, radius * 0.95, radius * 0.85)
      .fill({ color: TABLE_COLORS.shadow, alpha: 0.2 });
  }
}
