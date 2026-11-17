import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type BannerTone, WarningBanner } from './warning-banner';

@Component({
  imports: [WarningBanner],
  template: `<app-warning-banner [tone]="tone()" heading="Heads up">Body text</app-warning-banner>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly tone = signal<BannerTone>('warning');
}

describe('WarningBanner', () => {
  it('announces warnings as alerts and info as status, with heading and projected text', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(root.textContent).toContain('Heads up');
    expect(root.textContent).toContain('Body text');

    fixture.componentInstance.tone.set('info');
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('[role="status"]')).not.toBeNull();
  });
});
