import {
  Component,
  inject,
  runInInjectionContext,
  signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Navigation } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LeaveConfirm, confirmLeave } from './leave-confirm';

@Component({ template: '' })
class Page {}

/** A page that reports `open` through `watch()`, as the sender and receiver pages do. */
function watchingPage(open: WritableSignal<boolean>) {
  const fixture = TestBed.createComponent(Page);
  runInInjectionContext(fixture.componentRef.injector, () =>
    TestBed.inject(LeaveConfirm).watch(open),
  );
  return fixture;
}

describe('LeaveConfirm', () => {
  it('knows a line is open while a watching page lives', () => {
    const leave = TestBed.inject(LeaveConfirm);
    const open = signal(true);
    const page = watchingPage(open);
    expect(leave.lineOpen()).toBe(true);
    open.set(false);
    expect(leave.lineOpen()).toBe(false);
    open.set(true);
    page.destroy();
    expect(leave.lineOpen()).toBe(false);
  });

  it('resolves the question with the answer; a newer question supersedes the old one', async () => {
    const leave = TestBed.inject(LeaveConfirm);
    const first = leave.ask();
    expect(leave.asking()).toBe(true);
    const second = leave.ask();
    await expect(first).resolves.toBe(false);
    expect(leave.asking()).toBe(true);
    leave.answer(true);
    await expect(second).resolves.toBe(true);
    expect(leave.asking()).toBe(false);
  });

  it('withdraws the question when the line ends on its own', async () => {
    const leave = TestBed.inject(LeaveConfirm);
    const open = signal(true);
    watchingPage(open);
    const answer = leave.ask();
    open.set(false);
    TestBed.tick();
    await expect(answer).resolves.toBe(false);
    expect(leave.asking()).toBe(false);
  });
});

describe('confirmLeave', () => {
  function runGuard(trigger: Navigation['trigger']) {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({ trigger } as Navigation);
    return TestBed.runInInjectionContext(() => confirmLeave(null, null!, null!, null!));
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('lets the navigation through when no line is open', () => {
    expect(runGuard('imperative')).toBe(true);
    expect(TestBed.inject(LeaveConfirm).asking()).toBe(false);
  });

  it('holds an in-app navigation away from an open line until the answer', async () => {
    watchingPage(signal(true));
    const result = runGuard('imperative');
    expect(result).toBeInstanceOf(Promise);
    expect(TestBed.inject(LeaveConfirm).asking()).toBe(true);
    TestBed.inject(LeaveConfirm).answer(false);
    await expect(result).resolves.toBe(false);
  });

  it('does not hold browser Back or Forward', () => {
    watchingPage(signal(true));
    expect(runGuard('popstate')).toBe(true);
    expect(TestBed.inject(LeaveConfirm).asking()).toBe(false);
  });
});

@Component({ template: 'live' })
class LivePage {
  constructor() {
    inject(LeaveConfirm).watch(signal(true));
  }
}

describe('confirmLeave through the router', () => {
  async function onLivePage() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'live', component: LivePage, canDeactivate: [confirmLeave] },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create('/live');
    return { router: TestBed.inject(Router), leave: TestBed.inject(LeaveConfirm), harness };
  }

  /** Lets the router run its guards (the held navigation never settles, so no `whenStable`). */
  async function until(condition: () => boolean) {
    for (let i = 0; i < 50 && !condition(); i++) {
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
    }
    expect(condition()).toBe(true);
  }

  it('withdraws the question when a newer navigation supersedes the held one', async () => {
    const { router, leave } = await onLivePage();
    const held = router.navigateByUrl('/');
    await until(() => leave.asking());
    const newer = router.navigateByUrl('/live#x');
    await until(() => !leave.asking());
    await expect(held).resolves.toBe(false);
    await expect(newer).resolves.toBe(true);
    expect(router.url).toBe('/live#x');
    // Leave now has nothing to answer and does not navigate.
    leave.answer(true);
    await until(() => router.currentNavigation() === null);
    expect(router.url).toBe('/live#x');
  });

  it('a later question is not withdrawn by the cancel of the earlier one', async () => {
    const { router, leave } = await onLivePage();
    const first = router.navigateByUrl('/');
    await until(() => leave.asking());
    const second = router.navigateByUrl('/?again=1');
    await expect(first).resolves.toBe(false);
    await until(() => leave.asking());
    leave.answer(true);
    await expect(second).resolves.toBe(true);
    expect(router.url).toBe('/?again=1');
  });
});
