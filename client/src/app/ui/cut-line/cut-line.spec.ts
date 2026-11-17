import { TestBed } from '@angular/core/testing';
import { LeaveConfirm } from '../../nav/leave-confirm';
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

  it('Escape on the document right after arming, before focus has moved, backs out', async () => {
    const { fixture, root, cuts, button } = await render();
    button('Cut the line')!.click();
    // No whenStable: the keypress lands in the same frame as the click.
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(cuts).toHaveLength(0);
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button('Cut the line'));
  });

  it('Escape works with focus elsewhere, and is left alone when not confirming', async () => {
    const { fixture, root, button } = await render();
    const other = document.createElement('textarea');
    document.body.appendChild(other);
    const idle = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    other.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    button('Cut the line')!.click();
    await fixture.whenStable();
    other.focus();
    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelector('[role="group"]')).toBeNull();
  });

  it('closes when "Leave and cut the line?" opens, so only one question is up', async () => {
    const { fixture, root, button } = await render();
    button('Cut the line')!.click();
    await fixture.whenStable();
    const leave = TestBed.inject(LeaveConfirm);
    const answer = leave.ask();
    await fixture.whenStable();
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(button('Cut the line')).toBeDefined();
    leave.answer(false);
    await expect(answer).resolves.toBe(false);
  });

  it('opening it withdraws "Leave and cut the line?" (the held navigation stays put)', async () => {
    const { fixture, root, button } = await render();
    const leave = TestBed.inject(LeaveConfirm);
    const answer = leave.ask();
    button('Cut the line')!.click();
    await expect(answer).resolves.toBe(false);
    expect(leave.asking()).toBe(false);
    await fixture.whenStable();
    expect(root.querySelector('[role="group"]')).not.toBeNull();
  });
});
