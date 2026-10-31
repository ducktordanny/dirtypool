import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PLAYER_NAME_MAX_LENGTH } from '@dirtypool/contracts';
import { NicknameService } from '../../services/nickname.service';
import { RoomService } from '../../services/room.service';
import { Button } from '../ui';

const CODE_LENGTH = 4;

@Component({
  imports: [Button],
  selector: 'dp-home-page',
  styleUrl: './home-page.component.scss',
  templateUrl: './home-page.component.html',
})
export class HomePage {
  protected readonly nickname = inject(NicknameService);
  protected readonly nameMaxLength = PLAYER_NAME_MAX_LENGTH;
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canCreate = computed(() => !this.busy() && this.nickname.valid());
  protected readonly canJoin = computed(
    () => this.canCreate() && this.code().length === CODE_LENGTH,
  );

  private readonly room = inject(RoomService);
  private readonly router = inject(Router);

  protected onNameInput(event: Event): void {
    this.nickname.set((event.target as HTMLInputElement).value.slice(0, PLAYER_NAME_MAX_LENGTH));
  }

  protected onCodeInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.code.set(
      value
        .toUpperCase()
        .replace(/[^A-Z]/gu, '')
        .slice(0, CODE_LENGTH),
    );
  }

  protected create(): void {
    if (this.canCreate()) {
      void this.enter(() => this.room.createRoom(this.nickname.name().trim()));
    }
  }

  protected join(event: Event): void {
    event.preventDefault();

    if (this.canJoin()) {
      void this.enter(() => this.room.joinRoom(this.code(), this.nickname.name().trim()));
    }
  }

  protected hotseat(): void {
    void this.router.navigate(['/hotseat']);
  }

  private async enter(request: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);

    try {
      const code = await request();

      await this.router.navigate(['/room', code]);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      this.busy.set(false);
    }
  }
}
