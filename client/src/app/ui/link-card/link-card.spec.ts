import { TestBed } from '@angular/core/testing';
import { COPIED_FEEDBACK_MS, LinkCard } from './link-card';

const LINK = 'https://tincan.example/r/abc#k=demo';

function setClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

async function render() {
  const fixture = TestBed.createComponent(LinkCard);
  fixture.componentRef.setInput('link', LINK);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    button: root.querySelector('button')!,
    status: root.querySelector('[role="status"]')!,
  };
}

describe('LinkCard', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the link read-only with the trust reminder', async () => {
    setClipboard(() => Promise.resolve());
    const { root } = await render();
    const input = root.querySelector('input')!;
    expect(input.value).toBe(LINK);
    expect(input.readOnly).toBe(true);
    expect(root.querySelector('label')?.getAttribute('for')).toBe(input.id);
    expect(root.textContent).toContain('Anyone with this link can read along.');
  });

  it('copies the link, confirms with "Copied", then resets', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard(writeText);
    const { fixture, button, status } = await render();
    // Fake timers only after the first render: whenStable() itself waits on real timers.
    vi.useFakeTimers();

    await fixture.componentInstance.copy();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(status.textContent?.trim()).toBe('Copied');
    expect(button.getAttribute('aria-label')).toBe('Link copied');

    vi.advanceTimersByTime(COPIED_FEEDBACK_MS);
    fixture.detectChanges();
    expect(status.textContent?.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Copy link');
  });

  it('falls back to selecting the link when the clipboard is unavailable', async () => {
    setClipboard(() => Promise.reject(new Error('denied')));
    const { fixture, status } = await render();

    await fixture.componentInstance.copy();
    await fixture.whenStable();
    expect(status.textContent).toContain('Could not copy');
  });
});
