import { Component, inject, signal } from '@angular/core';
import type { Shot } from '@dirtypool/contracts';
import { GameService } from '../../services/game.service';
import { BallTray } from '../ball-tray/ball-tray.component';
import { MatchHud } from '../match-hud/match-hud.component';
import { PoolTable } from '../pool-table/pool-table.component';
import { Button, PowerSlider } from '../ui';

@Component({
  imports: [BallTray, Button, MatchHud, PoolTable, PowerSlider],
  selector: 'dp-hotseat-game',
  styleUrl: './hotseat-game.component.scss',
  templateUrl: './hotseat-game.component.html',
})
export class HotseatGame {
  protected readonly game = inject(GameService);
  protected readonly power = signal(0);

  protected shoot(shot: Shot): void {
    this.game.shoot(shot);
  }

  protected newGame(): void {
    this.game.newGame();
  }
}
