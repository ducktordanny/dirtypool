import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ball, TableState, Trap } from '@dirtypool/contracts';
import { isAtRest, stepTable } from './physics.js';
import { createRackedTable } from './rack.js';
import { simulateShot, startShot } from './simulate.js';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  BUMPER_RADIUS,
  FIXED_STEP,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  WELL_RADIUS,
} from './table.const.js';
import { distance } from './vec2.util.js';

test('racked balls never overlap and stay inside the table', () => {
  const { balls } = createRackedTable();

  for (const ball of balls) {
    assert.ok(ball.position.x >= BALL_RADIUS && ball.position.x <= TABLE_WIDTH - BALL_RADIUS);
    assert.ok(ball.position.y >= BALL_RADIUS && ball.position.y <= TABLE_HEIGHT - BALL_RADIUS);

    for (const otherBall of balls) {
      if (otherBall.id !== ball.id) {
        assert.ok(distance(ball.position, otherBall.position) >= BALL_DIAMETER - 1e-9);
      }
    }
  }
});

test('a rolling ball slows down and comes to rest', () => {
  let table = tableWith([ball(0, 1, 0.5, 1, 0)]);
  let steps = 0;

  while (!isAtRest(table) && steps < 10_000) {
    table = stepTable(table).table;
    steps += 1;
  }

  assert.ok(isAtRest(table));
  assert.ok(table.balls[0]!.position.x > 1);
});

test('a head-on hit transfers almost all speed to the struck ball', () => {
  let table = tableWith([ball(0, 1, 0.5, 2, 0), ball(1, 1 + BALL_DIAMETER * 3, 0.5, 0, 0)]);
  let events: ReturnType<typeof stepTable>['events'] = [];

  while (events.length === 0) {
    const result = stepTable(table);

    table = result.table;
    events = result.events;
  }

  assert.deepEqual(events[0], { kind: 'cue-contact', ballId: 1 });
  assert.equal(events[1]?.kind, 'collision');
  assert.ok(events[1]?.kind === 'collision' && events[1].speed > 1.9 && events[1].speed <= 2);
  assert.ok(table.balls[1]!.velocity.x > 1.8);
  assert.ok(Math.abs(table.balls[0]!.velocity.x) < 0.2);
});

test('a ball aimed into a corner is pocketed', () => {
  const table = tableWith([ball(0, 0.2, 0.2, 0, 0)]);
  const { table: settled, events } = simulateShot(table, {
    direction: { x: -1, y: -1 },
    power: 0.3,
  });

  assert.ok(events.some((event) => event.kind === 'pocketed' && event.ballId === 0));
  assert.equal(settled.balls[0]!.pocketed, true);
});

test('a ball resting on a pocket lip rolls in', () => {
  const pocket = POCKETS[0]!;
  const lip = pocket.radius + BALL_RADIUS * 0.3;
  const start = {
    x: pocket.position.x + lip * Math.SQRT1_2,
    y: pocket.position.y + lip * Math.SQRT1_2,
  };
  let table = tableWith([ball(0, start.x, start.y, 0, 0)]);
  let steps = 0;

  while (!table.balls[0]!.pocketed && steps < 2000) {
    table = stepTable(table).table;
    steps += 1;
  }

  assert.equal(table.balls[0]!.pocketed, true);
});

test('a cushion reflects the ball back into play', () => {
  const table = tableWith([ball(0, 1, 0.5, 0, 0)]);
  const { table: settled, events } = simulateShot(table, {
    direction: { x: 0, y: 1 },
    power: 0.15,
  });

  const cushion = events.find((event) => event.kind === 'cushion');

  assert.ok(cushion !== undefined && cushion.speed > 0);
  assert.ok(settled.balls[0]!.position.y < TABLE_HEIGHT - BALL_RADIUS);
  assert.ok(settled.balls[0]!.position.y > TABLE_HEIGHT / 2);
});

test('top spin follows through and back spin draws back after a full hit', () => {
  const cueSpeedAfterContact = (spinY: number): number => {
    let table = startShot(tableWith([ball(0, 0.8, 0.5, 0, 0), ball(1, 1.2, 0.5, 0, 0)]), {
      direction: { x: 1, y: 0 },
      power: 0.5,
      spin: { x: 0, y: spinY },
    });

    for (;;) {
      const result = stepTable(table);

      table = result.table;

      if (result.events.some((event) => event.kind === 'collision')) {
        return table.balls[0]!.velocity.x;
      }
    }
  };

  assert.ok(Math.abs(cueSpeedAfterContact(0)) < 0.2);
  assert.ok(cueSpeedAfterContact(1) > 0.5);
  assert.ok(cueSpeedAfterContact(-1) < -0.5);
});

test('side spin changes the angle off a cushion', () => {
  const shoot = (spinX: number) =>
    simulateShot(tableWith([ball(0, 1, 0.5, 0, 0)]), {
      direction: { x: 0, y: 1 },
      power: 0.3,
      spin: { x: spinX, y: 0 },
    }).table.balls[0]!.position.x;

  // Right english sends the ball to the right of where it would otherwise rebound to.
  assert.ok(Math.abs(shoot(0) - 1) < 1e-6);
  assert.ok(shoot(1) > 1 + 0.05);
  assert.ok(shoot(-1) < 1 - 0.05);
});

test('spin is gone once the balls stop', () => {
  const { table } = simulateShot(createRackedTable(), {
    direction: { x: 1, y: 0.01 },
    power: 0.8,
    spin: { x: 0.5, y: -0.5 },
  });

  assert.ok(table.balls.every((ball) => ball.spin === undefined));
});

test('a bumper bounces a ball back and reports the hit', () => {
  const bumper = trap(0, 'bumper', 1.3, 0.5);
  let table = tableWith([ball(0, 1, 0.5, 1, 0)], [bumper]);
  let events: ReturnType<typeof stepTable>['events'] = [];

  while (events.length === 0) {
    const result = stepTable(table);

    table = result.table;
    events = result.events;
  }

  assert.deepEqual(events[0], { kind: 'bumper', trapId: 0, ballId: 0, speed: events[0]?.speed });
  assert.ok(events[0]?.kind === 'bumper' && events[0].speed > 0.9);
  assert.ok(table.balls[0]!.velocity.x < -0.8);
  assert.ok(table.balls[0]!.position.x <= 1.3 - BUMPER_RADIUS - BALL_RADIUS + 1e-9);
  assert.deepEqual(table.traps, [bumper]);
});

test('a well bends a slow ball passing beside it and holds one resting at the bottom', () => {
  const well = trap(3, 'well', 1, 0.5 + WELL_RADIUS * 0.5);
  const { table: curved } = simulateShot(tableWith([ball(0, 0.6, 0.5, 0, 0)], [well]), {
    direction: { x: 1, y: 0 },
    power: 0.15,
  });
  const { table: straight } = simulateShot(tableWith([ball(0, 0.6, 0.5, 0, 0)]), {
    direction: { x: 1, y: 0 },
    power: 0.15,
  });
  const bottom = tableWith([ball(0, 1.003, well.position.y, 0, 0)], [well]);
  const slope = tableWith([ball(0, 1.1, well.position.y, 0, 0)], [well]);

  assert.ok(curved.balls[0]!.position.y > straight.balls[0]!.position.y + 0.01);
  assert.ok(isAtRest(stepTable(bottom).table));
  assert.ok(!isAtRest(stepTable(slope).table));
});

test('a ball climbing out of a well rolls back and settles at the bottom', () => {
  const well = trap(3, 'well', 1, 0.5);
  let table = tableWith([ball(0, 1.08, 0.5, 0.3, 0)], [well]);
  let steps = 0;
  let farthest = 0;

  while (!isAtRest(table) && steps < 10_000) {
    table = stepTable(table).table;
    farthest = Math.max(farthest, table.balls[0]!.position.x - 1);
    steps += 1;
  }

  const settled = table.balls[0]!.position;

  assert.ok(isAtRest(table));
  // It kept going outward first, then fell back instead of freezing on the slope.
  assert.ok(farthest > 0.09);
  assert.ok(Math.hypot(settled.x - 1, settled.y - 0.5) < 0.01);
  assert.ok(steps < 5 / FIXED_STEP);
});

test('balls crowded into a well come to rest against each other', () => {
  const well = trap(3, 'well', 1, 0.5);
  // Three balls on the slope around the bottom; they roll in and meet, and none can reach the
  // flat spot where the cloth alone would hold it.
  let table = tableWith(
    [
      ball(0, 1.06, 0.5, 0, 0),
      ball(1, 1 - 0.03, 0.5 + 0.05196, 0, 0),
      ball(2, 1 - 0.03, 0.5 - 0.05196, 0, 0),
    ],
    [well],
  );
  let steps = 1;

  table = stepTable(table).table;
  assert.ok(!isAtRest(table));

  while (!isAtRest(table) && steps < 10_000) {
    table = stepTable(table).table;
    steps += 1;
  }

  assert.ok(isAtRest(table));
  assert.ok(steps < 3 / FIXED_STEP);

  for (const id of [0, 1, 2]) {
    const { x, y } = table.balls[id]!.position;

    assert.ok(Math.hypot(x - 1, y - 0.5) < BALL_DIAMETER);
  }
});

test('the same shot from the same table is bit-for-bit reproducible', () => {
  const table = createRackedTable();
  const shot = { direction: { x: 0.98, y: 0.02 }, power: 0.9, spin: { x: 0.3, y: -0.5 } };

  const first = simulateShot(table, shot);
  const second = simulateShot(table, shot);

  assert.deepEqual(first, second);
  assert.ok(first.events.some((event) => event.kind === 'cue-contact'));

  const trapped = { ...table, traps: [trap(0, 'bumper', 1, 0.3), trap(1, 'well', 1.4, 0.9)] };

  assert.deepEqual(simulateShot(trapped, shot), simulateShot(trapped, shot));
});

function tableWith(active: Ball[], traps: Trap[] = []): TableState {
  const balls = createRackedTable().balls.map((racked) => ({ ...racked, pocketed: true }));

  for (const current of active) {
    balls[current.id] = current;
  }

  return { balls, traps };
}

function trap(id: number, kind: Trap['kind'], x: number, y: number): Trap {
  return { id, kind, owner: 0, position: { x, y }, shotsLeft: 3 };
}

function ball(id: number, x: number, y: number, vx: number, vy: number): Ball {
  return { id, position: { x, y }, velocity: { x: vx, y: vy }, pocketed: false };
}
