import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { Ball, BallId, Shot, TableState, Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS, POCKETS, TABLE_HEIGHT, TABLE_WIDTH, add, scale } from '@dirtypool/game';
import { Application, Container, type FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import {
  MIN_SHOT_POWER,
  RAIL_WIDTH,
  TABLE_ASPECT_RATIO,
  TABLE_COLORS,
  ballColor,
  isStripe,
} from '../../config/table-render.const';
import type { ShotAim } from '../../types/shot-aim.type';
import { aimFromPointer } from '../../utils/aim.util';

interface Viewport {
  readonly scale: number;
  readonly offset: Vec2;
}

@Component({
  selector: 'dp-pool-table',
  template: '',
  host: { '[style.aspect-ratio]': 'aspectRatio' },
  styles: `
    :host {
      display: block;
      width: 100%;
      touch-action: none;
      user-select: none;
      border-radius: var(--radius);
      overflow: hidden;
    }
  `,
})
export class PoolTable {
  readonly table = input.required<TableState>();
  readonly interactive = input(false);
  readonly shot = output<Shot>();

  protected readonly aspectRatio = TABLE_ASPECT_RATIO;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly app = signal<Application | null>(null);
  private readonly viewport = signal<Viewport>({ scale: 1, offset: { x: 0, y: 0 } });
  private readonly aim = signal<ShotAim | null>(null);
  private readonly surface = new Graphics();
  private readonly balls = new Container();
  private readonly overlay = new Graphics();
  private readonly ballSprites = new Map<BallId, Container>();

  constructor() {
    afterNextRender(() => void this.mount());
    inject(DestroyRef).onDestroy(() => this.app()?.destroy(true, { children: true }));

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();

      untracked(() => {
        if (app !== null) {
          this.drawSurface(viewport);
          this.buildBallSprites(viewport);
        }
      });
    });

    effect(() => {
      const app = this.app();
      const viewport = this.viewport();
      const table = this.table();
      const aim = this.interactive() ? this.aim() : null;

      untracked(() => {
        if (app !== null) {
          this.placeBalls(table, viewport);
          this.drawOverlay(aim, viewport);
        }
      });
    });
  }

  private async mount(): Promise<void> {
    const app = new Application();

    await app.init({
      resizeTo: this.host.nativeElement,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      background: TABLE_COLORS.pocket,
    });

    this.host.nativeElement.appendChild(app.canvas);
    app.stage.addChild(this.surface, this.balls, this.overlay);
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (event) => this.onPointerDown(event));
    app.stage.on('pointermove', (event) => this.onPointerMove(event));
    app.stage.on('pointerup', (event) => this.onPointerUp(event));
    app.stage.on('pointerupoutside', () => this.aim.set(null));
    app.renderer.on('resize', () => this.viewport.set(this.measure(app)));

    this.viewport.set(this.measure(app));
    this.app.set(app);
  }

  private measure(app: Application): Viewport {
    const scale = Math.min(
      app.screen.width / (TABLE_WIDTH + RAIL_WIDTH * 2),
      app.screen.height / (TABLE_HEIGHT + RAIL_WIDTH * 2),
    );
    const offset = {
      x: (app.screen.width - TABLE_WIDTH * scale) / 2,
      y: (app.screen.height - TABLE_HEIGHT * scale) / 2,
    };

    return { scale, offset };
  }

  private onPointerDown(event: FederatedPointerEvent): void {
    if (!this.interactive()) {
      return;
    }

    this.aim.set(aimFromPointer(this.table(), this.toWorld(event.global)));
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.aim() === null) {
      return;
    }

    this.aim.set(aimFromPointer(this.table(), this.toWorld(event.global)));
  }

  private onPointerUp(event: FederatedPointerEvent): void {
    const aim =
      this.aim() === null ? null : aimFromPointer(this.table(), this.toWorld(event.global));

    this.aim.set(null);

    if (aim !== null && aim.power >= MIN_SHOT_POWER) {
      this.shot.emit({ direction: aim.direction, power: aim.power });
    }
  }

  private toWorld(point: Vec2): Vec2 {
    const { scale, offset } = this.viewport();

    return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
  }

  private toScreen(point: Vec2, viewport: Viewport): Vec2 {
    return add(scale(point, viewport.scale), viewport.offset);
  }

  private drawSurface({ scale, offset }: Viewport): void {
    const rail = RAIL_WIDTH * scale;

    this.surface
      .clear()
      .roundRect(
        offset.x - rail,
        offset.y - rail,
        TABLE_WIDTH * scale + rail * 2,
        TABLE_HEIGHT * scale + rail * 2,
        rail,
      )
      .fill(TABLE_COLORS.rail)
      .rect(offset.x, offset.y, TABLE_WIDTH * scale, TABLE_HEIGHT * scale)
      .fill(TABLE_COLORS.felt);

    for (const pocket of POCKETS) {
      const centre = this.toScreen(pocket.position, { scale, offset });

      this.surface.circle(centre.x, centre.y, pocket.radius * scale).fill(TABLE_COLORS.pocket);
    }
  }

  private buildBallSprites(viewport: Viewport): void {
    this.balls.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.ballSprites.clear();

    const radius = BALL_RADIUS * viewport.scale;

    for (const ball of this.table().balls) {
      const sprite = this.createBallSprite(ball.id, radius);

      this.ballSprites.set(ball.id, sprite);
      this.balls.addChild(sprite);
    }
  }

  private createBallSprite(id: BallId, radius: number): Container {
    const sprite = new Container();
    const color = ballColor(id);
    const base = new Graphics().circle(0, 0, radius).fill(isStripe(id) ? 0xffffff : color);

    sprite.addChild(base);

    if (isStripe(id)) {
      const band = new Graphics().rect(-radius, -radius / 2, radius * 2, radius).fill(color);
      const mask = new Graphics().circle(0, 0, radius).fill(0xffffff);

      band.mask = mask;
      sprite.addChild(mask, band);
    }

    if (id !== 0) {
      const label = new Graphics().circle(0, 0, radius * 0.55).fill(0xffffff);
      const number = new Text({
        text: String(id),
        style: { fontSize: radius * 0.9, fontWeight: '700', fill: 0x111111 },
      });

      number.anchor.set(0.5);
      sprite.addChild(label, number);
    }

    return sprite;
  }

  private placeBalls(table: TableState, viewport: Viewport): void {
    for (const ball of table.balls) {
      const sprite = this.ballSprites.get(ball.id);

      if (sprite === undefined) {
        continue;
      }

      sprite.visible = !ball.pocketed;
      sprite.position.copyFrom(this.toScreen(ball.position, viewport));
    }
  }

  private drawOverlay(aim: ShotAim | null, viewport: Viewport): void {
    this.overlay.clear();

    if (aim === null) {
      return;
    }

    const origin = this.toScreen(aim.origin, viewport);
    const ghost = this.toScreen(aim.ghost, viewport);
    const radius = BALL_RADIUS * viewport.scale;
    const pullBack = this.toScreen(
      add(aim.origin, scale(aim.direction, -aim.power * BALL_RADIUS * 8)),
      viewport,
    );

    this.overlay
      .moveTo(origin.x, origin.y)
      .lineTo(ghost.x, ghost.y)
      .stroke({ color: TABLE_COLORS.aim, width: 2, alpha: 0.6 })
      .circle(ghost.x, ghost.y, radius)
      .stroke({ color: TABLE_COLORS.ghost, width: 2, alpha: 0.8 })
      .moveTo(origin.x, origin.y)
      .lineTo(pullBack.x, pullBack.y)
      .stroke({ color: TABLE_COLORS.aim, width: 6, alpha: 0.35 });
  }
}

export type { Ball };
