import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { openRoomsResponseSchema, type OpenRoom } from '@dirtypool/contracts';
import { Observable, catchError, map, of, startWith, switchMap, timer } from 'rxjs';
import { apiUrl } from '../config/api.const';

const REFRESH_MS = 4000;

// Lists rooms with a free seat and keeps the list fresh while someone is looking at it.
@Injectable({ providedIn: 'root' })
export class RoomDirectoryService {
  private readonly http = inject(HttpClient);

  watchOpenRooms(): Observable<readonly OpenRoom[]> {
    // The first request goes out synchronously; later ones every REFRESH_MS.
    return timer(REFRESH_MS, REFRESH_MS).pipe(
      startWith(0),
      switchMap(() => this.fetchOpenRooms()),
    );
  }

  private fetchOpenRooms(): Observable<readonly OpenRoom[]> {
    return this.http.get<unknown>(apiUrl('/api/rooms')).pipe(
      map((body) => openRoomsResponseSchema.parse(body).rooms),
      // A missing server just means an empty list; the create and join buttons still explain.
      catchError(() => of([])),
    );
  }
}
