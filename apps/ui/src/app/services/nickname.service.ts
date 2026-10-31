import { Injectable, computed, signal } from '@angular/core';
import { playerNameSchema } from '@dirtypool/contracts';

const STORAGE_KEY = 'dirtypool.nickname';

// The player's chosen name, remembered in this browser.
@Injectable({ providedIn: 'root' })
export class NicknameService {
  readonly name = computed(() => this.nameState());
  readonly valid = computed(() => playerNameSchema.safeParse(this.nameState()).success);

  private readonly nameState = signal(readStoredName());

  set(name: string): void {
    this.nameState.set(name);

    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // Private mode or blocked storage: the name still works for this session.
    }
  }
}

function readStoredName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
