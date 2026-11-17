import type { Routes } from '@angular/router';
import { HomePage } from './home/home-page';
import { hasSenderSession, SenderPage } from './sender/sender-page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'tincan' },
  { path: 's', component: SenderPage, canActivate: [hasSenderSession], title: 'tincan: your can' },
  {
    // Design preview with mocked state; lazy so it never weighs on the real screens.
    path: 'design',
    loadComponent: () => import('./design/design-page').then((m) => m.DesignPage),
    title: 'tincan design preview',
  },
  { path: '**', redirectTo: '' },
];
