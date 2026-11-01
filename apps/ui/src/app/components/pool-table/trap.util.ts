import type { PlayerIndex, Trap, TrapKind, TrapRequest, Vec2 } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  BUMPER_RADIUS,
  FAN_HALF_WIDTH,
  FAN_REACH,
  HOLE_RADIUS,
  ICE_RADIUS,
  MUD_RADIUS,
  POCKETS,
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
const FAN_CHEVRONS = 3;
const FAN_SPEED_M_PER_MS = 0.00008;
const GHOST_ALPHA = 0.6;
const DEFAULT_DIRECTION: Vec2 = { x: 1, y: 0 };

// Redrawn every frame: fields turn and fans blow, so the whole layer is cheap enough to rebuild.
export function drawTraps(
  graphics: Graphics,
  traps: readonly Trap[],
  viewport: Viewport,
  now: number,
): void {
  graphics.clear();

  for (const trap of traps) {
    drawTrap(graphics, trap, viewport, now, 1);
    drawLifeRing(graphics, trap, viewport);
  }
}

// Where the trap would land under the pointer, marked when the spot is not allowed.
export function drawTrapGhost(
  graphics: Graphics,
  request: TrapRequest,
  allowed: boolean,
  viewport: Viewport,
): void {
  graphics.clear();
  drawTrap(graphics, request, viewport, 0, GHOST_ALPHA);

  if (!allowed) {
    const centre = toScreen(request.position, viewport);

    graphics
      .circle(centre.x, centre.y, (trapFootprint(request.kind) + BALL_RADIUS) * viewport.scale)
      .stroke({ color: TABLE_COLORS.foul, width: 3, alpha: 0.9 });
  }
}

export function playerColor(index: PlayerIndex): number {
  return PLAYER_COLORS[index];
}

function drawTrap(
  graphics: Graphics,
  trap: TrapRequest,
  viewport: Viewport,
  now: number,
  alpha: number,
): void {
  const direction = trap.direction ?? DEFAULT_DIRECTION;

  switch (trap.kind) {
    case 'bumper':
      drawBumper(graphics, trap.position, viewport, alpha, false);
      return;
    case 'spring':
      drawBumper(graphics, trap.position, viewport, alpha, true);
      return;
    case 'wall':
      drawWall(graphics, trap.position, direction, viewport, alpha);
      return;
    case 'fan':
      drawFan(graphics, trap.position, direction, viewport, now, alpha);
      return;
    case 'well':
      drawField(
        graphics,
        trap.position,
        viewport,
        now,
        alpha,
        TRAP_COLORS.well,
        TRAP_COLORS.wellSwirl,
      );
      drawFieldCore(graphics, trap.position, viewport, alpha);
      return;
    case 'magnet': {
      const tint = trap.group === 'stripes' ? TRAP_COLORS.magnetStripes : TRAP_COLORS.magnetSolids;

      drawField(graphics, trap.position, viewport, now, alpha, TRAP_COLORS.well, tint);
      drawMagnetCore(graphics, trap.position, viewport, alpha, tint, trap.group === 'stripes');
      return;
    }
    case 'hole':
      drawField(
        graphics,
        trap.position,
        viewport,
        -now,
        alpha,
        TRAP_COLORS.hole,
        TRAP_COLORS.holeGlow,
      );
      drawHoleCore(graphics, trap.position, viewport, alpha);
      return;
    case 'mud':
      drawMud(graphics, trap.position, viewport, alpha);
      return;
    case 'ice':
      drawIce(graphics, trap.position, viewport, alpha);
      return;
    case 'plug':
      drawPlug(graphics, trap.position, viewport, alpha);
      return;
  }
}

// A rubber post with a pale cap, lit from the top left like the balls. A spring shows its coils.
function drawBumper(
  graphics: Graphics,
  position: Vec2,
  viewport: Viewport,
  alpha: number,
  spring: boolean,
): void {
  const centre = toScreen(position, viewport);
  const shadow = toScreen(add(position, SHADOW_OFFSET), viewport);
  const radius = BUMPER_RADIUS * viewport.scale;

  graphics
    .circle(shadow.x, shadow.y, radius)
    .fill({ color: TABLE_COLORS.shadow, alpha: 0.3 * alpha })
    .circle(centre.x, centre.y, radius)
    .fill({ color: spring ? TRAP_COLORS.spring : TRAP_COLORS.bumperRubber, alpha });

  if (spring) {
    for (const fraction of [0.85, 0.62, 0.4]) {
      graphics
        .circle(centre.x, centre.y, radius * fraction)
        .stroke({ color: TRAP_COLORS.springCoil, width: 2, alpha: 0.8 * alpha });
    }
  } else {
    graphics
      .circle(centre.x, centre.y, radius * 0.62)
      .fill({ color: TRAP_COLORS.bumperCap, alpha });
  }

  graphics
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

// A translucent strip with chevrons drifting the way it blows.
function drawFan(
  graphics: Graphics,
  position: Vec2,
  direction: Vec2,
  viewport: Viewport,
  now: number,
  alpha: number,
): void {
  const side = { x: -direction.y, y: direction.x };
  const corner = (along: number, across: number): Vec2 =>
    toScreen(add(add(position, scale(direction, along)), scale(side, across)), viewport);
  const corners = [
    corner(-FAN_REACH, -FAN_HALF_WIDTH),
    corner(FAN_REACH, -FAN_HALF_WIDTH),
    corner(FAN_REACH, FAN_HALF_WIDTH),
    corner(-FAN_REACH, FAN_HALF_WIDTH),
  ].flatMap((point) => [point.x, point.y]);

  graphics
    .poly(corners)
    .fill({ color: TRAP_COLORS.fan, alpha: 0.18 * alpha })
    .poly(corners)
    .stroke({ color: TRAP_COLORS.fan, width: 1, alpha: 0.5 * alpha });

  const spacing = (FAN_REACH * 2) / FAN_CHEVRONS;
  const drift = (now * FAN_SPEED_M_PER_MS) % spacing;

  for (let index = 0; index < FAN_CHEVRONS; index += 1) {
    const along = -FAN_REACH + drift + index * spacing;
    const tip = corner(along + 0.015, 0);
    const left = corner(along - 0.015, -FAN_HALF_WIDTH * 0.6);
    const right = corner(along - 0.015, FAN_HALF_WIDTH * 0.6);
    const fade = 1 - Math.abs(along) / FAN_REACH;

    graphics
      .moveTo(left.x, left.y)
      .lineTo(tip.x, tip.y)
      .lineTo(right.x, right.y)
      .stroke({ color: TRAP_COLORS.fan, width: 2, alpha: 0.8 * fade * alpha });
  }
}

// A dark pool fading out to the edge of its reach, with slowly turning spiral arms.
function drawField(
  graphics: Graphics,
  position: Vec2,
  viewport: Viewport,
  now: number,
  alpha: number,
  tint: number,
  swirl: number,
): void {
  const centre = toScreen(position, viewport);
  const reach = WELL_RADIUS * viewport.scale;

  for (let ring = 0; ring < 4; ring += 1) {
    graphics
      .circle(centre.x, centre.y, reach * (1 - ring * 0.22))
      .fill({ color: tint, alpha: (0.1 + ring * 0.1) * alpha });
  }

  const spin = now * (now < 0 ? -HOLE_SPIN_RAD_PER_MS : WELL_SPIN_RAD_PER_MS);

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

function drawFieldCore(
  graphics: Graphics,
  position: Vec2,
  viewport: Viewport,
  alpha: number,
): void {
  const centre = toScreen(position, viewport);

  graphics
    .circle(centre.x, centre.y, WELL_RADIUS * 0.12 * viewport.scale)
    .fill({ color: 0x000000, alpha: 0.85 * alpha });
}

function drawHoleCore(graphics: Graphics, position: Vec2, viewport: Viewport, alpha: number): void {
  const centre = toScreen(position, viewport);
  const core = HOLE_RADIUS * viewport.scale;

  graphics
    .circle(centre.x, centre.y, core * 1.25)
    .fill({ color: TRAP_COLORS.holeGlow, alpha: 0.35 * alpha })
    .circle(centre.x, centre.y, core)
    .fill({ color: 0x000000, alpha })
    .circle(centre.x, centre.y, core)
    .stroke({ color: TRAP_COLORS.holeGlow, width: 2, alpha: 0.9 * alpha });
}

// A little ball in the middle says which group the magnet wants: solid, or white with a band.
function drawMagnetCore(
  graphics: Graphics,
  position: Vec2,
  viewport: Viewport,
  alpha: number,
  tint: number,
  stripe: boolean,
): void {
  const centre = toScreen(position, viewport);
  const radius = BALL_RADIUS * 0.8 * viewport.scale;

  graphics.circle(centre.x, centre.y, radius).fill({ color: stripe ? 0xffffff : tint, alpha });

  if (stripe) {
    graphics
      .rect(centre.x - radius, centre.y - radius * 0.4, radius * 2, radius * 0.8)
      .fill({ color: tint, alpha });
  }

  graphics.circle(centre.x, centre.y, radius).stroke({ color: tint, width: 2, alpha });
}

// Brown cloth with darker blotches.
function drawMud(graphics: Graphics, position: Vec2, viewport: Viewport, alpha: number): void {
  const centre = toScreen(position, viewport);
  const radius = MUD_RADIUS * viewport.scale;

  graphics.circle(centre.x, centre.y, radius).fill({ color: TRAP_COLORS.mud, alpha: 0.6 * alpha });

  for (const [dx, dy, fraction] of [
    [-0.35, -0.2, 0.3],
    [0.3, 0.1, 0.35],
    [-0.1, 0.45, 0.22],
  ] as const) {
    graphics
      .circle(centre.x + radius * dx, centre.y + radius * dy, radius * fraction)
      .fill({ color: TRAP_COLORS.mudDark, alpha: 0.5 * alpha });
  }
}

// A pale sheet with two glints.
function drawIce(graphics: Graphics, position: Vec2, viewport: Viewport, alpha: number): void {
  const centre = toScreen(position, viewport);
  const radius = ICE_RADIUS * viewport.scale;

  graphics
    .circle(centre.x, centre.y, radius)
    .fill({ color: TRAP_COLORS.ice, alpha: 0.35 * alpha })
    .circle(centre.x, centre.y, radius)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.5 * alpha })
    .moveTo(centre.x - radius * 0.5, centre.y - radius * 0.2)
    .lineTo(centre.x - radius * 0.1, centre.y - radius * 0.6)
    .moveTo(centre.x + radius * 0.2, centre.y + radius * 0.5)
    .lineTo(centre.x + radius * 0.55, centre.y + radius * 0.15)
    .stroke({ color: 0xffffff, width: 2, alpha: 0.7 * alpha });
}

// A cap over the pocket with a handle across it.
function drawPlug(graphics: Graphics, position: Vec2, viewport: Viewport, alpha: number): void {
  const centre = toScreen(position, viewport);
  const pocket = POCKETS.find((candidate) => candidate.position === position) ?? POCKETS[0];
  const radius = (pocket?.radius ?? BALL_RADIUS) * viewport.scale + 2;

  graphics
    .circle(centre.x, centre.y, radius)
    .fill({ color: TRAP_COLORS.plug, alpha })
    .circle(centre.x, centre.y, radius)
    .stroke({ color: TRAP_COLORS.plugRim, width: 3, alpha })
    .moveTo(centre.x - radius * 0.55, centre.y)
    .lineTo(centre.x + radius * 0.55, centre.y)
    .stroke({ color: TRAP_COLORS.plugRim, width: 4, cap: 'round', alpha });
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
    case 'spring':
      return BUMPER_RADIUS;
    case 'wall':
      return WALL_HALF_LENGTH + WALL_RADIUS * 2;
    case 'fan':
      return FAN_HALF_WIDTH * 0.7;
    case 'hole':
      return HOLE_RADIUS * 1.4;
    case 'well':
    case 'magnet':
      return WELL_RADIUS * 0.3;
    case 'mud':
      return MUD_RADIUS * 0.3;
    case 'ice':
      return ICE_RADIUS * 0.3;
    case 'plug':
      return (POCKETS[0]?.radius ?? BALL_RADIUS) + 0.012;
  }
}
