import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./components/home-page/home-page.component').then(({ HomePage }) => HomePage),
  },
  {
    path: 'hotseat',
    loadComponent: () =>
      import('./components/hotseat-game/hotseat-game.component').then(
        ({ HotseatGame }) => HotseatGame,
      ),
  },
  {
    path: 'room/:code',
    loadComponent: () =>
      import('./components/online-game/online-game.component').then(({ OnlineGame }) => OnlineGame),
  },
  { path: '**', redirectTo: '' },
];
