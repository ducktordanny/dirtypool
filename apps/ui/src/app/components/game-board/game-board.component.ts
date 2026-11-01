import {
  Component,
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
  GameState,
  PlayerIndex,
  Shot,
  Spin,
  TableState,
  TrapKind,
  TrapRequest,
  Vec2,
} from '@dirtypool/contracts';
import { CUE_BALL_ID, WALL_DIRECTIONS, needsDirection, needsGroup } from '@dirtypool/game';
import { AudioService } from '../../services/audio.service';
import { legalTargetIds } from '../../utils/legal-targets.util';
import type { RemoteShot } from '../../types/remote-shot.type';
import type { ShotAnnouncement } from '../../types/shot-announcement.type';
import type { ShotClock } from '../../types/shot-clock.type';
import { BallTray } from '../ball-tray/ball-tray.component';
import { MatchHud, type PlayerNames } from '../match-hud/match-hud.component';
import { PoolTable } from '../pool-table/pool-table.component';
import { HelpTip, MatchResult, OutcomeBanner, PowerSlider, SpinControl, TrapTray } from '../ui';

// HUD, power bar, table and tray laid out together; used by both hotseat and online play.
@Component({
  imports: [
    BallTray,
    HelpTip,
    MatchHud,
    MatchResult,
    OutcomeBanner,
    PoolTable,
    PowerSlider,
    SpinControl,
    TrapTray,
  ],
  selector: 'dp-game-board',
  host: {
    '(window:keydown.escape)': 'placingTrap.set(null)',
    '(window:keydown.r)': 'turnTrap()',
  },
  styleUrl: './game-board.component.scss',
  templateUrl: './game-board.component.html',
})
export class GameBoard {
  readonly game = input.required<GameState>();
  readonly table = input.required<TableState>();
  readonly interactive = input(false);
  readonly names = input<PlayerNames>(['Player 1', 'Player 2']);
  // The viewer's seat online; null in hotseat, where both players share the screen.
  readonly viewer = input<PlayerIndex | null>(null);
  readonly clock = input<ShotClock | null>(null);
  readonly remoteAim = input<Aim | null>(null);
  readonly remoteShot = input<RemoteShot | null>(null);
  readonly announcement = input<ShotAnnouncement | null>(null);
  readonly shot = output<Shot>();
  readonly aim = output<Aim>();
  readonly cueMove = output<Vec2>();
  readonly cuePlace = output<Vec2>();
  readonly trapPlace = output<TrapRequest>();
  readonly restart = output();

  protected readonly power = signal(0);
  // Resets after every shot, as players expect from 8 Ball Pool.
  protected readonly spin = signal<Spin>({ x: 0, y: 0 });
  protected readonly placingTrap = signal<TrapKind | null>(null);
  // Index into the fixed directions; kept between traps so the last angle sticks.
  protected readonly wallRotation = signal(0);
  protected readonly magnetGroup = signal<BallGroup>('solids');
  protected readonly placingDirection = computed(() => {
    const kind = this.placingTrap();

    return kind !== null && needsDirection(kind)
      ? (WALL_DIRECTIONS[this.wallRotation()] ?? null)
      : null;
  });
  protected readonly placingGroup = computed(() => {
    const kind = this.placingTrap();

    return kind !== null && needsGroup(kind) ? this.magnetGroup() : null;
  });
  // R or the pouch button turns walls and fans, and swaps the group a magnet pulls.
  protected readonly canTurn = computed(() => {
    const kind = this.placingTrap();

    return kind !== null && (needsDirection(kind) || needsGroup(kind));
  });
  protected readonly turnLabel = computed(() => {
    const kind = this.placingTrap();

    return kind !== null && needsGroup(kind) ? 'Swap group' : 'Turn';
  });
  protected readonly legalTargets = computed(() => legalTargetIds(this.game()));
  protected readonly ballInHand = computed(() => this.interactive() && this.game().ballInHand);
  // The viewer's pouch online; in hotseat the pouch of whoever is on turn.
  protected readonly trapsLeft = computed(() => {
    const game = this.game();

    return game.players[this.viewer() ?? game.currentPlayer].trapsLeft;
  });
  protected readonly canPlaceTrap = computed(
    () => this.interactive() && !this.game().trapPlaced && this.trapsLeft() > 0,
  );
  // The chute fills as balls drop during the shot, not only once the result is in. Balls that
  // went down this shot follow the settled list in the order they fell, which is also the order
  // the rules will record, so nothing reshuffles when the shot resolves.
  protected readonly trayBalls = computed(() => [
    ...this.game().pocketedBalls,
    ...this.liveDrops(),
  ]);
  protected readonly result = computed(() => {
    const game = this.game();

    if (game.phase !== 'finished' || game.winner === null) {
      return null;
    }

    const viewer = this.viewer();
    const names = this.names();
    const loser = names[game.winner === 0 ? 1 : 0];

    return {
      winnerName: names[game.winner],
      celebrate: viewer === null || viewer === game.winner,
      detail:
        game.lastOutcome === 'eight-ball-loss'
          ? `${loser} sank the 8 too early.`
          : 'The 8 went down clean.',
    };
  });

  private readonly audio = inject(AudioService);
  private readonly liveDrops = signal<readonly BallId[]>([]);

  constructor() {
    effect(() => {
      const table = this.table();
      const settled = this.game().pocketedBalls;

      untracked(() => {
        const still = this.liveDrops().filter(
          (id) =>
            !settled.includes(id) && table.balls.some((ball) => ball.id === id && ball.pocketed),
        );
        const fresh = table.balls
          .filter(
            (ball) =>
              ball.pocketed &&
              ball.id !== CUE_BALL_ID &&
              !settled.includes(ball.id) &&
              !still.includes(ball.id),
          )
          .map((ball) => ball.id);
        const next = [...still, ...fresh];

        if (
          next.length !== this.liveDrops().length ||
          next.some((id, i) => id !== this.liveDrops()[i])
        ) {
          this.liveDrops.set(next);
        }
      });
    });

    effect(() => {
      const canPlace = this.canPlaceTrap();

      untracked(() => {
        if (!canPlace) {
          this.placingTrap.set(null);
        }
      });
    });

    effect(() => {
      const announcement = this.announcement();

      untracked(() => {
        if (announcement !== null) {
          const celebrate = this.result()?.celebrate ?? false;

          this.audio.shotOutcome(announcement.outcome, celebrate);
        }
      });
    });
  }

  protected onShot(shot: Shot): void {
    this.spin.set({ x: 0, y: 0 });
    this.shot.emit(shot);
  }

  protected onTrapPlace(request: TrapRequest): void {
    this.placingTrap.set(null);
    this.trapPlace.emit(request);
  }

  protected turnTrap(): void {
    const kind = this.placingTrap();

    if (kind !== null && needsDirection(kind)) {
      this.wallRotation.update((rotation) => (rotation + 1) % WALL_DIRECTIONS.length);
    } else if (kind !== null && needsGroup(kind)) {
      this.magnetGroup.update((group) => (group === 'solids' ? 'stripes' : 'solids'));
    }
  }
}
