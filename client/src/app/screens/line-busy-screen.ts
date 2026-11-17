import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IlloLineBusy } from '../illustrations';

let nextId = 0;

/** Screen 5: the receiving can is already taken; this link cannot be opened again. */
@Component({
  selector: 'app-line-busy-screen',
  imports: [IlloLineBusy],
  template: `
    <section class="screen" [attr.aria-labelledby]="uid + '-heading'">
      <app-illo-line-busy [width]="280" />
      <div class="screen__body">
        <h2 [id]="uid + '-heading'">This line is busy</h2>
        <p class="screen__lede">
          Someone else already holds the receiving can, so this link cannot be opened again. If that
          was not you, tell the sender: they should start a new thread.
        </p>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineBusyScreen {
  /** Per-instance id prefix: several screens can share a page (see /design). */
  protected readonly uid = 'busy-' + nextId++;
}
