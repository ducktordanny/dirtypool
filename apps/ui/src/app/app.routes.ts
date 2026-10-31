import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./components/hotseat-game/hotseat-game.component').then(
        ({ HotseatGame }) => HotseatGame,
      ),
  },
  { path: '**', redirectTo: '' },
];
