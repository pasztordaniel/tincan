import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  IlloHome,
  IlloLineBusy,
  IlloLineCut,
  IlloLineFrayed,
  IlloLineSlack,
  IlloLineSnip,
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
  IlloLineSnip,
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
    '%o draws the loop only while the line is live',
    async (component) => {
      const strings = async (live: boolean) => {
        const fixture = TestBed.createComponent(component as Type<unknown>);
        fixture.componentRef.setInput('live', live);
        await fixture.whenStable();
        return (fixture.nativeElement as HTMLElement).querySelector('.string')!.getAttribute('d');
      };
      const looped = await strings(true);
      const plain = await strings(false);
      expect(looped).not.toBe(plain);
      // The loop is the only place the path doubles back with a second pair of curves.
      expect(looped!.match(/C/g)!.length).toBeGreaterThan(plain!.match(/C/g)!.length);
    },
  );
});
