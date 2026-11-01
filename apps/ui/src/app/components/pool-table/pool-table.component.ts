import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type {
  Aim,
  BallGroup,
  BallId,
  Shot,
  Spin,
  TableState,
  TrapKind,
  TrapRequest,
  Vec2,
} from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  HEAD_SPOT,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  canPlacePortalMouth,
  canPlaceTrap,
  needsExit,
  placeBallInHand,
  snapTrapPosition,
} from '@dirtypool/game';
import { Application, Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import {
  AIM_ROTATE_STEP,
  CUE_FOLLOW_THROUGH,
  CUE_MAX_PULL,
  FOLLOW_THROUGH_MS,
  MIN_SHOT_POWER,
  STRIKE_DURATION_MS,
  TABLE_ASPECT_RATIO,
} from '../../config/table-render.const';
import { FRAME_SCHEDULER } from '../../types/frame-scheduler.type';
import type { RemoteShot } from '../../types/remote-shot.type';
import type { Viewport } from '../../types/viewport.type';
import {
  aimAlong,
  cueBall,
  defaultAimDirection,
  directionFromPointer,
  rotateDirection,
} from '../../utils/aim.util';
import { measureViewport, toScreen, toWorld } from '../../utils/viewport.util';
import {
  type BallSprite,
  animateSink,
  createBallSprite,
  drawBallShadows,
  placeBallSprite,
  resetSink,
  startSink,
} from './ball-sprite.util';
import { type CueLine, drawAimGuide, drawCue } from './cue.util';
import { foulTargetPosition } from './foul-target.util';
import { type PocketBurst, drawPocketBursts, startPocketBurst } from './pocket-burst.util';
import { drawTableSurface } from './table-surface.util';
import { drawTrapGhost, drawTraps } from './trap.util';

// The cue while it strikes: fixed to where the cue ball was, so it never follows the ball.
interface Strike extends CueLine {
  readonly pull: number;
  readonly alpha: number;
}

@Component({
  selector: 'dp-pool-table',
  template: '',
  host: {
    '[style.aspect-ratio]': 'aspectRatio',
    '[style.cursor]': 'cursor()',
    '(window:keydown)': 'onKeyDown($event)',
  },
  styles: `
    :host {
      display: block;
      width: 100%;
      touch-action: none;
      user-select: none;
      filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.55));
    }
  `,
})
export class PoolTable {
  readonly table = input.required<TableState>();
  readonly interactive = input(false);
  // 0..1, drawn as cue pull-back while the player sets the shot power.
  readonly power = input(0);
  readonly spin = input<Spin>({ x: 0, y: 0 });
  // The opponent's live aim while it is their turn; drawn as a cue without guide lines.
  readonly remoteAim = input<Aim | null>(null);
  // The opponent's shot once it arrives: their cue strikes and fades as the balls set off.
  readonly remoteShot = input<RemoteShot | null>(null);
  // Balls this player may hit first; null means anything goes. Aiming elsewhere is marked.
  readonly legalTargets = input<readonly BallId[] | null>(null);
  // Ball in hand: the cue ball can be dragged to a new spot before the shot, and for the break
  // only behind the head string.
  readonly ballInHand = input(false);
  readonly kitchenOnly = input(false);
  // The trap picked from the pouch: the next tap on the cloth drops it instead of aiming.
  readonly placingTrap = input<TrapKind | null>(null);
  // Which way a wall or fan being placed runs, and which group a magnet pulls.
  readonly placingDirection = input<Vec2 | null>(null);
  readonly placingGroup = input<BallGroup | null>(null);
  readonly shot = output<Shot>();
  readonly trapPlace = output<TrapRequest>();
  // Fires while this player aims, so the opponent can watch the cue.
  readonly aimChange = output<Aim>();
  // Cue ball dragging while ball in hand: every move for preview, then the final spot.
  readonly cueMove = output<Vec2>();
  readonly cuePlace = output<Vec2>();

  protected readonly aspectRatio = TABLE_ASPECT_RATIO;
  protected readonly cursor = computed(() => (this.placingTrap() === null ? null : 'crosshair'));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly frames = inject(FRAME_SCHEDULER);
  private readonly app = signal<Application | null>(null);
  private readonly viewport = signal<Viewport>({ scale: 1, offset: { x: 0, y: 0 } });
  private readonly direction = signal<Vec2 | null>(null);
  private readonly strike = signal<Strike | null>(null);
  private readonly hoverPoint = signal<Vec2 | null>(null);
  // The first mouth of a portal being placed; the next tap, or the end of a drag, sets the other.
  private readonly portalEntry = signal<Vec2 | null>(null);
  private readonly aim = computed(() => {
    if (this.interactive()) {
      const direction = this.direction();

      return direction === null
        ? null
        : aimAlong(this.table(), direction, this.spin(), this.power());
    }

    const remote = this.remoteAim();

    return remote === null
      ? null
      : aimAlong(this.table(), remote.direction, remote.spin, remote.power);
  });
  private readonly cuePull = computed(() => {
    const power = this.interactive() ? this.power() : (this.remoteAim()?.power ?? 0);

    return power * CUE_MAX_PULL;
  });
  private readonly surface = new Graphics();
  private readonly shadows = new Graphics();
  private readonly traps = new Graphics();
  private readonly balls = new Container();
  private readonly ghost = new Graphics();
  private readonly guide = new Graphics();
  private readonly cue = new Graphics();
  private readonly bursts = new Graphics();
  private readonly activeBursts: PocketBurst[] = [];
  private readonly ballSprites = new Map<BallId, BallSprite>();
  private readonly draggingCue = signal(false);
  private aiming = false;
  private dragPoint: Vec2 | null = null;

  constructor() {
    afterNextRender(() => void this.mount());
    inject(DestroyRef).onDestroy(() => this.app()?.destroy(true, { children: true }));

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();

      untracked(() => {
        if (app !== null) {
          drawTableSurface(this.surface, viewport);
          this.buildBallSprites(viewport);
        }
      });
    });

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();
      const table = this.table();

      untracked(() => {
        if (app !== null) {
          this.placeBalls(table, viewport);
          drawBallShadows(this.shadows, table, viewport);
        }
      });
    });

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();
      const aim = this.aim();
      const pull = this.cuePull();
      const strike = this.strike();
      const dragging = this.draggingCue();
      const showGuide = this.interactive() && strike === null && !dragging;
      const legal = this.legalTargets();
      const table = this.table();
      const grabbable = this.interactive() && this.ballInHand() && !dragging;

      untracked(() => {
        if (app === null) {
          return;
        }

        if (strike !== null) {
          this.guide.clear();
          this.cue.alpha = strike.alpha;
          drawCue(this.cue, strike, strike.pull, viewport);
          return;
        }

        this.cue.alpha = 1;

        if (aim === null || dragging) {
          this.guide.clear();
          this.cue.clear();
          return;
        }

        drawCue(this.cue, aim, pull, viewport);

        if (showGuide) {
          drawAimGuide(this.guide, aim, viewport, {
            foulTarget: foulTargetPosition(table, aim.targetBallId, legal),
          });
        } else {
          this.guide.clear();
        }

        if (grabbable) {
          const centre = toScreen(aim.origin, viewport);

          this.guide
            .circle(centre.x, centre.y, BALL_RADIUS * viewport.scale * 1.6)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
        }
      });
    });

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();
      const placing = this.placingTrap();
      const hover = this.hoverPoint();
      const table = this.table();
      const request = placing === null || hover === null ? null : this.trapRequest(placing, hover);

      untracked(() => {
        if (app === null) {
          return;
        }

        if (request === null) {
          this.ghost.clear();
          return;
        }

        drawTrapGhost(this.ghost, request, this.allowed(table, request), viewport);
      });
    });

    effect(() => {
      this.placingTrap();

      untracked(() => this.portalEntry.set(null));
    });

    effect(() => {
      const interactive = this.interactive();
      const direction = this.direction();
      const power = this.power();

      untracked(() => {
        if (interactive && direction !== null) {
          this.aimChange.emit({ direction, power });
        }
      });
    });

    effect(() => {
      const interactive = this.interactive();

      untracked(() => {
        this.aiming = false;
        this.direction.set(interactive ? defaultAimDirection(this.table()) : null);
      });
    });

    // The balls are already rolling by the time the opponent's shot arrives, so their cue
    // starts at the ball and only follows through.
    effect(() => {
      const remote = this.remoteShot();

      untracked(() => {
        const cue = remote === null ? null : cueBall(this.table());

        if (remote !== null && cue !== null && !this.interactive()) {
          this.runStrike({ origin: cue.position, direction: remote.shot.direction }, 0);
        }
      });
    });
  }

  // Plays the strike animation and emits the shot at the moment of impact.
  fire(requestedPower: number): void {
    const aim = this.aim();
    const power = Math.min(1, Math.max(0, requestedPower));

    if (aim === null || this.strike() !== null || power < MIN_SHOT_POWER) {
      return;
    }

    const spin = this.spin();
    const shot: Shot =
      spin.x === 0 && spin.y === 0
        ? { direction: aim.direction, power }
        : { direction: aim.direction, power, spin };

    this.runStrike(aim, power * CUE_MAX_PULL, () => this.shot.emit(shot));
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const direction = this.direction();

    if (event.defaultPrevented || direction === null || !this.canAim()) {
      return;
    }

    const sign = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;

    if (sign === 0) {
      return;
    }

    event.preventDefault();
    this.direction.set(
      rotateDirection(direction, sign * AIM_ROTATE_STEP * (event.shiftKey ? 8 : 1)),
    );
  }

  private canAim(): boolean {
    return this.interactive() && this.strike() === null && this.placingTrap() === null;
  }

  // Pulls the cue into the ball, calls `onImpact`, then lets it follow through and fade out.
  private runStrike(line: CueLine, pull: number, onImpact?: () => void): void {
    let startedAt: number | null = null;
    let struck = pull === 0;

    const tick = (timestamp: number): void => {
      startedAt ??= timestamp;

      const elapsed = timestamp - startedAt;

      if (!struck) {
        const progress = Math.min(1, elapsed / STRIKE_DURATION_MS);

        this.strike.set({ ...line, pull: pull * (1 - progress * progress), alpha: 1 });

        if (progress < 1) {
          this.frames.request(tick);
          return;
        }

        struck = true;
        startedAt = timestamp;
        onImpact?.();
      }

      const progress = Math.min(1, (timestamp - startedAt) / FOLLOW_THROUGH_MS);

      if (progress < 1) {
        this.strike.set({ ...line, pull: -CUE_FOLLOW_THROUGH * progress, alpha: 1 - progress });
        this.frames.request(tick);
        return;
      }

      this.strike.set(null);
      this.cue.clear();
    };

    this.strike.set({ ...line, pull, alpha: 1 });
    this.frames.request(tick);
  }

  private async mount(): Promise<void> {
    const app = new Application();

    await app.init({
      // The ball shader is written for WebGL 2; keep every browser on the same renderer.
      preference: 'webgl',
      resizeTo: this.host.nativeElement,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
    });

    this.host.nativeElement.appendChild(app.canvas);
    app.stage.addChild(
      this.surface,
      this.shadows,
      this.traps,
      this.balls,
      this.ghost,
      this.bursts,
      this.guide,
      this.cue,
    );
    app.stage.eventMode = 'static';
    app.ticker.add(() => this.animateFrame());
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (event) => this.onPointerDown(event));
    app.stage.on('pointermove', (event) => this.onPointerMove(event));
    app.stage.on('pointerup', () => this.onPointerUp());
    app.stage.on('pointerupoutside', () => this.onPointerUp());
    app.renderer.on('resize', () =>
      this.viewport.set(measureViewport(app.screen.width, app.screen.height)),
    );

    this.viewport.set(measureViewport(app.screen.width, app.screen.height));
    this.app.set(app);
  }

  private onPointerDown(event: FederatedPointerEvent): void {
    const placing = this.placingTrap();

    if (placing !== null) {
      this.pressTrap(placing, toWorld(event.global, this.viewport()));
      return;
    }

    if (!this.canAim()) {
      return;
    }

    const point = toWorld(event.global, this.viewport());
    const cue = cueBall(this.table());

    if (
      this.ballInHand() &&
      cue !== null &&
      Math.hypot(point.x - cue.position.x, point.y - cue.position.y) < BALL_RADIUS * 2.5
    ) {
      this.draggingCue.set(true);
      this.dragCueTo(point);
      return;
    }

    this.aiming = true;
    this.aimAt(event.global);
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.placingTrap() !== null) {
      this.hoverPoint.set(toWorld(event.global, this.viewport()));
      return;
    }

    if (this.draggingCue()) {
      this.dragCueTo(toWorld(event.global, this.viewport()));
      return;
    }

    if (this.aiming && this.canAim()) {
      this.aimAt(event.global);
    }
  }

  private onPointerUp(): void {
    this.aiming = false;

    const placing = this.placingTrap();
    const hover = this.hoverPoint();

    if (placing !== null && this.portalEntry() !== null && hover !== null) {
      this.dropTrap(placing, hover);
      return;
    }

    if (this.draggingCue()) {
      this.draggingCue.set(false);
      this.tintCueBall(true);

      if (this.dragPoint !== null) {
        this.cuePlace.emit(this.dragPoint);
      }

      this.dragPoint = null;
    }
  }

  // A portal's first tap pins a mouth, and the second tap or the end of the drag drops the trap.
  private pressTrap(kind: TrapKind, position: Vec2): void {
    if (!needsExit(kind) || this.portalEntry() !== null) {
      this.dropTrap(kind, position);
    } else if (this.interactive() && canPlacePortalMouth(this.table(), position)) {
      this.portalEntry.set(position);
    }
  }

  // A tap on a blocked spot does nothing; the ghost already shows why. A portal keeps its first
  // mouth until the second lands somewhere allowed.
  private dropTrap(kind: TrapKind, position: Vec2): void {
    const request = this.trapRequest(kind, position);

    if (!this.interactive() || !canPlaceTrap(this.table(), request)) {
      return;
    }

    this.hoverPoint.set(null);
    this.portalEntry.set(null);
    this.trapPlace.emit(request);
  }

  private allowed(table: TableState, request: TrapRequest): boolean {
    return needsExit(request.kind) && request.exit === undefined
      ? canPlacePortalMouth(table, request.position)
      : canPlaceTrap(table, request);
  }

  // What dropping the picked trap here would ask for, with a plug already on its pocket and a
  // portal's pinned mouth as its first.
  private trapRequest(kind: TrapKind, point: Vec2): TrapRequest {
    const direction = this.placingDirection();
    const group = this.placingGroup();
    const entry = needsExit(kind) ? this.portalEntry() : null;

    return {
      kind,
      position: entry ?? snapTrapPosition(kind, point),
      ...(direction === null ? {} : { direction }),
      ...(group === null ? {} : { group }),
      ...(entry === null ? {} : { exit: point }),
    };
  }

  private dragCueTo(point: Vec2): void {
    const kitchenOnly = this.kitchenOnly();
    const position = {
      x: Math.min(
        kitchenOnly ? HEAD_SPOT.x : TABLE_WIDTH - BALL_RADIUS,
        Math.max(BALL_RADIUS, point.x),
      ),
      y: Math.min(TABLE_HEIGHT - BALL_RADIUS, Math.max(BALL_RADIUS, point.y)),
    };

    this.dragPoint = position;
    this.tintCueBall(placeBallInHand(this.table(), position, kitchenOnly) !== null);
    this.cueMove.emit(position);
  }

  private tintCueBall(allowed: boolean): void {
    const sprite = this.ballSprites.get(0);

    if (sprite !== undefined) {
      sprite.view.tint = allowed ? 0xffffff : 0xff6b6b;
    }
  }

  private aimAt(point: Vec2): void {
    const cue = cueBall(this.table());

    if (cue === null) {
      return;
    }

    const direction = directionFromPointer(cue.position, toWorld(point, this.viewport()));

    if (direction !== null) {
      this.direction.set(direction);
    }
  }

  private buildBallSprites(viewport: Viewport): void {
    this.balls.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.ballSprites.clear();

    const radius = BALL_RADIUS * viewport.scale;

    for (const ball of this.table().balls) {
      const sprite = createBallSprite(ball.id, radius);

      sprite.pocketed = ball.pocketed;
      sprite.view.visible = !ball.pocketed;
      this.ballSprites.set(ball.id, sprite);
      this.balls.addChild(sprite.view);
    }
  }

  private placeBalls(table: TableState, viewport: Viewport): void {
    for (const ball of table.balls) {
      const sprite = this.ballSprites.get(ball.id);

      if (sprite === undefined) {
        continue;
      }

      if (ball.pocketed) {
        // The simulation parks a captured ball on the pocket or hole that took it.
        if (!sprite.pocketed) {
          startSink(sprite, ball.position, performance.now());
          this.activeBursts.push(startPocketBurst(ball.id, ball.position, performance.now()));
        }

        continue;
      }

      if (sprite.pocketed) {
        resetSink(sprite);
      }

      placeBallSprite(sprite, ball.position, viewport);
    }
  }

  private animateFrame(): void {
    const now = performance.now();
    const viewport = this.viewport();

    for (const sprite of this.ballSprites.values()) {
      animateSink(sprite, now, viewport);
    }

    drawTraps(this.traps, this.table().traps, viewport, now);
    drawPocketBursts(this.bursts, this.activeBursts, now, viewport);
  }
}
