import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { PLAYER_NAME_MAX_LENGTH, type Shot } from '@dirtypool/contracts';
import { HeaderActions } from '../../directives/header-actions.directive';
import { NicknameService } from '../../services/nickname.service';
import { RoomService } from '../../services/room.service';
import { GameBoard } from '../game-board/game-board.component';
import type { PlayerNames } from '../match-hud/match-hud.component';
import { BoardNotice, Button } from '../ui';

const COPIED_FOR_MS = 1500;
// Server errors show on the table for a moment, then get out of the way.
const ERROR_FOR_MS = 4000;

@Component({
  imports: [BoardNotice, Button, GameBoard, HeaderActions],
  selector: 'dp-online-game',
  styleUrl: './online-game.component.scss',
  templateUrl: './online-game.component.html',
})
export class OnlineGame {
  // Route parameter: opening /room/CODE joins that room, so the link itself is the invite.
  readonly code = input.required<string>();

  protected readonly room = inject(RoomService);
  protected readonly nickname = inject(NicknameService);
  protected readonly nameMaxLength = PLAYER_NAME_MAX_LENGTH;
  protected readonly joinError = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly toast = signal<string | null>(null);
  // A guest arriving by link may not have picked a name yet; ask before joining.
  protected readonly needsName = computed(
    () => this.room.code() !== this.code() && !this.nickname.valid(),
  );
  protected readonly names = computed<PlayerNames>(() => {
    const [first, second] = this.room.roster();

    return [first?.name ?? 'Waiting…', second?.name ?? 'Waiting…'];
  });
  protected readonly reconnecting = computed(() => this.room.connection() === 'reconnecting');
  // The opponent's socket dropped; their seat is held while they come back.
  protected readonly opponentAway = computed(() => this.room.opponentSeat()?.connected === false);
  protected readonly opponentName = computed(() => this.room.opponentName());
  // The opponent's seat emptied after play began: the game is paused until someone takes it.
  protected readonly opponentLeft = computed(() => {
    const game = this.room.game();

    return (
      game !== null &&
      this.opponentName() === null &&
      this.room.lastOpponentName() !== null &&
      game.lastOutcome !== null
    );
  });
  private readonly router = inject(Router);
  private readonly joinedWith = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Joins on arrival when a nickname is already known. The nickname is read untracked so
    // typing one into the form does not join on the first keystroke; the form's Join does.
    effect(() => {
      const code = this.code();

      untracked(() => {
        if (this.nickname.valid() && this.joinedWith() !== code) {
          this.join(code);
        }
      });
    });

    effect(() => {
      const error = this.room.error();

      untracked(() => {
        this.toast.set(error);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toast.set(null), ERROR_FOR_MS);
      });
    });
  }

  protected onNameInput(event: Event): void {
    this.nickname.set((event.target as HTMLInputElement).value.slice(0, PLAYER_NAME_MAX_LENGTH));
  }

  protected submitName(event: Event): void {
    event.preventDefault();

    if (this.nickname.valid()) {
      this.join(this.code());
    }
  }

  protected shoot(shot: Shot): void {
    this.room.shoot(shot);
  }

  protected copyLink(): void {
    void navigator.clipboard.writeText(location.href).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), COPIED_FOR_MS);
    });
  }

  protected leave(): void {
    this.room.leave();
    void this.router.navigate(['/']);
  }

  private join(code: string): void {
    this.joinedWith.set(code);
    this.joinError.set(null);
    this.room
      .joinRoom(code, this.nickname.name().trim())
      .catch((error: unknown) =>
        this.joinError.set(error instanceof Error ? error.message : 'Could not join'),
      );
  }
}
