import type { Routes } from '@angular/router';
import { HomePage } from './home/home-page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'tincan' },
  {
    // Design preview with mocked state; lazy so it never weighs on the real screens.
    path: 'design',
    loadComponent: () => import('./design/design-page').then((m) => m.DesignPage),
    title: 'tincan design preview',
  },
  { path: '**', redirectTo: '' },
];
