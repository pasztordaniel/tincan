import { TestBed } from '@angular/core/testing';
import { InlineConfirm } from './inline-confirm';

async function render(takeFocus = true) {
  const fixture = TestBed.createComponent(InlineConfirm);
  fixture.componentRef.setInput('question', 'Leave and cut the line?');
  fixture.componentRef.setInput('detail', 'It ends for both of you.');
  fixture.componentRef.setInput('confirmLabel', 'Leave');
  fixture.componentRef.setInput('cancelLabel', 'Stay');
  fixture.componentRef.setInput('takeFocus', takeFocus);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  return { fixture, root, button };
}

describe('InlineConfirm', () => {
  afterEach(() => document.body.replaceChildren());

  it('is a group named by the question and described by the detail', async () => {
    const { root } = await render();
    const group = root.querySelector('[role="group"]')!;
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Leave and cut the line?',
    );
    expect(root.querySelector(`#${group.getAttribute('aria-describedby')}`)?.textContent).toBe(
      'It ends for both of you.',
    );
  });

  it('puts focus on the safe choice', async () => {
    const { button } = await render();
    expect(document.activeElement).toBe(button('Stay'));
  });

  it('leaves focus alone when told not to take it', async () => {
    const { button } = await render(false);
    expect(document.activeElement).not.toBe(button('Stay'));
  });

  it('emits confirmed and cancelled from its two buttons', async () => {
    const { fixture, button } = await render();
    const seen: string[] = [];
    fixture.componentInstance.confirmed.subscribe(() => seen.push('confirmed'));
    fixture.componentInstance.cancelled.subscribe(() => seen.push('cancelled'));
    button('Stay').click();
    button('Leave').click();
    expect(seen).toEqual(['cancelled', 'confirmed']);
    expect(button('Leave').className).toContain('btn--danger');
  });
});
