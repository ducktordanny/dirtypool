import type { BallId, TableState, Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS, distance } from '@dirtypool/game';
import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { TABLE_COLORS, ballColor, isStripe } from '../../config/table-render.const';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';

// Light comes from the top-left: shadows fall down-right, in metres.
const SHADOW_OFFSET = { x: 0.007, y: 0.009 };
// Larger jumps are repositioning (new game, cue ball in hand), not rolling.
const MAX_ROLL_DISTANCE = 0.2;
const FULL_TURN = Math.PI * 2;
const SINK_DURATION_MS = 340;
const SINK_SCALE = 0.55;

export interface SinkAnimation {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly startedAt: number;
}

export interface BallSprite {
  readonly view: Container;
  // Stripe belt: a great circle containing the direction of travel, so it stays a straight strip.
  readonly band: Graphics | null;
  // Rotated to the direction of travel and foreshortened as the label rolls over the sphere.
  readonly roller: Container;
  readonly upright: Container;
  readonly radius: number;
  lastPosition: Vec2 | null;
  phase: number;
  pocketed: boolean;
  sink: SinkAnimation | null;
}

export function createBallSprite(id: BallId, radius: number): BallSprite {
  const view = new Container();
  const color = ballColor(id);
  const mask = new Graphics().circle(0, 0, radius).fill(0xffffff);
  const markings = new Container();
  const roller = new Container();
  const upright = new Container();
  const band = isStripe(id)
    ? new Graphics().rect(-radius * 1.5, -radius * 0.62, radius * 3, radius * 1.24).fill(color)
    : null;

  markings.mask = mask;
  roller.addChild(upright);

  if (band !== null) {
    markings.addChild(band);
  }

  markings.addChild(roller);
  view.addChild(
    new Graphics().circle(0, 0, radius).fill(band === null ? color : 0xfaf8f2),
    mask,
    markings,
  );

  if (id === 0) {
    upright.addChild(new Graphics().circle(0, 0, radius * 0.14).fill(0xd63a3a));
  } else {
    const label = new Graphics().circle(0, 0, radius * 0.5).fill(0xfaf8f2);
    const number = new Text({
      text: String(id),
      style: {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: radius * (id > 9 ? 0.66 : 0.78),
        fontWeight: '700',
        fill: 0x111111,
      },
    });

    number.anchor.set(0.5);
    number.position.set(0, radius * 0.02);
    upright.addChild(label, number);
  }

  view.addChild(createShading(radius), createSpecular(radius));

  return {
    view,
    band,
    roller,
    upright,
    radius,
    lastPosition: null,
    phase: 0,
    pocketed: false,
    sink: null,
  };
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

// Moves the sprite and rolls its label over the sphere by the distance travelled.
export function placeBallSprite(sprite: BallSprite, position: Vec2, viewport: Viewport): void {
  const previous = sprite.lastPosition;

  sprite.lastPosition = position;
  sprite.view.position.copyFrom(toScreen(position, viewport));

  if (previous === null) {
    return;
  }

  const travelled = distance(position, previous);

  if (travelled === 0 || travelled > MAX_ROLL_DISTANCE) {
    return;
  }

  sprite.phase = (sprite.phase + travelled / BALL_RADIUS) % FULL_TURN;

  const angle = Math.atan2(position.y - previous.y, position.x - previous.x);
  const depth = Math.cos(sprite.phase);
  const offset = Math.sin(sprite.phase) * sprite.radius;

  sprite.roller.visible = depth > 0;
  sprite.roller.rotation = angle;
  sprite.roller.scale.set(Math.max(depth, 0.01), 1);
  sprite.roller.position.set(Math.cos(angle) * offset, Math.sin(angle) * offset);
  sprite.upright.rotation = -angle;

  if (sprite.band !== null) {
    sprite.band.rotation = angle;
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

function createShading(radius: number): Graphics {
  const gradient = new FillGradient({
    type: 'radial',
    center: { x: 0.36, y: 0.34 },
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.62,
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.6)' },
      { offset: 0.35, color: 'rgba(255, 255, 255, 0.12)' },
      { offset: 0.82, color: 'rgba(0, 0, 0, 0)' },
      { offset: 1, color: 'rgba(0, 0, 0, 0.3)' },
    ],
  });

  return new Graphics().circle(0, 0, radius).fill(gradient);
}

function createSpecular(radius: number): Graphics {
  return new Graphics()
    .ellipse(-radius * 0.36, -radius * 0.4, radius * 0.2, radius * 0.14)
    .fill({ color: 0xffffff, alpha: 0.75 });
}
