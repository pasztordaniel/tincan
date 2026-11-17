import { DefaultUrlSerializer, PRIMARY_OUTLET } from '@angular/router';
import { dropStrayFragment, receiverMatcher } from './app.routes';

function match(url: string) {
  const segments =
    new DefaultUrlSerializer().parse(url).root.children[PRIMARY_OUTLET]?.segments ?? [];
  const result = receiverMatcher(segments);
  return result && { consumed: result.consumed.length, id: result.posParams?.['id']?.path };
}

describe('receiverMatcher', () => {
  it('takes /r/<id> with the id', () => {
    expect(match('/r/abc#key')).toEqual({ consumed: 2, id: 'abc' });
  });

  it.each(['/r', '/r/abc/extra', '/r/abc/extra/more'])(
    'takes the mangled %s without an id, so the page clears the key and says invalid',
    (url) => {
      expect(match(url)).toEqual({ consumed: url.split('/').length - 1, id: undefined });
    },
  );

  it.each(['/', '/design', '/rx/abc', '/x/r'])('leaves %s to the other routes', (url) => {
    expect(match(url)).toBeNull();
  });
});

describe('dropStrayFragment', () => {
  function run(pathname: string, hash: string) {
    const calls: string[] = [];
    const history = {
      state: { k: 1 },
      replaceState: (_s: unknown, _t: string, url?: string | URL | null) =>
        void calls.push(String(url)),
    };
    dropStrayFragment({ pathname, search: '?q=1', hash }, history);
    return calls;
  }

  it.each(['/', '/x', '/R/abc', '/rr/abc', '/r%2Fabc', '/%72/abc', '/design', '/s', '/index.html'])(
    'clears a key that arrives on %s',
    (path) => {
      expect(run(path, '#secretkey')).toEqual([`${path}?q=1`]);
    },
  );

  it.each(['/r', '/r/abc', '/r/abc/extra'])('leaves %s to the receiver page', (path) => {
    expect(run(path, '#secretkey')).toEqual([]);
  });

  it('does nothing without a fragment', () => {
    expect(run('/x', '')).toEqual([]);
  });
});
