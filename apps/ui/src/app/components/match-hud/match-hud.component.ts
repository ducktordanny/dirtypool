import { Component, computed, input } from '@angular/core';
import type { BallId, GameState, PlayerIndex } from '@dirtypool/contracts';
import { groupBalls } from '@dirtypool/game';
import { describeGame, describeTurn } from '../../utils/outcome-message.util';
import { BallIcon } from '../ui';

interface BallSlot {
  readonly id: BallId | null;
  readonly pocketed: boolean;
}

interface PlayerPanel {
  readonly index: PlayerIndex;
  readonly name: string;
  readonly initials: string;
  readonly slots: readonly BallSlot[];
  readonly active: boolean;
  readonly winner: boolean;
}

const GROUP_SIZE = 7;

@Component({
  imports: [BallIcon],
  selector: 'dp-match-hud',
  styleUrl: './match-hud.component.scss',
  templateUrl: './match-hud.component.html',
})
export class MatchHud {
  readonly game = input.required<GameState>();

  protected readonly message = computed(() => describeGame(this.game()));
  protected readonly turn = computed(() => describeTurn(this.game()));
  protected readonly players = computed<readonly PlayerPanel[]>(() => {
    const game = this.game();

    return game.players.map((player, index) => ({
      index: index as PlayerIndex,
      name: `Player ${index + 1}`,
      initials: `P${index + 1}`,
      slots:
        player.group === null
          ? Array.from({ length: GROUP_SIZE }, () => ({ id: null, pocketed: false }))
          : groupBalls(player.group).map((id) => ({
              id,
              pocketed: game.table.balls.some((ball) => ball.id === id && ball.pocketed),
            })),
      active: game.phase === 'aiming' && game.currentPlayer === index,
      winner: game.winner === index,
    }));
  });
}
