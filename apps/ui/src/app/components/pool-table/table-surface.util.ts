import type { Vec2 } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  HEAD_SPOT,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  add,
  distance,
  dot,
  scale,
  subtract,
} from '@dirtypool/game';
import { FillGradient, type Graphics, Matrix } from 'pixi.js';
import {
  CUSHION_WIDTH,
  FRAME_WIDTH,
  RAIL_WIDTH,
  TABLE_COLORS,
} from '../../config/table-render.const';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';
import { clothTexture } from './texture.util';

const RAIL_CORNER_RADIUS = 0.035;
const RAIL_BEVEL = 0.006;
// The drawn hole is a touch wider than the capture radius so a captured ball is clearly over it.
const POCKET_VISUAL_EXTRA = 0.004;
const SIGHT_RADIUS = 0.0045;
// Metres of table that one cloth tile covers.
const CLOTH_TILE_METRES = 0.25;
const NOSE_SHADOW_BANDS = [0.003, 0.007, 0.012];
// Visible slanted faces of the cushion: the nose towards the cloth and the jaw facets.
const CUSHION_FACE = 0.007;
// How far a jaw facet runs along the rail over the cushion depth. Corner facets run the full
// depth so the two jaws are parallel at 45 degrees; side facets are a steeper 65 degree cut.
const CORNER_FACET_RUN = 1;
const SIDE_FACET_RUN = 0.45;

export interface PocketVisual {
  readonly centre: Vec2;
  readonly radius: number;
  readonly capture: number;
  readonly mouth: number;
  readonly facetRun: number;
}

// A cushion runs between two pockets. Its nose ends where a ball touching the nose line is at the
// edge of the pocket mouth; the jaw facet then angles in towards the hole.
interface CushionSegment {
  readonly noseFrom: Vec2;
  readonly noseTo: Vec2;
  readonly outerFrom: Vec2;
  readonly outerTo: Vec2;
  readonly outward: Vec2;
}

export const POCKET_VISUALS: readonly PocketVisual[] = POCKETS.map((pocket) => ({
  centre: pocket.position,
  radius: pocket.radius + POCKET_VISUAL_EXTRA,
  capture: pocket.radius,
  mouth: pocket.mouth,
  facetRun:
    pocket.position.x > 0 && pocket.position.x < TABLE_WIDTH ? SIDE_FACET_RUN : CORNER_FACET_RUN,
}));

const CUSHIONS: readonly CushionSegment[] = [
  cushionBetween(0, 1, { x: 0, y: -1 }),
  cushionBetween(1, 2, { x: 0, y: -1 }),
  cushionBetween(3, 4, { x: 0, y: 1 }),
  cushionBetween(4, 5, { x: 0, y: 1 }),
  cushionBetween(0, 3, { x: -1, y: 0 }),
  cushionBetween(2, 5, { x: 1, y: 0 }),
];

function cushionBetween(startIndex: number, endIndex: number, outward: Vec2): CushionSegment {
  const start = POCKET_VISUALS[startIndex];
  const end = POCKET_VISUALS[endIndex];

  if (start === undefined || end === undefined) {
    throw new Error('A table needs six pockets');
  }

  const along = outward.x === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const [noseFrom, outerFrom] = cushionEnd(start, outward, along);
  const [noseTo, outerTo] = cushionEnd(end, outward, scale(along, -1));

  return { noseFrom, noseTo, outerFrom, outerTo, outward };
}

// Nose and outer-edge end points of a cushion next to a pocket, stepping `along` away from it.
function cushionEnd(pocket: PocketVisual, outward: Vec2, along: Vec2): [Vec2, Vec2] {
  const noseLine = { x: outward.x > 0 ? TABLE_WIDTH : 0, y: outward.y > 0 ? TABLE_HEIGHT : 0 };
  const outset = dot(subtract(pocket.centre, noseLine), outward);
  const onNose = subtract(pocket.centre, scale(outward, outset));
  const mouth = pocket.capture + pocket.mouth;
  const lift = BALL_RADIUS + outset;
  const noseReach = Math.sqrt(mouth * mouth - lift * lift);
  const outerReach = noseReach - CUSHION_WIDTH * pocket.facetRun;

  return [
    add(onNose, scale(along, noseReach)),
    add(add(onNose, scale(outward, CUSHION_WIDTH)), scale(along, outerReach)),
  ];
}

export function nearestPocketVisual(position: Vec2): PocketVisual {
  let nearest = POCKET_VISUALS[0];

  if (nearest === undefined) {
    throw new Error('A table needs pockets');
  }

  for (const pocket of POCKET_VISUALS) {
    if (distance(position, pocket.centre) < distance(position, nearest.centre)) {
      nearest = pocket;
    }
  }

  return nearest;
}

export function drawTableSurface(graphics: Graphics, viewport: Viewport): void {
  graphics.clear();
  drawRail(graphics, viewport);
  drawCloth(graphics, viewport);
  drawCushions(graphics, viewport);
  drawPockets(graphics, viewport);
  drawMarkings(graphics, viewport);
  drawSights(graphics, viewport);
}

function drawRail(graphics: Graphics, viewport: Viewport): void {
  const outer = toScreen({ x: -FRAME_WIDTH, y: -FRAME_WIDTH }, viewport);
  const width = (TABLE_WIDTH + FRAME_WIDTH * 2) * viewport.scale;
  const height = (TABLE_HEIGHT + FRAME_WIDTH * 2) * viewport.scale;
  const corner = RAIL_CORNER_RADIUS * viewport.scale;
  const bevel = RAIL_BEVEL * viewport.scale;
  const lighting = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.1)' },
      { offset: 0.5, color: 'rgba(0, 0, 0, 0)' },
      { offset: 1, color: 'rgba(0, 0, 0, 0.16)' },
    ],
  });

  graphics
    .roundRect(outer.x, outer.y, width, height, corner)
    .fill(TABLE_COLORS.rail)
    .roundRect(outer.x, outer.y, width, height, corner)
    .fill(lighting)
    .roundRect(outer.x + bevel / 2, outer.y + bevel / 2, width - bevel, height - bevel, corner)
    .stroke({ color: TABLE_COLORS.railBevel, width: bevel })
    .roundRect(outer.x, outer.y, width, height, corner)
    .stroke({ color: TABLE_COLORS.railEdge, width: 2 });
}

function drawCloth(graphics: Graphics, viewport: Viewport): void {
  const origin = toScreen({ x: -CUSHION_WIDTH, y: -CUSHION_WIDTH }, viewport);
  const width = (TABLE_WIDTH + CUSHION_WIDTH * 2) * viewport.scale;
  const height = (TABLE_HEIGHT + CUSHION_WIDTH * 2) * viewport.scale;
  const texture = clothTexture();
  const tile = (CLOTH_TILE_METRES * viewport.scale) / texture.width;
  const vignette = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    outerRadius: 0.8,
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.06)' },
      { offset: 0.55, color: 'rgba(0, 0, 0, 0)' },
      { offset: 1, color: 'rgba(0, 0, 0, 0.28)' },
    ],
  });

  graphics
    .rect(origin.x, origin.y, width, height)
    .fill({ texture, textureSpace: 'global', matrix: new Matrix().scale(tile, tile) })
    .rect(origin.x, origin.y, width, height)
    .fill(vignette)
    .rect(origin.x, origin.y, width, height)
    .stroke({ color: TABLE_COLORS.railEdge, width: 2, alpha: 0.7 })
    .rect(origin.x - 1.5, origin.y - 1.5, width + 3, height + 3)
    .stroke({ color: 0xffffff, width: 1.5, alpha: 0.18 });
}

function drawCushions(graphics: Graphics, viewport: Viewport): void {
  for (const cushion of CUSHIONS) {
    const { noseFrom, noseTo, outerFrom, outerTo, outward } = cushion;
    const along = outward.x === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const faceDepth = scale(outward, CUSHION_FACE);
    const noseFromScreen = toScreen(noseFrom, viewport);
    const noseToScreen = toScreen(noseTo, viewport);
    const outerFromScreen = toScreen(outerFrom, viewport);
    const outerToScreen = toScreen(outerTo, viewport);

    // Shadow the cushion nose throws onto the cloth.
    for (const band of NOSE_SHADOW_BANDS) {
      const inward = scale(outward, -band);

      graphics
        .poly(toPolygon([noseFrom, noseTo, add(noseTo, inward), add(noseFrom, inward)], viewport))
        .fill({ color: TABLE_COLORS.shadow, alpha: 0.08 });
    }

    graphics
      // Lit top surface.
      .poly(toPolygon([noseFrom, noseTo, outerTo, outerFrom], viewport))
      .fill(TABLE_COLORS.cushionTop)
      // Slanted nose face and the two jaw facets, slightly darker.
      .poly(
        toPolygon([noseFrom, noseTo, add(noseTo, faceDepth), add(noseFrom, faceDepth)], viewport),
      )
      .fill(TABLE_COLORS.cushion)
      .poly(
        toPolygon(
          [
            noseFrom,
            outerFrom,
            add(outerFrom, scale(along, CUSHION_FACE)),
            add(noseFrom, scale(along, CUSHION_FACE)),
          ],
          viewport,
        ),
      )
      .fill(TABLE_COLORS.cushion)
      .poly(
        toPolygon(
          [
            noseTo,
            outerTo,
            subtract(outerTo, scale(along, CUSHION_FACE)),
            subtract(noseTo, scale(along, CUSHION_FACE)),
          ],
          viewport,
        ),
      )
      .fill(TABLE_COLORS.cushion)
      // Dark nose edge and facet edges.
      .moveTo(outerFromScreen.x, outerFromScreen.y)
      .lineTo(noseFromScreen.x, noseFromScreen.y)
      .lineTo(noseToScreen.x, noseToScreen.y)
      .lineTo(outerToScreen.x, outerToScreen.y)
      .stroke({ color: TABLE_COLORS.cushionNose, width: Math.max(1.5, 0.003 * viewport.scale) })
      // Highlight along the rail edge.
      .moveTo(outerFromScreen.x, outerFromScreen.y)
      .lineTo(outerToScreen.x, outerToScreen.y)
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.35 });
  }
}

function drawPockets(graphics: Graphics, viewport: Viewport): void {
  for (const pocket of POCKET_VISUALS) {
    const centre = toScreen(pocket.centre, viewport);
    const radius = pocket.radius * viewport.scale;
    const hole = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: '#000000' },
        { offset: 0.72, color: '#000000' },
        { offset: 0.9, color: '#1a0605' },
        { offset: 1, color: TABLE_COLORS.pocketRim },
      ],
    });

    graphics.circle(centre.x, centre.y, radius).fill(hole);
  }
}

function drawMarkings(graphics: Graphics, viewport: Viewport): void {
  const top = toScreen({ x: HEAD_SPOT.x, y: 0 }, viewport);
  const bottom = toScreen({ x: HEAD_SPOT.x, y: TABLE_HEIGHT }, viewport);

  graphics
    .moveTo(top.x, top.y)
    .lineTo(bottom.x, bottom.y)
    .stroke({ color: TABLE_COLORS.marking, width: 1.5, alpha: 0.14 });
}

function drawSights(graphics: Graphics, viewport: Viewport): void {
  const inset = CUSHION_WIDTH + RAIL_WIDTH / 2;
  const positions: Vec2[] = [];

  for (let index = 1; index < 8; index += 1) {
    if (index === 4) {
      continue;
    }

    positions.push(
      { x: (TABLE_WIDTH * index) / 8, y: -inset },
      { x: (TABLE_WIDTH * index) / 8, y: TABLE_HEIGHT + inset },
    );
  }

  for (let index = 1; index < 4; index += 1) {
    positions.push(
      { x: -inset, y: (TABLE_HEIGHT * index) / 4 },
      { x: TABLE_WIDTH + inset, y: (TABLE_HEIGHT * index) / 4 },
    );
  }

  const radius = SIGHT_RADIUS * viewport.scale;

  for (const position of positions) {
    const centre = toScreen(position, viewport);

    graphics
      .circle(centre.x, centre.y, radius)
      .fill({ color: TABLE_COLORS.sight, alpha: 0.9 })
      .circle(centre.x + 1, centre.y + 1, radius)
      .stroke({ color: TABLE_COLORS.shadow, width: 1, alpha: 0.3 });
  }
}

function toPolygon(points: readonly Vec2[], viewport: Viewport): number[] {
  return points.flatMap((point) => {
    const screen = toScreen(point, viewport);

    return [screen.x, screen.y];
  });
}
