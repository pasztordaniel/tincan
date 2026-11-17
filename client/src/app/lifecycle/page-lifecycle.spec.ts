import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RelayService } from '../relay/relay.service';
import { SenderSession } from '../sender/sender-session';
import { PageLifecycle } from './page-lifecycle';

function setup(status = 'connected') {
  const win = new EventTarget();
  const relay = { status: vi.fn(() => status), leave: vi.fn() };
  const sender = { end: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: DOCUMENT, useValue: { defaultView: win } },
      { provide: RelayService, useValue: relay },
      { provide: SenderSession, useValue: sender },
    ],
  });
  const lifecycle = TestBed.inject(PageLifecycle);
  lifecycle.init();
  return { win, relay, sender, lifecycle };
}

function pageEvent(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  return Object.assign(new Event(type), { persisted });
}

describe('PageLifecycle', () => {
  it('leaves the relay and ends the sender on pagehide', () => {
    const { win, relay, sender } = setup();
    win.dispatchEvent(pageEvent('pagehide', false));
    expect(sender.end).toHaveBeenCalledOnce();
    expect(relay.leave).toHaveBeenCalledOnce();
  });

  it('also leaves when the page goes into bfcache (persisted pagehide)', () => {
    const { win, relay } = setup();
    win.dispatchEvent(pageEvent('pagehide', true));
    expect(relay.leave).toHaveBeenCalledOnce();
  });

  it('does not leave twice when the relay already ended', () => {
    const { win, relay, sender } = setup('ended');
    win.dispatchEvent(pageEvent('pagehide', false));
    expect(relay.leave).not.toHaveBeenCalled();
    expect(sender.end).toHaveBeenCalledOnce();
  });

  it('ignores tab switches and unload warnings', () => {
    const { win, relay, sender } = setup();
    win.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('beforeunload'));
    win.dispatchEvent(new Event('blur'));
    expect(relay.leave).not.toHaveBeenCalled();
    expect(sender.end).not.toHaveBeenCalled();
  });

  it('ends a page restored from bfcache, but not a plain pageshow', () => {
    const { win, relay } = setup();
    win.dispatchEvent(pageEvent('pageshow', false));
    expect(relay.leave).not.toHaveBeenCalled();
    win.dispatchEvent(pageEvent('pageshow', true));
    expect(relay.leave).toHaveBeenCalledOnce();
  });

  it('registers its listeners once', () => {
    const { win, relay, lifecycle } = setup();
    lifecycle.init();
    win.dispatchEvent(pageEvent('pagehide', false));
    expect(relay.leave).toHaveBeenCalledOnce();
  });

  it('runs registered hide handlers until they unregister', () => {
    const { win, lifecycle } = setup();
    const handler = vi.fn();
    const off = lifecycle.onHide(handler);
    win.dispatchEvent(pageEvent('pagehide', false));
    expect(handler).toHaveBeenCalledOnce();
    off();
    win.dispatchEvent(pageEvent('pageshow', true));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('still ends the sender and leaves when a hide handler throws', () => {
    const { win, relay, sender, lifecycle } = setup();
    lifecycle.onHide(() => {
      throw new Error('boom');
    });
    sender.end.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => win.dispatchEvent(pageEvent('pagehide', false))).not.toThrow();
    expect(sender.end).toHaveBeenCalledOnce();
    expect(relay.leave).toHaveBeenCalledOnce();
  });

  it('is a no-op without a window', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { defaultView: null } },
        { provide: RelayService, useValue: { status: () => 'connected', leave: vi.fn() } },
        { provide: SenderSession, useValue: { end: vi.fn() } },
      ],
    });
    expect(() => TestBed.inject(PageLifecycle).init()).not.toThrow();
  });
});
