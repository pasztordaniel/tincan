import { DefaultUrlSerializer, PRIMARY_OUTLET } from '@angular/router';
import { receiverMatcher } from './app.routes';

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
