import { Component, inject } from '@angular/core';
import type { Shot } from '@dirtypool/contracts';
import { GameService } from '../../services/game.service';
import { PoolTable } from '../pool-table/pool-table.component';
import { Scoreboard } from '../scoreboard/scoreboard.component';
import { Button } from '../ui';

@Component({
  imports: [Button, PoolTable, Scoreboard],
  selector: 'dp-hotseat-game',
  styleUrl: './hotseat-game.component.scss',
  templateUrl: './hotseat-game.component.html',
})
export class HotseatGame {
  protected readonly game = inject(GameService);

  protected shoot(shot: Shot): void {
    this.game.shoot(shot);
  }

  protected newGame(): void {
    this.game.newGame();
  }
}
