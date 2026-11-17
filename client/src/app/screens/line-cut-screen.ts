import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  viewChild,
} from '@angular/core';
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
      <app-illo-line-cut class="hero hero--screen" [width]="280" />
      <div class="screen__body">
        <h2 #title tabindex="-1" [id]="uid + '-heading'">{{ heading() }}</h2>
        <p class="screen__lede">{{ message() }}</p>
      </div>
      <a appButton="secondary" routerLink="/">Start a new thread</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineCutScreen {
  /** Per-instance id prefix: several screens can share a page (see /design). */
  protected readonly uid = 'cut-' + nextId++;

  /** Move focus to the heading on show (the user just pressed "Cut the line", which is now gone). */
  readonly takeFocus = input(false);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    afterNextRender(() => {
      if (this.takeFocus()) this.title().nativeElement.focus();
    });
  }

  /** Defaults are the design's copy; views pass a reason-specific message (ended, invalid link). */
  readonly heading = input('Line cut');
  readonly message = input(
    'The other can hung up or the thread ended. Nothing more will be delivered on this line.',
  );
}
