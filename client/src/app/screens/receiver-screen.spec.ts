import { TestBed } from '@angular/core/testing';
import { ReceiverScreen } from './receiver-screen';

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ReceiverScreen);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('ReceiverScreen', () => {
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
});
