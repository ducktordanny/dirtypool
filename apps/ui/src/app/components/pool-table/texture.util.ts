import { Texture } from 'pixi.js';
import { CLOTH_RGB } from '../../config/table-render.const';

type Rgb = readonly [number, number, number];

const CLOTH_SIZE = 256;
const MOTTLE_CELLS = 16;

let cloth: Texture | null = null;

// Repeating cloth tile: faint fibre noise plus slow mottling, seamless in both directions.
export function clothTexture(): Texture {
  cloth ??= toTexture(paintCloth());

  return cloth;
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas);

  texture.source.addressMode = 'repeat';

  return texture;
}

function paintCloth(): HTMLCanvasElement {
  const { canvas, context } = createCanvas(CLOTH_SIZE, CLOTH_SIZE);
  const image = context.createImageData(CLOTH_SIZE, CLOTH_SIZE);
  const next = seededRandom(7);
  const mottle = Array.from({ length: MOTTLE_CELLS * MOTTLE_CELLS }, () => next() * 2 - 1);

  for (let y = 0; y < CLOTH_SIZE; y += 1) {
    for (let x = 0; x < CLOTH_SIZE; x += 1) {
      const fibre = (next() - 0.5) * 9;
      const slow = sampleWrapped(mottle, MOTTLE_CELLS, x / CLOTH_SIZE, y / CLOTH_SIZE) * 4;

      writePixel(image.data, (y * CLOTH_SIZE + x) * 4, CLOTH_RGB, fibre + slow);
    }
  }

  context.putImageData(image, 0, 0);

  return canvas;
}

function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('2D canvas is not available');
  }

  canvas.width = width;
  canvas.height = height;

  return { canvas, context };
}

function writePixel(data: Uint8ClampedArray, index: number, base: Rgb, shade: number): void {
  data[index] = base[0] + shade;
  data[index + 1] = base[1] + shade;
  data[index + 2] = base[2] + shade;
  data[index + 3] = 255;
}

// Bilinear sample of a square grid that wraps at the edges, with u and v in 0..1.
function sampleWrapped(grid: readonly number[], cells: number, u: number, v: number): number {
  const fx = u * cells;
  const fy = v * cells;
  const x0 = Math.floor(fx) % cells;
  const y0 = Math.floor(fy) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const top = (grid[y0 * cells + x0] ?? 0) * (1 - tx) + (grid[y0 * cells + x1] ?? 0) * tx;
  const bottom = (grid[y1 * cells + x0] ?? 0) * (1 - tx) + (grid[y1 * cells + x1] ?? 0) * tx;

  return top * (1 - ty) + bottom * ty;
}

// mulberry32: the texture must look the same on every load.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
