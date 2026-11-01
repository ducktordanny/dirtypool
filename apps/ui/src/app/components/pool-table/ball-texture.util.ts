import type { BallId } from '@dirtypool/contracts';
import { Texture } from 'pixi.js';
import { ballCssColor, isStripe } from '../../config/table-render.const';

// Equirectangular map of each ball: longitude across, latitude down. Width is twice the height
// so a circle at the equator keeps the same pixel radius in both directions.
const MAP_WIDTH = 512;
const MAP_HEIGHT = 256;
// Stripe half-height and number disc radius in degrees of latitude.
const STRIPE_DEGREES = 32;
const DISC_DEGREES = 24;
const WHITE = '#faf8f2';
const INK = '#111111';

const cache = new Map<BallId, Texture>();

export function ballTexture(id: BallId): Texture {
  let texture = cache.get(id);

  if (texture === undefined) {
    texture = Texture.from(drawBallMap(id));
    texture.source.addressMode = 'repeat';
    texture.source.autoGenerateMipmaps = true;
    cache.set(id, texture);
  }

  return texture;
}

function drawBallMap(id: BallId): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;

  if (context === null) {
    return canvas;
  }

  const color = ballCssColor(id);
  const stripe = isStripe(id);
  const pixelsPerDegree = MAP_HEIGHT / 180;

  context.fillStyle = stripe || id === 0 ? WHITE : color;
  context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  if (stripe) {
    const half = STRIPE_DEGREES * pixelsPerDegree;

    context.fillStyle = color;
    context.fillRect(0, MAP_HEIGHT / 2 - half, MAP_WIDTH, half * 2);
  }

  // Two discs on opposite sides of the equator; the one at the seam is drawn on both edges.
  const discRadius = DISC_DEGREES * pixelsPerDegree;

  for (const x of [MAP_WIDTH / 2, 0, MAP_WIDTH]) {
    drawDisc(context, id, x, MAP_HEIGHT / 2, discRadius);
  }

  return canvas;
}

function drawDisc(
  context: CanvasRenderingContext2D,
  id: BallId,
  x: number,
  y: number,
  radius: number,
): void {
  if (id === 0) {
    context.fillStyle = '#d63a3a';
    context.beginPath();
    context.arc(x, y, radius * 0.22, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.fillStyle = WHITE;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = INK;
  context.font = `700 ${Math.round(radius * (id > 9 ? 1.25 : 1.5))}px Arial, Helvetica, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(id), x, y + radius * 0.06);

  if (id === 6 || id === 9) {
    context.fillRect(x - radius * 0.36, y + radius * 0.74, radius * 0.72, radius * 0.1);
  }
}
