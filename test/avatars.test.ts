import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarFromEmail, fetchCommitAvatars } from '../src/core/avatars';

test('GitHub noreply addresses map to an avatar without any request', () => {
  assert.equal(avatarFromEmail('12345+pug-03@users.noreply.github.com'), 'https://avatars.githubusercontent.com/u/12345?s=64');
  assert.equal(avatarFromEmail('Pug-03@users.noreply.github.com'), 'https://github.com/pug-03.png?size=64');
  assert.equal(avatarFromEmail('alice@example.com'), undefined);
});

test('one API call gives the avatars of recent authors; unlinked e-mails are skipped', async () => {
  let url = '';
  let headers: Record<string, string> = {};
  const fake = (async (u: string, init: { headers: Record<string, string> }) => {
    url = u;
    headers = init.headers;
    return new Response(
      JSON.stringify([
        { commit: { author: { email: 'Alice@Example.com' } }, author: { avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' } },
        { commit: { author: { email: 'alice@example.com' } }, author: { avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' } },
        { commit: { author: { email: 'nobody@example.com' } }, author: null },
      ]),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const m = await fetchCommitAvatars('a/b', 'abc123', { token: 'T', fetchImpl: fake });
  assert.match(url, /\/repos\/a\/b\/commits\?sha=abc123&per_page=50$/);
  assert.equal(headers.Authorization, 'Bearer T');
  assert.deepEqual([...m], [['alice@example.com', 'https://avatars.githubusercontent.com/u/1?v=4&s=64']]);
});

test('network or API errors just mean no pictures', async () => {
  const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assert.equal((await fetchCommitAvatars('a/b', 'x', { fetchImpl: failing })).size, 0);
  const notFound = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
  assert.equal((await fetchCommitAvatars('a/b', 'x', { fetchImpl: notFound })).size, 0);
});
