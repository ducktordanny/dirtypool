import type { Ball, TableState } from '@dirtypool/contracts';
import { BALL_DIAMETER, BALL_RADIUS, TABLE_WIDTH } from '@dirtypool/game';
import { aimAlong, defaultAimDirection, directionFromPointer, rotateDirection } from './aim.util';

function ball(id: number, x: number, y: number, pocketed = false): Ball {
  return { id, position: { x, y }, velocity: { x: 0, y: 0 }, pocketed };
}

function tableWith(...balls: Ball[]): TableState {
  const byId = new Map(balls.map((item) => [item.id, item]));

  return {
    balls: Array.from({ length: 16 }, (_, id) => byId.get(id) ?? ball(id, 2, 1, true)),
  };
}

describe('aim.util', () => {
  it('aims the cue ball towards the pointer', () => {
    expect(directionFromPointer({ x: 1, y: 0.5 }, { x: 1.5, y: 0.5 })).toEqual({ x: 1, y: 0 });
    expect(directionFromPointer({ x: 1, y: 0.5 }, { x: 1.001, y: 0.5 })).toBeNull();
  });

  it('defaults to aiming at the nearest object ball', () => {
    const table = tableWith(ball(0, 0.5, 0.5), ball(1, 1.5, 0.5), ball(2, 0.5, 0.9));

    expect(defaultAimDirection(table)).toEqual({ x: 0, y: 1 });
  });

  it('places the ghost ball one diameter before a full hit', () => {
    const table = tableWith(ball(0, 0.5, 0.5), ball(3, 1.0, 0.5));
    const aim = aimAlong(table, { x: 1, y: 0 });

    expect(aim?.targetBallId).toBe(3);
    expect(aim?.ghost.x).toBeCloseTo(1.0 - BALL_DIAMETER);
    expect(aim?.ghost.y).toBeCloseTo(0.5);
    expect(aim?.fullness).toBeCloseTo(1);
    expect(aim?.cueDeflection).toBeNull();
  });

  it('predicts object ball and cue ball directions on a cut shot', () => {
    const table = tableWith(ball(0, 0.5, 0.5), ball(3, 1.0, 0.5 + BALL_RADIUS));
    const aim = aimAlong(table, { x: 1, y: 0 });

    expect(aim?.targetBallId).toBe(3);
    expect(aim?.targetDirection?.y).toBeGreaterThan(0);
    expect(aim?.cueDeflection?.y).toBeLessThan(0);
    expect(aim?.fullness).toBeGreaterThan(0);
    expect(aim?.fullness).toBeLessThan(1);
  });

  it('stops the ghost ball at the cushion when nothing is in the way', () => {
    const table = tableWith(ball(0, 0.5, 0.5));
    const aim = aimAlong(table, { x: 1, y: 0 });

    expect(aim?.targetBallId).toBeNull();
    expect(aim?.ghost.x).toBeCloseTo(TABLE_WIDTH - BALL_RADIUS);
  });

  it('returns null without a cue ball on the table', () => {
    expect(aimAlong(tableWith(ball(0, 0.5, 0.5, true)), { x: 1, y: 0 })).toBeNull();
  });

  it('rotates a direction by a small angle', () => {
    const rotated = rotateDirection({ x: 1, y: 0 }, Math.PI / 2);

    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });
});
