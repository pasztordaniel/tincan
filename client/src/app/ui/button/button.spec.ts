import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonDirective, type ButtonVariant } from './button';

@Component({
  imports: [ButtonDirective],
  template: `<button type="button" [appButton]="variant()" [block]="block()">Go</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly variant = signal<ButtonVariant | ''>('');
  readonly block = signal(false);
}

describe('ButtonDirective', () => {
  it('defaults to the primary variant and switches classes with its inputs', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect([...button.classList]).toEqual(['btn', 'btn--primary']);

    fixture.componentInstance.variant.set('secondary');
    fixture.componentInstance.block.set(true);
    await fixture.whenStable();
    expect([...button.classList].sort()).toEqual(['btn', 'btn--block', 'btn--secondary']);
  });
});
