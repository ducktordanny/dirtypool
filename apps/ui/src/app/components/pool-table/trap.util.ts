import type { PlayerIndex, Trap, TrapKind, Vec2 } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  BUMPER_RADIUS,
  HOLE_RADIUS,
  TRAP_LIFETIME_SHOTS,
  WALL_HALF_LENGTH,
  WALL_RADIUS,
  WELL_RADIUS,
  add,
  scale,
  trapFootprint,
} from '@dirtypool/game';
import type { Graphics } from 'pixi.js';
import { PLAYER_COLORS, TABLE_COLORS, TRAP_COLORS } from '../../config/table-render.const';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';

const SHADOW_OFFSET: Vec2 = { x: 0.01, y: 0.014 };
const WELL_ARMS = 3;
const WELL_ARM_POINTS = 14;
const WELL_ARM_TWIST = 2.2;
const WELL_SPIN_RAD_PER_MS = 0.0012;
const HOLE_SPIN_RAD_PER_MS = -0.002;
const GHOST_ALPHA = 0.6;
const DEFAULT_DIRECTION: Vec2 = { x: 1, y: 0 };

// Redrawn every frame: the wells turn, so the whole layer is cheap enough to rebuild.
export function drawTraps(
  graphics: Graphics,
  traps: readonly Trap[],
  viewport: Viewport,
  now: number,
): void {
  graphics.clear();

  for (const trap of traps) {
    drawTrap(graphics, trap.kind, trap.position, trap.direction, viewport, now, 1);
    drawLifeRing(graphics, trap, viewport);
  }
}

// Where the trap would land under the pointer, marked when the spot is not allowed.
export function drawTrapGhost(
  graphics: Graphics,
  kind: TrapKind,
  position: Vec2,
  direction: Vec2 | undefined,
  allowed: boolean,
  viewport: Viewport,
): void {
  graphics.clear();
  drawTrap(graphics, kind, position, direction, viewport, 0, GHOST_ALPHA);

  if (!allowed) {
    const centre = toScreen(position, viewport);

    graphics
      .circle(centre.x, centre.y, (trapFootprint(kind) + BALL_RADIUS) * viewport.scale)
      .stroke({ color: TABLE_COLORS.foul, width: 3, alpha: 0.9 });
  }
}

export function playerColor(index: PlayerIndex): number {
  return PLAYER_COLORS[index];
}

function drawTrap(
  graphics: Graphics,
  kind: TrapKind,
  position: Vec2,
  direction: Vec2 | undefined,
  viewport: Viewport,
  now: number,
  alpha: number,
): void {
  switch (kind) {
    case 'bumper':
      drawBumper(graphics, position, viewport, alpha);
      return;
    case 'wall':
      drawWall(graphics, position, direction ?? DEFAULT_DIRECTION, viewport, alpha);
      return;
    case 'well':
      drawField(graphics, position, viewport, now, alpha, false);
      return;
    case 'hole':
      drawField(graphics, position, viewport, now, alpha, true);
      return;
  }
}

// A rubber post with a pale cap, lit from the top left like the balls.
function drawBumper(graphics: Graphics, position: Vec2, viewport: Viewport, alpha: number): void {
  const centre = toScreen(position, viewport);
  const shadow = toScreen(add(position, SHADOW_OFFSET), viewport);
  const radius = BUMPER_RADIUS * viewport.scale;

  graphics
    .circle(shadow.x, shadow.y, radius)
    .fill({ color: TABLE_COLORS.shadow, alpha: 0.3 * alpha })
    .circle(centre.x, centre.y, radius)
    .fill({ color: TRAP_COLORS.bumperRubber, alpha })
    .circle(centre.x, centre.y, radius * 0.62)
    .fill({ color: TRAP_COLORS.bumperCap, alpha })
    .circle(centre.x - radius * 0.2, centre.y - radius * 0.22, radius * 0.2)
    .fill({ color: 0xffffff, alpha: 0.7 * alpha });
}

// A dark rubber capsule with a lighter top edge, drawn as a thick rounded line.
function drawWall(
  graphics: Graphics,
  position: Vec2,
  direction: Vec2,
  viewport: Viewport,
  alpha: number,
): void {
  const from = toScreen(add(position, scale(direction, -WALL_HALF_LENGTH)), viewport);
  const to = toScreen(add(position, scale(direction, WALL_HALF_LENGTH)), viewport);
  const shadowFrom = toScreen(
    add(add(position, scale(direction, -WALL_HALF_LENGTH)), SHADOW_OFFSET),
    viewport,
  );
  const shadowTo = toScreen(
    add(add(position, scale(direction, WALL_HALF_LENGTH)), SHADOW_OFFSET),
    viewport,
  );
  const width = WALL_RADIUS * 2 * viewport.scale;

  graphics
    .moveTo(shadowFrom.x, shadowFrom.y)
    .lineTo(shadowTo.x, shadowTo.y)
    .stroke({ color: TABLE_COLORS.shadow, width, cap: 'round', alpha: 0.3 * alpha })
    .moveTo(from.x, from.y)
    .lineTo(to.x, to.y)
    .stroke({ color: TRAP_COLORS.wall, width, cap: 'round', alpha })
    .moveTo(from.x, from.y - width * 0.2)
    .lineTo(to.x, to.y - width * 0.2)
    .stroke({ color: TRAP_COLORS.wallEdge, width: width * 0.35, cap: 'round', alpha });
}

// A dark pool fading out to the edge of its reach, with slowly turning spiral arms. A hole is
// the same field with a black middle and a hot rim, turning the other way.
function drawField(
  graphics: Graphics,
  position: Vec2,
  viewport: Viewport,
  now: number,
  alpha: number,
  hole: boolean,
): void {
  const centre = toScreen(position, viewport);
  const reach = WELL_RADIUS * viewport.scale;
  const tint = hole ? TRAP_COLORS.hole : TRAP_COLORS.well;
  const swirl = hole ? TRAP_COLORS.holeGlow : TRAP_COLORS.wellSwirl;

  for (let ring = 0; ring < 4; ring += 1) {
    graphics
      .circle(centre.x, centre.y, reach * (1 - ring * 0.22))
      .fill({ color: tint, alpha: (0.1 + ring * 0.1) * alpha });
  }

  if (hole) {
    const core = HOLE_RADIUS * viewport.scale;

    graphics
      .circle(centre.x, centre.y, core * 1.25)
      .fill({ color: TRAP_COLORS.holeGlow, alpha: 0.35 * alpha })
      .circle(centre.x, centre.y, core)
      .fill({ color: 0x000000, alpha })
      .circle(centre.x, centre.y, core)
      .stroke({ color: TRAP_COLORS.holeGlow, width: 2, alpha: 0.9 * alpha });
  } else {
    graphics
      .circle(centre.x, centre.y, reach * 0.12)
      .fill({ color: 0x000000, alpha: 0.85 * alpha });
  }

  const spin = now * (hole ? HOLE_SPIN_RAD_PER_MS : WELL_SPIN_RAD_PER_MS);

  for (let arm = 0; arm < WELL_ARMS; arm += 1) {
    const base = spin + (arm / WELL_ARMS) * Math.PI * 2;

    for (let point = 0; point <= WELL_ARM_POINTS; point += 1) {
      const t = point / WELL_ARM_POINTS;
      const radius = reach * (0.15 + 0.75 * t);
      const angle = base + t * WELL_ARM_TWIST;
      const x = centre.x + Math.cos(angle) * radius;
      const y = centre.y + Math.sin(angle) * radius;

      if (point === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }

    graphics.stroke({ color: swirl, width: 2, alpha: 0.45 * alpha });
  }
}

// An arc in the owner's colour that shrinks as the trap runs out of shots.
function drawLifeRing(graphics: Graphics, trap: Trap, viewport: Viewport): void {
  const centre = toScreen(trap.position, viewport);
  const radius = lifeRingRadius(trap.kind) * viewport.scale + 3;
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * (trap.shotsLeft / TRAP_LIFETIME_SHOTS);

  graphics
    .moveTo(centre.x + Math.cos(start) * radius, centre.y + Math.sin(start) * radius)
    .arc(centre.x, centre.y, radius, start, end)
    .stroke({ color: playerColor(trap.owner), width: 3, alpha: 0.9 });
}

function lifeRingRadius(kind: TrapKind): number {
  switch (kind) {
    case 'bumper':
      return BUMPER_RADIUS;
    case 'wall':
      return WALL_HALF_LENGTH + WALL_RADIUS * 2;
    case 'hole':
      return HOLE_RADIUS * 1.4;
    case 'well':
      return WELL_RADIUS * 0.3;
  }
}
