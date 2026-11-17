import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  IlloHome,
  IlloLineBusy,
  IlloLineCut,
  IlloLineFrayed,
  IlloLineSlack,
  IlloReceiver,
  IlloSender,
} from './index';

const ALL: Type<unknown>[] = [
  IlloHome,
  IlloSender,
  IlloReceiver,
  IlloLineBusy,
  IlloLineCut,
  IlloLineSlack,
  IlloLineFrayed,
];

describe('illustrations', () => {
  it.each(ALL.map((c) => [c.name, c] as const))(
    '%s renders an img-role SVG with a default label',
    async (_name, component) => {
      const fixture = TestBed.createComponent(component);
      await fixture.whenStable();
      const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-label')?.length).toBeGreaterThan(10);
      expect(svg.getAttribute('width')).toBe('320');
    },
  );

  it('takes a custom label and width', async () => {
    const fixture = TestBed.createComponent(IlloLineCut);
    fixture.componentRef.setInput('label', 'The sender hung up');
    fixture.componentRef.setInput('width', 200);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('The sender hung up');
    expect(svg.getAttribute('width')).toBe('200');
  });

  it('gives every state a distinct default label', () => {
    const labels = ALL.map((component) => {
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement)
        .querySelector('svg')!
        .getAttribute('aria-label');
    });
    expect(new Set(labels).size).toBe(ALL.length);
  });

  it.each([IlloSender, IlloReceiver])(
    '%o keeps the loop while the line is open, dim until it goes live',
    async (component) => {
      const string = async (live: boolean) => {
        const fixture = TestBed.createComponent(component as Type<unknown>);
        fixture.componentRef.setInput('live', live);
        await fixture.whenStable();
        const root = fixture.nativeElement as HTMLElement;
        return { el: root.querySelector('.string')!, pulse: root.querySelector('.pulse') };
      };
      const live = await string(true);
      const waiting = await string(false);
      expect(live.el.getAttribute('d')).toBe(waiting.el.getAttribute('d'));
      // The loop doubles back on itself: several curve segments, not one plain arc.
      expect(live.el.getAttribute('d')!.match(/C/g)!.length).toBeGreaterThan(3);
      expect(live.el.classList).toContain('string--live');
      expect(live.pulse).not.toBeNull();
      expect(waiting.el.classList).toContain('string--waiting');
      expect(waiting.pulse).toBeNull();
    },
  );

  it('drops the loop and brings in the scissors when the sender is about to be cut', async () => {
    const fixture = TestBed.createComponent(IlloSender);
    fixture.componentRef.setInput('snip', true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.snip')).not.toBeNull();
    expect(root.querySelector('.string')!.getAttribute('d')!.match(/C/g)!.length).toBe(1);
  });
});
