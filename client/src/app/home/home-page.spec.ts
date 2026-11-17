import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SenderSession, type StartOutcome } from '../sender/sender-session';
import { HomePage } from './home-page';

const LINK = 'http://localhost/r/AAAAAAAAAAAAAAAAAAAAAA#kkkk';

function setup(outcome: StartOutcome = { ok: true }) {
  const link = signal<string | null>(null);
  const session = {
    link,
    starting: signal(false),
    start: vi.fn(() => {
      if (outcome.ok) link.set(LINK);
      return Promise.resolve(outcome);
    }),
    end: vi.fn(() => link.set(null)),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 's', children: [] }]),
      { provide: SenderSession, useValue: session },
    ],
  });
  const fixture = TestBed.createComponent(HomePage);
  return { fixture, session, root: fixture.nativeElement as HTMLElement };
}

describe('HomePage', () => {
  it('renders the app name from @tincan/shared and one primary action', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('tincan');
    expect(root.querySelector('main button')?.textContent?.trim()).toBe('New thread');
  });

  it('creates a session and opens the dialog with the real link and a Join action', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    expect(root.querySelector('app-link-card')).toBeNull();

    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    expect(session.start).toHaveBeenCalledOnce();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('input')?.value).toBe(LINK);
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/s');
  });

  it('shows why no thread was made and opens no dialog when creating fails', async () => {
    const { fixture, root } = setup({ ok: false, error: 'busy' });
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('busy');
  });

  it('drops the session on "Not now" but keeps it when joining', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    const dialog = root.querySelector('dialog')!;
    // jsdom lacks close(): fire the event a real browser dispatches.
    dialog.close = () => dialog.dispatchEvent(new Event('close'));

    dialog
      .querySelector<HTMLAnchorElement>('a')!
      .addEventListener('click', (e) => e.preventDefault());
    dialog.querySelector<HTMLAnchorElement>('a')!.click();
    dialog.dispatchEvent(new Event('close'));
    expect(session.end).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    const ghost = root.querySelector<HTMLButtonElement>(
      'dialog button.btn--ghost, dialog .thread__actions button',
    )!;
    ghost.click();
    expect(session.end).toHaveBeenCalledOnce();
  });
});
