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
import type { BallId, Shot, TableState, Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS } from '@dirtypool/game';
import { Application, Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import {
  AIM_ROTATE_STEP,
  CUE_MAX_PULL,
  MIN_SHOT_POWER,
  STRIKE_DURATION_MS,
  TABLE_ASPECT_RATIO,
} from '../../config/table-render.const';
import { FRAME_SCHEDULER } from '../../types/frame-scheduler.type';
import type { Viewport } from '../../types/viewport.type';
import {
  aimAlong,
  cueBall,
  defaultAimDirection,
  directionFromPointer,
  rotateDirection,
} from '../../utils/aim.util';
import { measureViewport, toWorld } from '../../utils/viewport.util';
import {
  type BallSprite,
  animateSink,
  createBallSprite,
  drawBallShadows,
  placeBallSprite,
  resetSink,
  startSink,
} from './ball-sprite.util';
import { drawAimGuide, drawCue } from './cue.util';
import { drawTableSurface, nearestPocketVisual } from './table-surface.util';

@Component({
  selector: 'dp-pool-table',
  template: '',
  host: {
    '[style.aspect-ratio]': 'aspectRatio',
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
  readonly shot = output<Shot>();

  protected readonly aspectRatio = TABLE_ASPECT_RATIO;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly frames = inject(FRAME_SCHEDULER);
  private readonly app = signal<Application | null>(null);
  private readonly viewport = signal<Viewport>({ scale: 1, offset: { x: 0, y: 0 } });
  private readonly direction = signal<Vec2 | null>(null);
  private readonly strikePull = signal<number | null>(null);
  private readonly aim = computed(() => {
    const direction = this.direction();

    return direction === null || !this.interactive() ? null : aimAlong(this.table(), direction);
  });
  private readonly cuePull = computed(() => this.strikePull() ?? this.power() * CUE_MAX_PULL);
  private readonly surface = new Graphics();
  private readonly shadows = new Graphics();
  private readonly balls = new Container();
  private readonly guide = new Graphics();
  private readonly cue = new Graphics();
  private readonly ballSprites = new Map<BallId, BallSprite>();
  private aiming = false;

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
      const striking = this.strikePull() !== null;

      untracked(() => {
        if (app === null) {
          return;
        }

        if (aim === null) {
          this.guide.clear();
          this.cue.clear();
          return;
        }

        drawCue(this.cue, aim, pull, viewport);

        if (striking) {
          this.guide.clear();
        } else {
          drawAimGuide(this.guide, aim, viewport);
        }
      });
    });

    effect(() => {
      const interactive = this.interactive();

      untracked(() => {
        this.aiming = false;
        this.strikePull.set(null);
        this.direction.set(interactive ? defaultAimDirection(this.table()) : null);
      });
    });
  }

  // Plays the strike animation, then emits the shot.
  fire(power: number): void {
    const aim = this.aim();

    if (aim === null || this.strikePull() !== null || power < MIN_SHOT_POWER) {
      return;
    }

    const shot: Shot = { direction: aim.direction, power };
    const pull = power * CUE_MAX_PULL;
    let startedAt: number | null = null;

    const tick = (timestamp: number): void => {
      startedAt ??= timestamp;

      const progress = Math.min(1, (timestamp - startedAt) / STRIKE_DURATION_MS);

      this.strikePull.set(pull * (1 - progress * progress));

      if (progress < 1) {
        this.frames.request(tick);
        return;
      }

      this.shot.emit(shot);
      this.strikePull.set(null);
    };

    this.strikePull.set(pull);
    this.frames.request(tick);
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
    return this.interactive() && this.strikePull() === null;
  }

  private async mount(): Promise<void> {
    const app = new Application();

    await app.init({
      resizeTo: this.host.nativeElement,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
    });

    this.host.nativeElement.appendChild(app.canvas);
    app.stage.addChild(this.surface, this.shadows, this.balls, this.guide, this.cue);
    app.stage.eventMode = 'static';
    app.ticker.add(() => this.animateSinks());
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
    if (!this.canAim()) {
      return;
    }

    this.aiming = true;
    this.aimAt(event.global);
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.aiming && this.canAim()) {
      this.aimAt(event.global);
    }
  }

  private onPointerUp(): void {
    this.aiming = false;
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
        if (!sprite.pocketed) {
          const from = sprite.lastPosition ?? ball.position;

          startSink(sprite, nearestPocketVisual(from).centre, performance.now());
        }

        continue;
      }

      if (sprite.pocketed) {
        resetSink(sprite);
      }

      placeBallSprite(sprite, ball.position, viewport);
    }
  }

  private animateSinks(): void {
    const now = performance.now();
    const viewport = this.viewport();

    for (const sprite of this.ballSprites.values()) {
      animateSink(sprite, now, viewport);
    }
  }
}
