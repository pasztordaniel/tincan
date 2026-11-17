import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { Frame, PeerState } from '@tincan/shared';
import { Subject } from 'rxjs';
import { generateSessionKey } from '../crypto/key';
import { randomSessionId } from '../crypto/test-helpers';
import {
  RelayService,
  type ConnectionStatus,
  type JoinOutcome,
  type ProtocolError,
  type RelayEndReason,
} from '../relay/relay.service';
import { ReceiverPage } from './receiver-page';

class FakeRelay {
  readonly status = signal<ConnectionStatus>('connected');
  readonly peer = signal<PeerState | null>('connected');
  readonly ended = signal<RelayEndReason | null>(null);
  readonly frames$ = new Subject<Frame>();
  readonly protocolErrors$ = new Subject<ProtocolError>();
  join = vi.fn((_id: string): Promise<JoinOutcome> => Promise.resolve({ ok: true }));
  leave = vi.fn();
}

async function mount(id: string, hash: string | null) {
  history.replaceState(null, '', '/r/' + id + (hash === null ? '' : '#' + hash));
  const relay = new FakeRelay();
  TestBed.configureTestingModule({
    providers: [
      { provide: RelayService, useValue: relay },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
    ],
  });
  const fixture = TestBed.createComponent(ReceiverPage);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return { fixture, relay, root: fixture.nativeElement as HTMLElement };
}

async function newKeyString(): Promise<string> {
  const generated = await generateSessionKey();
  if (!generated.ok) throw new Error('key');
  return generated.value.keyString;
}

describe('ReceiverPage', () => {
  afterEach(() => {
    history.replaceState(null, '', '/');
    document.body.replaceChildren();
  });

  it('shows the Open step first, joins only on click, then shows the line', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    expect(root.querySelector('h1')?.textContent).toBe('tincan');
    expect(root.textContent).toContain('Someone is on the line');
    expect(relay.join).not.toHaveBeenCalled();
    expect(location.hash).toBe('');

    root.querySelector('button')!.click();
    await fixture.whenStable();
    expect(relay.join).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Their can');
    expect(root.textContent).toContain('Connected');
  });

  it('shows the busy line when the receiver slot is taken', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    relay.join.mockResolvedValue({ ok: false, error: 'full' });
    root.querySelector('button')!.click();
    await fixture.whenStable();
    expect(root.textContent).toContain('This line is busy');
  });

  it('explains a failed Open and keeps the button', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    relay.join.mockResolvedValue({ ok: false, error: 'offline' });
    root.querySelector('button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not pick up');
    expect(root.querySelector('button')).not.toBeNull();
  });

  it('says the link was used when the key is gone (reload)', async () => {
    const { relay, root } = await mount(randomSessionId(), null);
    expect(root.textContent).toContain('Link already used');
    expect(root.textContent).toContain('ended');
    expect(root.querySelector('button')).toBeNull();
    expect(relay.join).not.toHaveBeenCalled();
  });

  it('shows an invalid link for a bad id or key', async () => {
    const { root } = await mount('nope', await newKeyString());
    expect(root.textContent).toContain('Invalid link');
    TestBed.resetTestingModule();
    const second = await mount(randomSessionId(), 'broken');
    expect(second.root.textContent).toContain('Invalid link');
  });

  it('shows the line cut with a reason when the thread does not exist', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    relay.join.mockResolvedValue({ ok: false, error: 'not_found' });
    root.querySelector('button')!.click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Nothing on this line');
  });

  it('cuts the line on purpose: asks first, leaves, wipes the key, keeps the text, says so', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    root.querySelector('button')!.click();
    await fixture.whenStable();
    const named = (name: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    expect(root.querySelector('app-cut-line')).not.toBeNull();
    named('Cut the line').click();
    await fixture.whenStable();
    named('Cut it').click();
    expect(relay.leave).toHaveBeenCalledOnce();
    // The real relay sets these in leave(); the fake does it by hand.
    relay.status.set('ended');
    relay.ended.set('left');
    await fixture.whenStable();
    expect(root.textContent).toContain('You cut the line');
    expect(root.querySelector('app-cut-line')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h2'));
    expect(relay.frames$.observed).toBe(false);
  });

  it('shows "You cut the line" on the plain ended screen when nothing was received', async () => {
    const { fixture, relay, root } = await mount(randomSessionId(), await newKeyString());
    root.querySelector('button')!.click();
    await fixture.whenStable();
    relay.status.set('ended');
    relay.ended.set('left');
    await fixture.whenStable();
    expect(root.querySelector('h2')?.textContent).toBe('You cut the line');
    expect(document.activeElement).toBe(root.querySelector('h2'));
  });
});
