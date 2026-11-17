import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { filter } from 'rxjs';
import { dropStrayFragment, routes } from './app.routes';
import { PageLifecycle } from './lifecycle/page-lifecycle';
import { ThemeService } from './theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Before the router's first navigation: a key in a mangled link must not survive a redirect.
    provideAppInitializer(() => {
      dropStrayFragment(window.location, window.history);
    }),
    provideRouter(routes),
    // A link pasted over the current URL that differs only in the fragment does not reload the page:
    // the router navigates in place and writes the fragment back, and no page reads the key. Drop it
    // once that navigation ends, on every path.
    provideAppInitializer(() => {
      inject(Router)
        .events.pipe(filter((e) => e instanceof NavigationEnd && e.id > 1))
        .subscribe(() => {
          dropStrayFragment(window.location, window.history, { anyPath: true });
        });
    }),
    // Apply a stored theme during bootstrap, before the first component renders. The page shows the
    // system theme only until main.js runs; an inline script would beat that but the CSP forbids it.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // A reload or close ends the session at once (ADR 0004).
    provideAppInitializer(() => {
      inject(PageLifecycle).init();
    }),
  ],
};
