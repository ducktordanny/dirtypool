import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OpenRoom } from '@dirtypool/contracts';
import { RoomDirectoryService } from './room-directory.service';

describe('RoomDirectoryService', () => {
  let service: RoomDirectoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomDirectoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches and validates the open rooms', () => {
    const received: (readonly OpenRoom[])[] = [];
    const subscription = service.watchOpenRooms().subscribe((rooms) => received.push(rooms));

    http
      .expectOne((request) => request.url.endsWith('/api/rooms'))
      .flush({ rooms: [{ code: 'ABCD', host: 'Dani', inProgress: false }] });

    expect(received).toEqual([[{ code: 'ABCD', host: 'Dani', inProgress: false }]]);
    subscription.unsubscribe();
  });

  it('treats a failing server as an empty list', () => {
    const received: (readonly OpenRoom[])[] = [];
    const subscription = service.watchOpenRooms().subscribe((rooms) => received.push(rooms));

    http
      .expectOne((request) => request.url.endsWith('/api/rooms'))
      .flush('down', { status: 503, statusText: 'Unavailable' });

    expect(received).toEqual([[]]);
    subscription.unsubscribe();
  });
});
