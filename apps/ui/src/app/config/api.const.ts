import { isDevMode } from '@angular/core';

// In development the UI dev server and the API run on different ports; in production the API
// serves the UI, so the socket lives on the same host.
const DEV_API_PORT = 3001;

export function roomSocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = isDevMode() ? `${location.hostname}:${DEV_API_PORT}` : location.host;

  return `${protocol}://${host}/ws`;
}
