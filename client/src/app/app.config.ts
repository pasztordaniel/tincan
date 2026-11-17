import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ThemeService } from './theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Apply a stored theme during bootstrap, before the first component renders. The page shows the
    // system theme only until main.js runs; an inline script would beat that but the CSP forbids it.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
  ],
};
