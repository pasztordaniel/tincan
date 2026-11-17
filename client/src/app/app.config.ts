import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
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
