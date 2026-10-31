import { InjectionToken } from '@angular/core';

// The slice of WebSocket the room service needs, so tests can substitute a fake.
export interface RoomSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

export type RoomSocketFactory = (url: string) => RoomSocket;

export const ROOM_SOCKET_FACTORY = new InjectionToken<RoomSocketFactory>('ROOM_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url) => new WebSocket(url),
});
