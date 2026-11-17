import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from './theme/theme-toggle';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle],
  template: '<app-theme-toggle /><router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
