import { TestBed } from '@angular/core/testing';
import { CutLine } from './cut-line';

async function render() {
  const fixture = TestBed.createComponent(CutLine);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const cuts: number[] = [];
  fixture.componentInstance.confirmed.subscribe(() => cuts.push(1));
  const button = (name: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  return { fixture, root, cuts, button };
}

describe('CutLine', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows only the trigger at first and never emits on the first tap', async () => {
    const { fixture, root, cuts, button } = await render();
    expect(root.querySelectorAll('button')).toHaveLength(1);
    button('Cut the line')!.click();
    await fixture.whenStable();
    expect(cuts).toHaveLength(0);
    expect(root.querySelector('[role="group"]')).not.toBeNull();
    expect(button('Cut it')).toBeDefined();
    expect(button('Keep talking')).toBeDefined();
  });

  it('labels the group with the question and moves focus to the safe choice', async () => {
    const { fixture, root, button } = await render();
    button('Cut the line')!.click();
    await fixture.whenStable();
    const group = root.querySelector('[role="group"]')!;
    const label = root.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    expect(label?.textContent).toBe('Cut the line?');
    expect(root.querySelector(`#${group.getAttribute('aria-describedby')}`)).not.toBeNull();
    expect(document.activeElement).toBe(button('Keep talking'));
  });

  it('emits once on "Cut it"', async () => {
    const { fixture, cuts, button } = await render();
    button('Cut the line')!.click();
    await fixture.whenStable();
    button('Cut it')!.click();
    expect(cuts).toHaveLength(1);
  });

  it('"Keep talking" backs out and returns focus to the trigger', async () => {
    const { fixture, root, cuts, button } = await render();
    button('Cut the line')!.click();
    await fixture.whenStable();
    button('Keep talking')!.click();
    await fixture.whenStable();
    expect(cuts).toHaveLength(0);
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button('Cut the line'));
  });

  it('Escape backs out too', async () => {
    const { fixture, root, cuts, button } = await render();
    button('Cut the line')!.click();
    await fixture.whenStable();
    button('Keep talking')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();
    expect(cuts).toHaveLength(0);
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button('Cut the line'));
  });
});
