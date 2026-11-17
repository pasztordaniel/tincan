import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, missingClientBuild, parsePort, portWarning } from '../src/config.js';

describe('parsePort', () => {
  it.each([
    ['8080', 8080],
    [' 3100 ', 3100],
    ['1', 1],
    ['65535', 65535],
  ])('accepts %j', (value, expected) => {
    expect(parsePort(value)).toBe(expected);
  });

  it.each([undefined, '', '0', '65536', '-1', '3.5', '1e3', 'abc', '80abc'])(
    'falls back for %j',
    (value) => {
      expect(parsePort(value)).toBe(DEFAULT_PORT);
      expect(parsePort(value, 4321)).toBe(4321);
    },
  );
});

describe('portWarning', () => {
  it.each([undefined, '', '  ', '8080'])('stays quiet for %j', (value) => {
    expect(portWarning(value)).toBeUndefined();
  });

  it.each(['abc', '0', '70000', '3.5'])('warns for %j and names the fallback', (value) => {
    expect(portWarning(value, 4321)).toMatch(/not a valid port .*using 4321$/);
  });

  it('does not echo an arbitrarily long value', () => {
    expect(portWarning('x'.repeat(1000))!.length).toBeLessThan(100);
  });
});

describe('missingClientBuild', () => {
  it('fails in production and only warns elsewhere', () => {
    expect(missingClientBuild('production')).toBe('fail');
    expect(missingClientBuild('development')).toBe('warn');
    expect(missingClientBuild(undefined)).toBe('warn');
  });
});
