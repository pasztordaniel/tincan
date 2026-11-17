import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { SenderSession } from './sender/sender-session';

function fakeSession(state: string) {
  return {
    state: signal(state),
    text: signal(''),
    link: signal<string | null>(null),
    active: signal(true),
    idleSecondsLeft: signal(60),
    starting: signal(false),
    edit: vi.fn(),
    keepOpen: vi.fn(),
    cutByYou: signal(false),
    cutLine: vi.fn(),
    end: vi.fn(),
  };
}

async function boot(url: string, state = 'connected') {
  const session = fakeSession(state);
  TestBed.configureTestingModule({
    imports: [App],
    providers: [provideRouter(routes), { provide: SenderSession, useValue: session }],
  });
  const fixture = TestBed.createComponent(App);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  await fixture.whenStable();
  return { fixture, router, session, root: fixture.nativeElement as HTMLElement };
}

const homeLink = (root: HTMLElement) =>
  root.querySelector<HTMLAnchorElement>('app-home-link a[aria-label="tincan home"]');
const question = (root: HTMLElement) => root.querySelector('app-home-link [role="group"]');
const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('app-home-link button')].find(
    (b) => b.textContent?.trim() === name,
  )!;

/**
 * Waits until `done()` holds, ticking the app between macrotasks. A navigation held by the guard counts
 * as pending work, so `whenStable()` would wait for the answer; this waits for what the test needs.
 */
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  }
  expect(done()).toBe(true);
}

/** The question is up and has taken focus. */
const asked = (root: HTMLElement) => () =>
  question(root) !== null && document.activeElement === button(root, 'Stay');
/** No navigation in flight and the question gone. */
const settled = (router: Router, root: HTMLElement) => () =>
  router.currentNavigation() === null && question(root) === null;

describe('App', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows no home control on home itself', async () => {
    const { root } = await boot('/');
    expect(homeLink(root)).toBeNull();
    expect(root.querySelector('app-theme-toggle')).not.toBeNull();
  });

  it.each(['/design', '/s', '/r/AAAAAAAAAAAAAAAAAAAAAA'])(
    'shows the home control on %s, as a real link to /',
    async (url) => {
      const { root } = await boot(url);
      const link = homeLink(root);
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('/');
    },
  );

  describe('leaving the sender page', () => {
    it.each(['waiting', 'connected', 'idle', 'reconnecting'])(
      'while %s asks first and does not navigate or end anything',
      async (state) => {
        const { router, session, root } = await boot('/s', state);
        homeLink(root)!.click();
        await until(asked(root));
        expect(question(root)?.textContent).toContain('Leave and cut the line?');
        expect(document.activeElement).toBe(button(root, 'Stay'));
        expect(router.url).toBe('/s');
        expect(session.end).not.toHaveBeenCalled();
      },
    );

    it('Stay keeps the line and puts focus back on the link', async () => {
      const { router, session, root } = await boot('/s');
      homeLink(root)!.click();
      await until(asked(root));
      button(root, 'Stay').click();
      await until(() => settled(router, root)() && document.activeElement === homeLink(root));
      expect(question(root)).toBeNull();
      expect(router.url).toBe('/s');
      expect(session.end).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(homeLink(root));
    });

    it('Escape backs out the same way', async () => {
      const { router, session, root } = await boot('/s');
      homeLink(root)!.click();
      await until(asked(root));
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      await until(() => settled(router, root)() && document.activeElement === homeLink(root));
      expect(question(root)).toBeNull();
      expect(router.url).toBe('/s');
      expect(session.end).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(homeLink(root));
    });

    it('Leave goes home and ends the session exactly once', async () => {
      const { router, session, root } = await boot('/s');
      homeLink(root)!.click();
      await until(asked(root));
      button(root, 'Leave').click();
      await until(() => settled(router, root)() && router.url === '/');
      expect(router.url).toBe('/');
      expect(session.end).toHaveBeenCalledOnce();
      expect(homeLink(root)).toBeNull();
    });

    it('goes straight home once the line has ended', async () => {
      const { router, session, root } = await boot('/s', 'ended');
      homeLink(root)!.click();
      await until(settled(router, root));
      expect(router.url).toBe('/');
      expect(session.end).toHaveBeenCalledOnce();
    });

    it('withdraws the question if the line ends while it is up', async () => {
      const { router, session, root } = await boot('/s');
      homeLink(root)!.click();
      await until(asked(root));
      session.state.set('ended');
      await until(settled(router, root));
      expect(router.url).toBe('/s');
      // Focus was on "Stay"; it goes to the link instead of dropping to <body>.
      await until(() => document.activeElement === homeLink(root));
    });

    it('keeps only one question open: asking to leave closes "Cut the line?"', async () => {
      const { router, root } = await boot('/s');
      const cutTrigger = [...root.querySelectorAll<HTMLButtonElement>('app-cut-line button')].find(
        (b) => b.textContent?.trim() === 'Cut the line',
      )!;
      cutTrigger.click();
      await until(() => root.querySelector('app-cut-line [role="group"]') !== null);
      homeLink(root)!.click();
      await until(asked(root));
      expect(root.querySelector('app-cut-line [role="group"]')).toBeNull();
      button(root, 'Stay').click();
      await until(settled(router, root));
    });
  });
});
