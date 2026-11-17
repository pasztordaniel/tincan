import { TestBed } from '@angular/core/testing';
import qrcode from 'qrcode-generator';
import { QR_QUIET_ZONE, QrCode, qrShape } from './qr-code';

const LINK =
  'https://tincan.example/r/AAAAAAAAAAAAAAAAAAAAAA#BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

/** Reads the dark modules back out of the path (runs of `Mx yhNv1h-Nz`). */
function darkModules(path: string): Set<string> {
  const dark = new Set<string>();
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(m[3]); i++) dark.add(`${Number(m[2])},${Number(m[1]) + i}`);
  }
  return dark;
}

describe('qrShape', () => {
  it('draws exactly the modules of an independent encoding of the payload, with a 4-module quiet zone', () => {
    const qr = qrcode(0, 'M');
    qr.addData(LINK, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const shape = qrShape(LINK);
    expect(shape.size).toBe(n + 2 * QR_QUIET_ZONE);
    const expected = new Set<string>();
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) expected.add(`${r + QR_QUIET_ZONE},${c + QR_QUIET_ZONE}`);
    expect(darkModules(shape.path)).toEqual(expected);
  });

  it('encodes non-ASCII payloads as UTF-8, not as truncated UTF-16 units', () => {
    const text = 'https://tincan.example/r/\u00e9\u20ac\u{1F600}#k';
    // The same text as UTF-8 bytes written out by hand, one Latin-1 character per byte.
    const bytes = 'https://tincan.example/r/\xc3\xa9\xe2\x82\xac\xf0\x9f\x98\x80#k';
    const modules = (data: string): Set<string> => {
      const qr = qrcode(0, 'M');
      qr.addData(data, 'Byte');
      qr.make();
      const out = new Set<string>();
      for (let r = 0; r < qr.getModuleCount(); r++)
        for (let c = 0; c < qr.getModuleCount(); c++)
          if (qr.isDark(r, c)) out.add(`${r + QR_QUIET_ZONE},${c + QR_QUIET_ZONE}`);
      return out;
    };
    expect(darkModules(qrShape(text).path)).toEqual(modules(bytes));
    // A naive addData(text) would keep only the low byte of each UTF-16 unit.
    expect(darkModules(qrShape(text).path)).not.toEqual(modules(text));
  });

  it('encodes different payloads differently', () => {
    expect(qrShape(LINK).path).not.toBe(qrShape(LINK + 'x').path);
  });
});

describe('QrCode', () => {
  it('renders an accessible inline SVG for the exact payload, with no image or network element', async () => {
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('payload', LINK);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('QR code for the receiver link');
    const { size, path } = qrShape(LINK);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(path);
    expect(root.querySelector('img, image, foreignObject, use')).toBeNull();
  });
});
