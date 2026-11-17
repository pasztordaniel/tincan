import { ChangeDetectionStrategy, Component } from '@angular/core';
import { APP_NAME } from '@tincan/shared';

/** Placeholder landing page; replaced by the sender view in T08. */
@Component({
  selector: 'app-home-page',
  template: `
    <main>
      <h1>{{ appName }}</h1>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly appName = APP_NAME;
}
