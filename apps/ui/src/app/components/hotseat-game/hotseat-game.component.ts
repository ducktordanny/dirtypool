import { Component, inject } from '@angular/core';
import type { Shot } from '@dirtypool/contracts';
import { HeaderActions } from '../../directives/header-actions.directive';
import { GameService } from '../../services/game.service';
import { GameBoard } from '../game-board/game-board.component';
import { Button } from '../ui';

@Component({
  imports: [Button, GameBoard, HeaderActions],
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
