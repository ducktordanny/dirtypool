import { Component, computed, input, output, signal } from '@angular/core';
import type { Aim, GameState, PlayerIndex, Shot, TableState, Vec2 } from '@dirtypool/contracts';
import { legalTargetIds } from '../../utils/legal-targets.util';
import type { ShotAnnouncement } from '../../types/shot-announcement.type';
import type { ShotClock } from '../../types/shot-clock.type';
import { BallTray } from '../ball-tray/ball-tray.component';
import { MatchHud, type PlayerNames } from '../match-hud/match-hud.component';
import { PoolTable } from '../pool-table/pool-table.component';
import { MatchResult, OutcomeBanner, PowerSlider } from '../ui';

// HUD, power bar, table and tray laid out together; used by both hotseat and online play.
@Component({
  imports: [BallTray, MatchHud, MatchResult, OutcomeBanner, PoolTable, PowerSlider],
  selector: 'dp-game-board',
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
  readonly announcement = input<ShotAnnouncement | null>(null);
  readonly shot = output<Shot>();
  readonly aim = output<Aim>();
  readonly cueMove = output<Vec2>();
  readonly cuePlace = output<Vec2>();
  readonly restart = output();

  protected readonly power = signal(0);
  protected readonly legalTargets = computed(() => legalTargetIds(this.game()));
  protected readonly ballInHand = computed(() => this.interactive() && this.game().ballInHand);
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
}
