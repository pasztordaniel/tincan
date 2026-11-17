import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { HomeLink } from './nav/home-link';
import { LeaveConfirm } from './nav/leave-confirm';
import { ThemeToggle } from './theme/theme-toggle';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle, HomeLink],
  template: `
    @if (awayFromHome()) {
      <app-home-link
        [confirming]="leave.asking()"
        (leave)="leave.answer(true)"
        (stay)="leave.answer(false)"
      />
    }
    <app-theme-toggle />
    <router-outlet />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);
  protected readonly leave = inject(LeaveConfirm);

  /** Every page but home itself gets the home control; hidden until the first navigation lands. */
  protected readonly awayFromHome = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => Object.keys(this.router.parseUrl(this.router.url).root.children).length > 0),
    ),
    { initialValue: false },
  );
}
