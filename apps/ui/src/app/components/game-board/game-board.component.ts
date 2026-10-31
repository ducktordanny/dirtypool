import { Component, input, output, signal } from '@angular/core';
import type { GameState, Shot, TableState } from '@dirtypool/contracts';
import type { ShotClock } from '../../types/shot-clock.type';
import { BallTray } from '../ball-tray/ball-tray.component';
import { MatchHud, type PlayerNames } from '../match-hud/match-hud.component';
import { PoolTable } from '../pool-table/pool-table.component';
import { PowerSlider } from '../ui';

// HUD, power bar, table and tray laid out together; used by both hotseat and online play.
@Component({
  imports: [BallTray, MatchHud, PoolTable, PowerSlider],
  selector: 'dp-game-board',
  styleUrl: './game-board.component.scss',
  templateUrl: './game-board.component.html',
})
export class GameBoard {
  readonly game = input.required<GameState>();
  readonly table = input.required<TableState>();
  readonly interactive = input(false);
  readonly names = input<PlayerNames>(['Player 1', 'Player 2']);
  readonly clock = input<ShotClock | null>(null);
  readonly shot = output<Shot>();

  protected readonly power = signal(0);
}
