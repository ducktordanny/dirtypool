import type { BallId, Vec2 } from '@dirtypool/contracts';

// All lengths are metres, all speeds metres per second.
export const TABLE_WIDTH = 2.24;
export const TABLE_HEIGHT = 1.12;
export const BALL_RADIUS = 0.028575;
export const BALL_DIAMETER = BALL_RADIUS * 2;

export const CUE_BALL_ID: BallId = 0;
export const EIGHT_BALL_ID: BallId = 8;
export const BALL_COUNT = 16;

export const HEAD_SPOT: Vec2 = { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 };
export const FOOT_SPOT: Vec2 = { x: (TABLE_WIDTH * 3) / 4, y: TABLE_HEIGHT / 2 };

export interface Pocket {
  readonly position: Vec2;
  // A ball is pocketed once its centre is within this distance.
  readonly radius: number;
  // The cushions stop this far beyond the radius: inside, a ball is never reflected.
  readonly mouth: number;
}

// Pocket centres sit slightly outside the playing surface, inside the rail. In the mouth the
// cushions no longer reflect a ball; once it overlaps the hole enough, LIP_PULL draws it in so it
// never hangs on the edge.
const CORNER_OUTSET = 0.025;
const SIDE_OUTSET = 0.055;
const CORNER = { radius: 0.072, mouth: 0.045 };
const SIDE = { radius: 0.056, mouth: 0.055 };

export const POCKETS: readonly Pocket[] = [
  { position: { x: -CORNER_OUTSET, y: -CORNER_OUTSET }, ...CORNER },
  { position: { x: TABLE_WIDTH / 2, y: -SIDE_OUTSET }, ...SIDE },
  { position: { x: TABLE_WIDTH + CORNER_OUTSET, y: -CORNER_OUTSET }, ...CORNER },
  { position: { x: -CORNER_OUTSET, y: TABLE_HEIGHT + CORNER_OUTSET }, ...CORNER },
  { position: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + SIDE_OUTSET }, ...SIDE },
  { position: { x: TABLE_WIDTH + CORNER_OUTSET, y: TABLE_HEIGHT + CORNER_OUTSET }, ...CORNER },
];

// Acceleration towards the pocket centre while a ball is on the lip, in m/s^2.
export const LIP_PULL = 3;
// A ball overlapping the hole by this fraction of its radius is on the lip.
export const LIP_OVERLAP = 0.25;

export const MAX_SHOT_SPEED = 6;
export const ROLLING_DECELERATION = 0.25;
// Extra slowing proportional to speed (per second), so hard shots settle without braking the tail.
export const SPEED_DRAG = 0.12;
export const REST_SPEED = 0.02;
export const BALL_RESTITUTION = 0.96;
export const CUSHION_RESTITUTION = 0.7;

// Spin is stored as the velocity it can still turn into. A full-power shot struck at the edge
// of the cue ball carries MAX_SPIN; it bleeds off at SPIN_DECAY per second while rolling.
export const MAX_SPIN = 2.4;
export const SPIN_DECAY = 0.6;
// Fraction of side spin that becomes sideways velocity on a square cushion hit.
export const SIDE_SPIN_GRIP = 0.5;

// Every client and the server must step with exactly this value for identical results.
export const FIXED_STEP = 1 / 480;
export const MAX_SHOT_SECONDS = 60;
export const MAX_SHOT_STEPS = Math.ceil(MAX_SHOT_SECONDS / FIXED_STEP);

// A player has this long to take a shot once the balls are still; then the turn passes.
export const SHOT_CLOCK_MS = 30_000;

// Traps. A bumper is a fixed round post balls bounce off. A well pulls every moving ball inside
// its reach towards the centre: the pull ramps up over the core, peaks there and fades to nothing
// at the edge, so slow balls curl in and settle at the bottom while fast ones barely notice. The
// well also damps motion so a captured ball stops in a few seconds instead of swinging about.
// Only the bottom is flat enough for the cloth to hold a ball; anywhere else on the slope it rolls.
export const BUMPER_RADIUS = 0.036;
export const BUMPER_RESTITUTION = 0.9;
export const WELL_RADIUS = 0.2;
export const WELL_CORE = 0.05;
export const WELL_PULL = 2.5;
export const WELL_DRAG = 2;
// A hole pulls like a well and swallows any ball whose centre gets this close.
export const HOLE_RADIUS = 0.035;
// A spring is a bumper that throws balls back faster than they came, up to a cap.
export const SPRING_RESTITUTION = 1.6;
export const SPRING_MAX_EXIT = 3;
// A fan blows along its direction over a strip this long each way and this wide each side.
export const FAN_REACH = 0.12;
export const FAN_HALF_WIDTH = 0.07;
export const FAN_PUSH = 2.5;
// Mud and ice scale the cloth friction under them.
export const MUD_RADIUS = 0.12;
export const MUD_FRICTION = 6;
export const ICE_RADIUS = 0.14;
export const ICE_FRICTION = 0.08;
// A wall is a rubber capsule: this long from the centre to each end, and this thick.
export const WALL_HALF_LENGTH = 0.08;
export const WALL_RADIUS = 0.008;
// The directions a wall can run, fixed so neither side ever needs trigonometry.
const SQRT_HALF = 0.7071067811865476;
export const WALL_DIRECTIONS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: SQRT_HALF, y: SQRT_HALF },
  { x: 0, y: 1 },
  { x: -SQRT_HALF, y: SQRT_HALF },
];
// A portal mouth takes any ball whose centre gets this close and lets it out of the other mouth
// just past its edge, so it is not taken straight back.
export const PORTAL_RADIUS = 0.04;
export const PORTAL_EXIT_OFFSET = PORTAL_RADIUS + 0.002;
// Placement keeps this much cloth between a trap's footprint and anything else.
export const TRAP_CLEARANCE = 0.01;
export const TRAPS_PER_PLAYER = 4;
// A trap outlives the shot it was placed for and the opponent's reply, then goes.
export const TRAP_LIFETIME_SHOTS = 3;
