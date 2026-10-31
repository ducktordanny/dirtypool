import { Component, computed, input } from '@angular/core';
import type { GameState } from '@dirtypool/contracts';
import { describeGame } from '../../utils/outcome-message.util';

@Component({
  selector: 'dp-scoreboard',
  styleUrl: './scoreboard.component.scss',
  templateUrl: './scoreboard.component.html',
})
export class Scoreboard {
  readonly game = input.required<GameState>();

  protected readonly message = computed(() => describeGame(this.game()));
  protected readonly players = computed(() =>
    this.game().players.map((player, index) => ({
      label: `Player ${index + 1}`,
      score: player.score,
      active: this.game().phase === 'aiming' && this.game().currentPlayer === index,
      winner: this.game().winner === index,
    })),
  );
}
