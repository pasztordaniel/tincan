import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type UrlTree } from '@angular/router';
import { hasSenderSession, SenderPage } from './sender-page';
import { QrCode } from '../ui/qr-code/qr-code';
import { SenderSession } from './sender-session';

function fakeSession(state: string, link: string | null = 'http://x/r/id#key') {
  return {
    state: signal(state),
    text: signal(''),
    link: signal(link),
    active: signal(true),
    idleSecondsLeft: signal(60),
    edit: vi.fn(),
    keepOpen: vi.fn(),
    cutByYou: signal(false),
    cutLine: vi.fn(),
    end: vi.fn(),
  };
}

describe('SenderPage', () => {
  async function renderWaiting(session: ReturnType<typeof fakeSession>) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SenderSession, useValue: session }],
    });
    const fixture = TestBed.createComponent(SenderPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('keeps the QR code hidden until asked, and encodes the exact receiver link', async () => {
    const { fixture, root } = await renderWaiting(fakeSession('waiting'));
    expect(root.querySelector('app-qr-panel')).not.toBeNull();
    expect(root.querySelector('app-qr-code')).toBeNull();
    root.querySelector<HTMLButtonElement>('app-qr-panel button')!.click();
    await fixture.whenStable();
    const qr = fixture.debugElement.query((d) => d.componentInstance instanceof QrCode);
    expect((qr.componentInstance as QrCode).payload()).toBe('http://x/r/id#key');
  });

  it.each(['connected', 'idle', 'reconnecting', 'ended'])(
    'hides an open QR code when the line goes %s, and it is closed again if the line is waiting later',
    async (next) => {
      const session = fakeSession('waiting');
      const { fixture, root } = await renderWaiting(session);
      root.querySelector<HTMLButtonElement>('app-qr-panel button')!.click();
      await fixture.whenStable();
      expect(root.querySelector('app-qr-code')).not.toBeNull();
      session.state.set(next);
      await fixture.whenStable();
      expect(root.querySelector('app-qr-panel')).toBeNull();
      expect(root.querySelector('app-qr-code')).toBeNull();
      session.state.set('waiting');
      await fixture.whenStable();
      expect(root.querySelector('app-qr-code')).toBeNull();
    },
  );

  it('hides the QR code when the session is gone (no link)', async () => {
    const session = fakeSession('waiting');
    const { fixture, root } = await renderWaiting(session);
    root.querySelector<HTMLButtonElement>('app-qr-panel button')!.click();
    await fixture.whenStable();
    session.link.set(null);
    await fixture.whenStable();
    expect(root.querySelector('app-qr-code')).toBeNull();
  });

  it('shows the link card while waiting, hides it once connected, and ends the session on leave', async () => {
    const session = fakeSession('waiting');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SenderSession, useValue: session }],
    });
    const fixture = TestBed.createComponent(SenderPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-link-card input')?.getAttribute('value') ?? '').toBe('');
    expect(root.querySelector<HTMLInputElement>('app-link-card input')?.value).toBe(
      'http://x/r/id#key',
    );
    session.state.set('connected');
    await fixture.whenStable();
    expect(root.querySelector('app-link-card')).toBeNull();

    const area = root.querySelector('textarea')!;
    expect(area.maxLength).toBe(10_000);
    area.value = 'hi';
    area.dispatchEvent(new Event('input'));
    expect(session.edit).toHaveBeenCalledWith('hi');

    fixture.destroy();
    expect(session.end).toHaveBeenCalled();
  });

  it('guards the route: without a live session it redirects home', () => {
    const session = fakeSession('waiting');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SenderSession, useValue: session }],
    });
    expect(
      TestBed.runInInjectionContext(() => hasSenderSession(null as never, null as never)),
    ).toBe(true);
    session.active.set(false);
    const result = TestBed.runInInjectionContext(() =>
      hasSenderSession(null as never, null as never),
    ) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/');
  });

  it('asks before cutting, then ends through the session and shows who cut', async () => {
    const session = fakeSession('connected');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SenderSession, useValue: session }],
    });
    const fixture = TestBed.createComponent(SenderPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const named = (name: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    named('Cut the line').click();
    await fixture.whenStable();
    expect(session.cutLine).not.toHaveBeenCalled();
    named('Cut it').click();
    expect(session.cutLine).toHaveBeenCalledOnce();
    session.state.set('ended');
    session.cutByYou.set(true);
    await fixture.whenStable();
    expect(root.textContent).toContain('You cut the line');
    expect(root.querySelector('app-cut-line')).toBeNull();
    expect(root.querySelector('textarea')!.readOnly).toBe(true);
  });
});
