import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DesignPage } from './design-page';

describe('DesignPage', () => {
  it('shows every screen and state from the brief', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DesignPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-sender-screen').length).toBe(6);
    expect(root.querySelectorAll('app-receiver-screen').length).toBe(7);
    expect(root.querySelector('app-line-busy-screen')).not.toBeNull();
    expect(root.querySelector('app-line-cut-screen')).not.toBeNull();
    expect(root.textContent).toContain('Pick up');
    expect(root.textContent).toContain('Last update 20 s ago.');
    expect(root.textContent).toContain('Something tampered with the line.');
  });

  it('keeps element ids unique although screens repeat', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DesignPage);
    await fixture.whenStable();
    const ids = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[id]')].map(
      (e) => e.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
