import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LineCutScreen } from './line-cut-screen';

describe('LineCutScreen', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('uses the design copy by default and takes a heading and message', async () => {
    const fixture = TestBed.createComponent(LineCutScreen);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent).toBe('Line cut');
    fixture.componentRef.setInput('heading', 'Invalid link');
    fixture.componentRef.setInput('message', '<b>x</b>');
    await fixture.whenStable();
    expect(root.querySelector('h2')?.textContent).toBe('Invalid link');
    expect(root.querySelector('.screen__lede')?.textContent).toBe('<b>x</b>');
  });
});
