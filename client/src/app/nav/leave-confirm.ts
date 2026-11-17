import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { Router, type CanDeactivateFn } from '@angular/router';

/**
 * Leaving a page that holds an open line ends that line (the sender page ends its session on destroy,
 * the receiver's session is page-scoped). So an in-app navigation away from an open line first asks
 * "Leave and cut the line?", shown by the home control in the app shell (T19).
 *
 * Pages report whether their line is open with `watch()`; `confirmLeave` (a `canDeactivate` guard on
 * those routes) holds the navigation until the user answers. Nothing here touches the session: the
 * page's own teardown does the leave, exactly once, when the navigation goes through.
 */
@Injectable({ providedIn: 'root' })
export class LeaveConfirm {
  private readonly lines = signal<readonly Signal<boolean>[]>([]);
  private readonly _asking = signal(false);
  private pending: ((leave: boolean) => void) | null = null;

  /** Some page on screen holds a line that leaving would cut. */
  readonly lineOpen = computed(() => this.lines().some((open) => open()));
  /** A navigation is waiting for the answer to "Leave and cut the line?". */
  readonly asking = this._asking.asReadonly();

  constructor() {
    // The line ended on its own while the question was up (peer cut, idle, relay gone): there is
    // nothing left to cut, so the question is withdrawn and the user sees the ended state first.
    effect(() => {
      if (!this.lineOpen() && untracked(this._asking)) this.answer(false);
    });
  }

  /** Registers a page's "my line is open" signal for as long as the calling page lives. */
  watch(open: Signal<boolean>): void {
    this.lines.update((all) => [...all, open]);
    inject(DestroyRef).onDestroy(() => this.lines.update((all) => all.filter((o) => o !== open)));
  }

  /** Opens the question; resolves `true` for Leave, `false` for Stay. A newer ask supersedes. */
  ask(): Promise<boolean> {
    this.pending?.(false);
    this._asking.set(true);
    return new Promise((resolve) => (this.pending = resolve));
  }

  answer(leave: boolean): void {
    const pending = this.pending;
    this.pending = null;
    this._asking.set(false);
    pending?.(leave);
  }
}

/**
 * `canDeactivate` for the sender and receiver routes. Browser Back/Forward (`popstate`) is not held:
 * the URL has already changed by then and undoing it would fight the history stack, so those keep
 * the pre-T19 behaviour of ending the line, like closing the tab does.
 */
export const confirmLeave: CanDeactivateFn<unknown> = () => {
  const leave = inject(LeaveConfirm);
  if (!leave.lineOpen()) return true;
  if (inject(Router).currentNavigation()?.trigger === 'popstate') return true;
  return leave.ask();
};
