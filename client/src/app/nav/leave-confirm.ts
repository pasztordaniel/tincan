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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
  type CanDeactivateFn,
} from '@angular/router';

/**
 * Leaving a page that holds an open line ends that line (the sender page ends its session on destroy,
 * the receiver's session is page-scoped). So an in-app navigation away from an open line first asks
 * "Leave and cut the line?", shown by the home control in the app shell (T19).
 *
 * Pages report whether their line is open with `watch()`; `confirmLeave` (a `canDeactivate` guard on
 * those routes) holds the navigation until the user answers. Nothing here touches the session: the
 * page's own teardown does the leave, exactly once, when the navigation goes through.
 *
 * The question belongs to one navigation. If that navigation finishes without the answer (a newer
 * one superseded it, for example a hash change or Back while the question is up), the question is
 * withdrawn, so it never stays on screen with nothing behind it.
 */
@Injectable({ providedIn: 'root' })
export class LeaveConfirm {
  private readonly lines = signal<readonly Signal<boolean>[]>([]);
  private readonly _asking = signal(false);
  private pending: ((leave: boolean) => void) | null = null;
  /** Id of the navigation the open question holds, if the guard knew it. */
  private pendingNavigation: number | null = null;

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
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        const finished =
          event instanceof NavigationCancel ||
          event instanceof NavigationError ||
          event instanceof NavigationSkipped ||
          event instanceof NavigationEnd;
        if (finished && this.pending && event.id === this.pendingNavigation) this.answer(false);
      });
  }

  /**
   * Registers a page's "my line is open" signal for as long as the calling page lives. Uses
   * `inject(DestroyRef)`, so call it from the page's injection context (its constructor or a field
   * initializer).
   */
  watch(open: Signal<boolean>): void {
    this.lines.update((all) => [...all, open]);
    inject(DestroyRef).onDestroy(() => this.lines.update((all) => all.filter((o) => o !== open)));
  }

  /**
   * Opens the question for the navigation `navigationId` (if known); resolves `true` for Leave,
   * `false` for Stay. A newer ask supersedes.
   */
  ask(navigationId: number | null = null): Promise<boolean> {
    this.pending?.(false);
    this.pendingNavigation = navigationId;
    this._asking.set(true);
    return new Promise((resolve) => (this.pending = resolve));
  }

  answer(leave: boolean): void {
    const pending = this.pending;
    this.pending = null;
    this.pendingNavigation = null;
    this._asking.set(false);
    pending?.(leave);
  }
}

/**
 * `canDeactivate` for the sender and receiver routes. Browser Back/Forward (`popstate`) is not held:
 * the URL has already changed by then and undoing it would fight the history stack, so those keep
 * the pre-T19 behaviour of ending the line, like closing the tab does.
 *
 * While the question is up the held navigation is still running, so `ApplicationRef` stays unstable
 * (pending task) until the answer; tests cannot use `whenStable()` across it.
 */
export const confirmLeave: CanDeactivateFn<unknown> = () => {
  const leave = inject(LeaveConfirm);
  if (!leave.lineOpen()) return true;
  const navigation = inject(Router).currentNavigation();
  if (navigation?.trigger === 'popstate') return true;
  return leave.ask(navigation?.id ?? null);
};
