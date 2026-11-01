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
  GameState,
  PlayerIndex,
  Shot,
  Spin,
  TableState,
  TrapKind,
  Vec2,
} from '@dirtypool/contracts';
import { WALL_DIRECTIONS } from '@dirtypool/game';
import { AudioService } from '../../services/audio.service';
import { legalTargetIds } from '../../utils/legal-targets.util';
import type { RemoteShot } from '../../types/remote-shot.type';
import type { ShotAnnouncement } from '../../types/shot-announcement.type';
import type { ShotClock } from '../../types/shot-clock.type';
import type { TrapDrop } from '../../types/trap-drop.type';
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
    '(window:keydown.r)': 'rotateWall()',
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
  readonly trapPlace = output<TrapDrop>();
  readonly restart = output();

  protected readonly power = signal(0);
  // Resets after every shot, as players expect from 8 Ball Pool.
  protected readonly spin = signal<Spin>({ x: 0, y: 0 });
  protected readonly placingTrap = signal<TrapKind | null>(null);
  // Index into the fixed wall directions; kept between walls so the last angle sticks.
  protected readonly wallRotation = signal(0);
  protected readonly placingDirection = computed(() =>
    this.placingTrap() === 'wall' ? (WALL_DIRECTIONS[this.wallRotation()] ?? null) : null,
  );
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

  constructor() {
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

  protected onTrapPlace(drop: TrapDrop): void {
    this.placingTrap.set(null);
    this.trapPlace.emit(drop);
  }

  protected rotateWall(): void {
    if (this.placingTrap() === 'wall') {
      this.wallRotation.update((rotation) => (rotation + 1) % WALL_DIRECTIONS.length);
    }
  }
}
