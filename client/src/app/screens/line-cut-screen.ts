import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IlloLineCut } from '../illustrations';
import { ButtonDirective } from '../ui/button/button';

let nextId = 0;

/** Screen 6: the peer left or the session ended; nothing more will be delivered. */
@Component({
  selector: 'app-line-cut-screen',
  imports: [IlloLineCut, ButtonDirective, RouterLink],
  template: `
    <section class="screen" [attr.aria-labelledby]="uid + '-heading'">
      <app-illo-line-cut [width]="280" />
      <div class="screen__body">
        <h2 [id]="uid + '-heading'">Line cut</h2>
        <p class="screen__lede">
          The other can hung up or the thread ended. Nothing more will be delivered on this line.
        </p>
      </div>
      <a appButton="secondary" routerLink="/">Start a new thread</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineCutScreen {
  /** Per-instance id prefix: several screens can share a page (see /design). */
  protected readonly uid = 'cut-' + nextId++;
}
