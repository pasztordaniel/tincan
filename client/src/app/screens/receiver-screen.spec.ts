import { TestBed } from '@angular/core/testing';
import { ReceiverScreen } from './receiver-screen';

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ReceiverScreen);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('ReceiverScreen', () => {
  afterEach(() => document.body.replaceChildren());

  it('starts at the Pick up step without showing any text', async () => {
    const { fixture, root } = await render({ text: 'secret' });
    expect(root.textContent).not.toContain('secret');
    let picked = 0;
    fixture.componentInstance.pickUp.subscribe(() => picked++);
    root.querySelector('button')!.click();
    expect(picked).toBe(1);
  });

  it('renders live text as plain text in a polite live region', async () => {
    const { root } = await render({ phase: 'live', text: '<b>hi</b>' });
    const live = root.querySelector('[aria-live="polite"]')!;
    expect(live.querySelector('.reader__text')?.textContent).toBe('<b>hi</b>');
    expect(live.querySelector('b')).toBeNull();
  });

  it('marks stale text with a "last update" hint', async () => {
    const { root } = await render({
      phase: 'live',
      text: 'x',
      stale: true,
      lastUpdate: '20 s ago',
    });
    expect(root.querySelector('.reader--stale')).not.toBeNull();
    expect(root.textContent).toContain('Last update 20 s ago.');
  });

  it('surfaces integrity failures as an alert with the frayed-string illustration', async () => {
    const { root } = await render({ phase: 'live', text: 'x', integrityError: true });
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Something tampered with the line.',
    );
    expect(root.querySelector('app-illo-line-frayed')).not.toBeNull();
  });

  it('switches the illustration with the line state', async () => {
    const { fixture, root } = await render({ phase: 'live', state: 'reconnecting' });
    expect(root.querySelector('app-illo-line-slack')).not.toBeNull();
    fixture.componentRef.setInput('state', 'ended');
    await fixture.whenStable();
    expect(root.querySelector('app-illo-line-cut')).not.toBeNull();
    expect(root.textContent).toContain('Nothing more will arrive.');
  });

  it('shows a typing hint, but not while stale', async () => {
    const { fixture, root } = await render({ phase: 'live', text: 'x', typing: true });
    expect(root.textContent).toContain('They are typing...');
    fixture.componentRef.setInput('stale', true);
    await fixture.whenStable();
    expect(root.textContent).not.toContain('They are typing...');
  });

  describe('cut the line', () => {
    const named = (root: HTMLElement, name: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

    it('is not offered at the gate', async () => {
      const { root } = await render({ phase: 'pickup' });
      expect(root.querySelector('app-cut-line')).toBeNull();
    });

    it.each(['connected', 'waiting', 'reconnecting'])('is offered while %s', async (state) => {
      const { root } = await render({ phase: 'live', state, text: 'x' });
      expect(named(root, 'Cut the line')).toBeDefined();
    });

    it('is gone once the line has ended', async () => {
      const { root } = await render({ phase: 'live', state: 'ended', text: 'x' });
      expect(root.querySelector('app-cut-line')).toBeNull();
    });

    it('confirms first, then emits; "Keep talking" backs out', async () => {
      const { fixture, root } = await render({ phase: 'live', text: 'x' });
      let cut = 0;
      fixture.componentInstance.cutLine.subscribe(() => cut++);
      named(root, 'Cut the line')!.click();
      await fixture.whenStable();
      expect(cut).toBe(0);
      named(root, 'Keep talking')!.click();
      await fixture.whenStable();
      named(root, 'Cut the line')!.click();
      await fixture.whenStable();
      expect(cut).toBe(0);
      named(root, 'Cut it')!.click();
      expect(cut).toBe(1);
    });

    it('moves focus to the ended banner after the user cuts', async () => {
      const { fixture, root } = await render({ phase: 'live', text: 'x' });
      fixture.componentRef.setInput('state', 'ended');
      fixture.componentRef.setInput('cutByYou', true);
      await fixture.whenStable();
      expect(document.activeElement).toBe(root.querySelector('app-warning-banner'));
    });

    it('says who cut the line and keeps the last text', async () => {
      const { fixture, root } = await render({ phase: 'live', state: 'ended', text: 'last' });
      expect(root.textContent).toContain('The line is cut');
      fixture.componentRef.setInput('cutByYou', true);
      await fixture.whenStable();
      expect(root.textContent).toContain('You cut the line');
      expect(root.querySelector('.reader__text')?.textContent).toBe('last');
    });
  });
});
