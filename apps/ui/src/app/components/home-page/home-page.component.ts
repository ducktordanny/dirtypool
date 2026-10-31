import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PLAYER_NAME_MAX_LENGTH, type OpenRoom } from '@dirtypool/contracts';
import { NicknameService } from '../../services/nickname.service';
import { RoomDirectoryService } from '../../services/room-directory.service';
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
  protected readonly privateRoom = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canCreate = computed(() => !this.busy() && this.nickname.valid());
  protected readonly canJoin = computed(
    () => this.canCreate() && this.code().length === CODE_LENGTH,
  );
  // Polled while this page is open; the subscription ends with the component.
  protected readonly openRooms = toSignal(inject(RoomDirectoryService).watchOpenRooms(), {
    initialValue: [] as readonly OpenRoom[],
  });

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

  protected onPrivateToggle(event: Event): void {
    this.privateRoom.set((event.target as HTMLInputElement).checked);
  }

  protected create(): void {
    if (this.canCreate()) {
      void this.enter(() => this.room.createRoom(this.nickname.name().trim(), this.privateRoom()));
    }
  }

  protected join(event: Event): void {
    event.preventDefault();

    if (this.canJoin()) {
      void this.enter(() => this.room.joinRoom(this.code(), this.nickname.name().trim()));
    }
  }

  protected joinListed(room: OpenRoom): void {
    if (this.canCreate()) {
      void this.enter(() => this.room.joinRoom(room.code, this.nickname.name().trim()));
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
