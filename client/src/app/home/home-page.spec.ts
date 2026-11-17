import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SenderSession, type StartOutcome } from '../sender/sender-session';
import { HomePage } from './home-page';

const LINK = 'http://localhost/r/AAAAAAAAAAAAAAAAAAAAAA#kkkk';

function setup(outcome: StartOutcome = { ok: true }) {
  const link = signal<string | null>(null);
  const active = signal(false);
  const session = {
    link,
    active,
    starting: signal(false),
    start: vi.fn(() => {
      if (outcome.ok) {
        link.set(LINK);
        active.set(true);
      }
      return Promise.resolve(outcome);
    }),
    end: vi.fn(() => {
      link.set(null);
      active.set(false);
    }),
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

  async function openDialog(root: HTMLElement, fixture: { whenStable(): Promise<unknown> }) {
    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    const dialog = root.querySelector('dialog')!;
    // jsdom lacks close(): fire the event a real browser dispatches.
    dialog.close = () => dialog.dispatchEvent(new Event('close'));
    return dialog;
  }

  it('keeps owning the session after a modified Join click (new tab), so "Not now" still ends it', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    const dialog = await openDialog(root, fixture);
    const join = dialog.querySelector<HTMLAnchorElement>('a')!;
    join.addEventListener('click', (e) => e.preventDefault());
    join.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    dialog.close();
    expect(session.end).toHaveBeenCalledOnce();
  });

  it('ends a session it still owns when the page goes away', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    await openDialog(root, fixture);
    fixture.destroy();
    expect(session.end).toHaveBeenCalled();
  });

  it('does not end a session handed to the sender view when the page goes away', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    const dialog = await openDialog(root, fixture);
    const join = dialog.querySelector<HTMLAnchorElement>('a')!;
    join.addEventListener('click', (e) => e.preventDefault());
    join.click();
    fixture.destroy();
    expect(session.end).not.toHaveBeenCalled();
  });

  it('closes the dialog and says so when the session ends while it is open', async () => {
    const { fixture, root, session } = setup();
    await fixture.whenStable();
    const dialog = await openDialog(root, fixture);
    session.active.set(false);
    session.link.set(null);
    await fixture.whenStable();
    expect(root.querySelector('dialog app-link-card')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('ended');
    expect(dialog.querySelector('.thread')).toBeNull();
  });

  it('shows nothing for a cancelled start', async () => {
    const { fixture, root } = setup({ ok: false, error: 'cancelled' });
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });
});
