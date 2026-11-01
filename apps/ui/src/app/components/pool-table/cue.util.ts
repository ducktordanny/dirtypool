import type { Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS, add, scale } from '@dirtypool/game';
import type { Graphics } from 'pixi.js';
import { CUE_TIP_GAP, TABLE_COLORS } from '../../config/table-render.const';
import type { ShotAim } from '../../types/shot-aim.type';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';

interface CueSection {
  readonly end: number;
  readonly startHalfWidth: number;
  readonly endHalfWidth: number;
  readonly color: number;
}

// Sections from the tip backwards, measured in metres along the cue.
const CUE_SECTIONS: readonly CueSection[] = [
  { end: 0.012, startHalfWidth: 0.0062, endHalfWidth: 0.0065, color: TABLE_COLORS.cueTip },
  { end: 0.036, startHalfWidth: 0.0065, endHalfWidth: 0.0068, color: TABLE_COLORS.cueFerrule },
  { end: 0.78, startHalfWidth: 0.0068, endHalfWidth: 0.011, color: TABLE_COLORS.cueShaft },
  { end: 0.796, startHalfWidth: 0.011, endHalfWidth: 0.0112, color: TABLE_COLORS.cueJoint },
  { end: 1.05, startHalfWidth: 0.0112, endHalfWidth: 0.013, color: TABLE_COLORS.cueForearm },
  { end: 1.33, startHalfWidth: 0.013, endHalfWidth: 0.0145, color: TABLE_COLORS.cueWrap },
  { end: 1.45, startHalfWidth: 0.0145, endHalfWidth: 0.015, color: TABLE_COLORS.cueSleeve },
  { end: 1.47, startHalfWidth: 0.015, endHalfWidth: 0.013, color: TABLE_COLORS.cueBumper },
];
const CUE_SHADOW_OFFSET = { x: 0.012, y: 0.016 };
const DASH_LENGTH = 0.03;
const DASH_GAP = 0.02;
const GUIDE_LENGTH = 0.22;

export type CueLine = Pick<ShotAim, 'origin' | 'direction'>;

export function drawCue(graphics: Graphics, aim: CueLine, pull: number, viewport: Viewport): void {
  const back = scale(aim.direction, -1);
  const side = { x: -back.y, y: back.x };
  const tip = add(aim.origin, scale(back, BALL_RADIUS + CUE_TIP_GAP + pull));
  const shadowTip = add(tip, CUE_SHADOW_OFFSET);

  graphics.clear();

  let start = 0;

  for (const section of CUE_SECTIONS) {
    graphics
      .poly(sectionPolygon(shadowTip, back, side, start, section, viewport))
      .fill({ color: TABLE_COLORS.shadow, alpha: 0.28 });
    start = section.end;
  }

  start = 0;

  for (const section of CUE_SECTIONS) {
    graphics.poly(sectionPolygon(tip, back, side, start, section, viewport)).fill(section.color);
    start = section.end;
  }

  drawShaftHighlight(graphics, tip, back, side, viewport);
}

export interface AimGuideOptions {
  // The ball the cue ball would hit first may not be hit first: paint the guide as a foul.
  readonly foulTarget: Vec2 | null;
}

export function drawAimGuide(
  graphics: Graphics,
  aim: ShotAim,
  viewport: Viewport,
  options: AimGuideOptions = { foulTarget: null },
): void {
  const radius = BALL_RADIUS * viewport.scale;
  const ghost = toScreen(aim.ghost, viewport);
  const color = options.foulTarget === null ? TABLE_COLORS.guide : TABLE_COLORS.foul;

  graphics.clear();
  drawDashedLine(graphics, aim.origin, aim.ghost, viewport, color);
  graphics.circle(ghost.x, ghost.y, radius).stroke({ color, width: 2, alpha: 0.85 });

  if (aim.targetDirection !== null) {
    const end = toScreen(
      add(aim.ghost, scale(aim.targetDirection, GUIDE_LENGTH * (0.4 + aim.fullness * 0.6))),
      viewport,
    );

    graphics.moveTo(ghost.x, ghost.y).lineTo(end.x, end.y).stroke({ color, width: 2, alpha: 0.85 });
  }

  if (aim.cueDeflection !== null) {
    const end = toScreen(
      add(aim.ghost, scale(aim.cueDeflection, GUIDE_LENGTH * aim.cueSpeed * 0.8)),
      viewport,
    );

    graphics.moveTo(ghost.x, ghost.y).lineTo(end.x, end.y).stroke({ color, width: 2, alpha: 0.4 });
  }

  if (options.foulTarget !== null) {
    const target = toScreen(options.foulTarget, viewport);
    const ring = radius * 1.45;
    const cross = radius * 0.5;

    graphics
      .circle(target.x, target.y, ring)
      .stroke({ color, width: 3, alpha: 0.95 })
      .moveTo(target.x - cross, target.y - ring - cross * 1.6)
      .lineTo(target.x + cross, target.y - ring - cross * 0.2)
      .moveTo(target.x + cross, target.y - ring - cross * 1.6)
      .lineTo(target.x - cross, target.y - ring - cross * 0.2)
      .stroke({ color, width: 3, alpha: 0.95 });
  }
}

function sectionPolygon(
  tip: Vec2,
  back: Vec2,
  side: Vec2,
  start: number,
  section: CueSection,
  viewport: Viewport,
): number[] {
  const from = add(tip, scale(back, start));
  const to = add(tip, scale(back, section.end));

  return [
    add(from, scale(side, section.startHalfWidth)),
    add(to, scale(side, section.endHalfWidth)),
    add(to, scale(side, -section.endHalfWidth)),
    add(from, scale(side, -section.startHalfWidth)),
  ].flatMap((point) => {
    const screen = toScreen(point, viewport);

    return [screen.x, screen.y];
  });
}

// A lighter stripe off-centre sells the cue as a cylinder rather than a flat strip.
function drawShaftHighlight(
  graphics: Graphics,
  tip: Vec2,
  back: Vec2,
  side: Vec2,
  viewport: Viewport,
): void {
  const from = toScreen(add(add(tip, scale(back, 0.04)), scale(side, -0.003)), viewport);
  const to = toScreen(add(add(tip, scale(back, 1.44)), scale(side, -0.006)), viewport);

  graphics
    .moveTo(from.x, from.y)
    .lineTo(to.x, to.y)
    .stroke({ color: 0xffffff, width: Math.max(1, 0.003 * viewport.scale), alpha: 0.22 });
}

function drawDashedLine(
  graphics: Graphics,
  from: Vec2,
  to: Vec2,
  viewport: Viewport,
  color: number,
): void {
  const total = Math.hypot(to.x - from.x, to.y - from.y);

  if (total === 0) {
    return;
  }

  const direction = { x: (to.x - from.x) / total, y: (to.y - from.y) / total };

  for (let travelled = BALL_RADIUS; travelled < total; travelled += DASH_LENGTH + DASH_GAP) {
    const start = toScreen(add(from, scale(direction, travelled)), viewport);
    const end = toScreen(
      add(from, scale(direction, Math.min(total, travelled + DASH_LENGTH))),
      viewport,
    );

    graphics.moveTo(start.x, start.y).lineTo(end.x, end.y);
  }

  graphics.stroke({ color, width: 2, alpha: 0.5 });
}
