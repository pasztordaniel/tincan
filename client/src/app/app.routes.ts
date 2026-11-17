import type { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { clearFragment, type FragmentHistory, type FragmentLocation } from './crypto/key';
import { HomePage } from './home/home-page';
import { hasSenderSession, SenderPage } from './sender/sender-page';

/**
 * Every path under `/r`, not just `r/:id`: a mangled link (`/r`, `/r/<id>/x`) must still reach the
 * receiver page, which clears the fragment and says the link is invalid. Otherwise the `**` redirect
 * would carry the key over to the home page and leave it in the address bar. `id` is set only for
 * exactly `/r/<one segment>`.
 */
export function receiverMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments[0]?.path !== 'r') return null;
  const id = segments.length === 2 ? segments[1] : undefined;
  return { consumed: segments, posParams: id ? { id } : {} };
}

/**
 * Runs once at bootstrap, before the first navigation. A link mangled outside `/r` (`/R/<id>`,
 * `/rr/<id>`, `/r%2F<id>`, a bare `/#<key>`) would otherwise reach the `**` redirect or another page
 * with the key still in the address bar and the session-history entry. Only literal `/r` paths keep the
 * fragment: the receiver page reads and clears it itself. Nothing in the app puts a fragment anywhere
 * else, so dropping it loses nothing. `anyPath` is for a fragment that arrives after the page loaded:
 * the receiver page reads the fragment only on load, so even on `/r` nobody would consume it.
 */
export function dropStrayFragment(
  location: FragmentLocation,
  history: FragmentHistory,
  { anyPath = false } = {},
): void {
  if (location.hash === '' || (!anyPath && /^\/r(\/|$)/.test(location.pathname))) return;
  clearFragment(location, history);
}

export const routes: Routes = [
  { path: '', component: HomePage, title: 'tincan' },
  { path: 's', component: SenderPage, canActivate: [hasSenderSession], title: 'tincan: your can' },
  {
    // Design preview with mocked state; lazy so it never weighs on the real screens.
    path: 'design',
    loadComponent: () => import('./design/design-page').then((m) => m.DesignPage),
    title: 'tincan design preview',
  },
  {
    matcher: receiverMatcher,
    loadComponent: () => import('./receiver/receiver-page').then((m) => m.ReceiverPage),
    title: 'tincan',
  },
  { path: '**', redirectTo: '' },
];
