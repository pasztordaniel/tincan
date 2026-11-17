import { TestBed } from '@angular/core/testing';
import { SenderScreen } from './sender-screen';

async function render(state: string, text = '') {
  const fixture = TestBed.createComponent(SenderScreen);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('text', text);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('SenderScreen', () => {
  it('shows an editable writing area with the ready-to-type caret while waiting', async () => {
    const { root } = await render('waiting');
    const area = root.querySelector('textarea')!;
    expect(area.readOnly).toBe(false);
    expect(root.querySelector('.writer__caret')).not.toBeNull();
    expect(root.textContent).toContain('Waiting for the other can...');
  });

  it('updates the text model as the user types', async () => {
    const { fixture, root } = await render('connected');
    const area = root.querySelector('textarea')!;
    area.value = 'hello';
    area.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.text()).toBe('hello');
  });

  it('turns read-only after the line is cut and says nothing will be sent', async () => {
    const { root } = await render('ended', 'last words');
    const area = root.querySelector('textarea')!;
    expect(area.readOnly).toBe(true);
    expect(area.value).toBe('last words');
    expect(root.querySelector('.writer__caret')).toBeNull();
    expect(root.textContent).toContain('Nothing you type now will be sent.');
    const describedBy = area.getAttribute('aria-describedby')!;
    expect(root.querySelector(`#${describedBy}`)?.textContent).toContain('Nothing you type');
  });

  it('warns an idle sender with a quiet countdown and a keep-open button', async () => {
    const { fixture, root } = await render('idle', 'draft');
    fixture.componentRef.setInput('idleSecondsLeft', 59);
    await fixture.whenStable();
    expect(root.querySelector('app-illo-line-snip')).not.toBeNull();
    expect(root.textContent).toContain('Idle: the string will be cut soon');
    const timer = root.querySelector('[role="timer"]')!;
    expect(timer.textContent).toBe('0:59');
    // Not an alert: the ticking text must not be announced every second.
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('textarea')!.readOnly).toBe(false);
    let kept = 0;
    fixture.componentInstance.keepOpen.subscribe(() => kept++);
    const button = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Keep the line open'),
    )!;
    button.click();
    expect(kept).toBe(1);
  });
});
