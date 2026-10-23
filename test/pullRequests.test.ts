import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiResponse, Requester } from '../src/core/checks';
import {
  parsePull,
  findPullRequest,
  createPullRequest,
  listOpenPullRequests,
  compareUrl,
  prTitle,
  prBody,
  apiMessage,
} from '../src/core/pullRequests';
import type { Commit } from '../src/git/repo';

const SLUG = 'pug-team/app';

function pull(n: number, over: Record<string, unknown> = {}) {
  return {
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/${SLUG}/pull/${n}`,
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '2026-10-23T03:00:00Z',
    user: { login: 'bob' },
    head: { ref: 'task/x', sha: `sha${n}` },
    base: { ref: 'main' },
    ...over,
  };
}

/** A fake GitHub: answers by "METHOD path" (path without the query string). */
function fakeGitHub(routes: Record<string, ApiResponse | ((body: unknown) => ApiResponse)>): Requester & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (path: string, opts?: { method?: string; body?: unknown }) => {
    const key = `${opts?.method ?? 'GET'} ${path.split('?')[0]}`;
    calls.push(`${opts?.method ?? 'GET'} ${path}`);
    const r = routes[key];
    if (!r) return { status: 404 };
    return typeof r === 'function' ? r(opts?.body) : r;
  }) as Requester & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const commit = (subject: string): Commit => ({ sha: subject, author: 'Bob', email: 'bob@example.com', time: 0, subject });

describe('pull request status', () => {
  test('open, draft, conflict, merged, closed', () => {
    assert.equal(parsePull(pull(1))?.status, 'open');
    assert.equal(parsePull(pull(1, { draft: true }))?.status, 'draft');
    assert.equal(parsePull(pull(1, { mergeable: false, mergeable_state: 'dirty' }))?.status, 'conflict');
    assert.equal(parsePull(pull(1, { mergeable: null, mergeable_state: 'unknown' }))?.status, 'open', 'still being computed is not a conflict');
    assert.equal(parsePull(pull(1, { state: 'closed', merged_at: '2026-10-23T04:00:00Z' }))?.status, 'merged');
    assert.equal(parsePull(pull(1, { state: 'closed' }))?.status, 'closed');
    assert.equal(parsePull({ nope: true }), null);
  });
});

describe('find the pull request of a branch', () => {
  test('open one wins over an older closed one, and its conflict state is read', async () => {
    const gh = fakeGitHub({
      [`GET /repos/${SLUG}/pulls`]: { status: 200, json: [pull(7, { state: 'closed' }), pull(9)] },
      [`GET /repos/${SLUG}/pulls/9`]: { status: 200, json: pull(9, { mergeable: false, mergeable_state: 'dirty' }) },
    });
    const r = await findPullRequest(gh, SLUG, 'task/x');
    assert.equal(r.kind, 'ok');
    assert.equal(r.kind === 'ok' && r.pr?.number, 9);
    assert.equal(r.kind === 'ok' && r.pr?.status, 'conflict');
    assert.match(gh.calls[0], /head=pug-team%3Atask%2Fx/);
  });

  test('merged: no second request', async () => {
    const gh = fakeGitHub({ [`GET /repos/${SLUG}/pulls`]: { status: 200, json: [pull(3, { state: 'closed', merged_at: '2026-10-23T04:00:00Z' })] } });
    const r = await findPullRequest(gh, SLUG, 'task/x');
    assert.equal(r.kind === 'ok' && r.pr?.status, 'merged');
    assert.equal(gh.calls.length, 1);
  });

  test('none, signed out, rate limited', async () => {
    assert.deepEqual(await findPullRequest(fakeGitHub({ [`GET /repos/${SLUG}/pulls`]: { status: 200, json: [] } }), SLUG, 'task/x'), { kind: 'ok', pr: null });
    assert.equal((await findPullRequest(fakeGitHub({ [`GET /repos/${SLUG}/pulls`]: { status: 401 } }), SLUG, 'task/x')).kind, 'needsAuth');
    assert.equal((await findPullRequest(fakeGitHub({ [`GET /repos/${SLUG}/pulls`]: { status: 403, remaining: 0, resetAt: 1 } }), SLUG, 'task/x')).kind, 'rateLimited');
  });

  test('a network failure is an error, not a crash', async () => {
    const throws: Requester = async () => {
      throw new Error('offline');
    };
    assert.equal((await findPullRequest(throws, SLUG, 'task/x')).kind, 'error');
  });
});

describe('open a pull request', () => {
  test('created with the title, body, branch and base', async () => {
    let sent: Record<string, unknown> | undefined;
    const gh = fakeGitHub({
      [`POST /repos/${SLUG}/pulls`]: (body) => {
        sent = body as Record<string, unknown>;
        return { status: 201, json: pull(12, { title: (body as { title: string }).title }) };
      },
    });
    const r = await createPullRequest(gh, SLUG, { title: 'Fix login', body: '- a', head: 'task/x', base: 'main' });
    assert.equal(r.kind, 'created');
    assert.equal(r.kind === 'created' && r.pr.number, 12);
    assert.deepEqual(sent, { title: 'Fix login', body: '- a', head: 'task/x', base: 'main', maintainer_can_modify: true });
  });

  test('already exists: returns the existing one', async () => {
    const gh = fakeGitHub({
      [`POST /repos/${SLUG}/pulls`]: { status: 422, json: { message: 'Validation Failed', errors: [{ message: 'A pull request already exists for pug-team:task/x.' }] } },
      [`GET /repos/${SLUG}/pulls`]: { status: 200, json: [pull(4)] },
      [`GET /repos/${SLUG}/pulls/4`]: { status: 200, json: pull(4, { mergeable: true, mergeable_state: 'clean' }) },
    });
    const r = await createPullRequest(gh, SLUG, { title: 't', body: '', head: 'task/x', base: 'main' });
    assert.equal(r.kind, 'exists');
    assert.equal(r.kind === 'exists' && r.pr.number, 4);
  });

  test('no commits, other errors keep GitHub\'s reason', async () => {
    const none = fakeGitHub({ [`POST /repos/${SLUG}/pulls`]: { status: 422, json: { message: 'Validation Failed', errors: [{ message: 'No commits between main and task/x' }] } } });
    assert.equal((await createPullRequest(none, SLUG, { title: 't', body: '', head: 'task/x', base: 'main' })).kind, 'noCommits');
    const forbidden = fakeGitHub({ [`POST /repos/${SLUG}/pulls`]: { status: 403, json: { message: 'Resource not accessible by integration' } } });
    assert.deepEqual(await createPullRequest(forbidden, SLUG, { title: 't', body: '', head: 'task/x', base: 'main' }), {
      kind: 'error',
      status: 403,
      message: 'Resource not accessible by integration',
    });
  });

  test('open pull requests of the repository', async () => {
    const gh = fakeGitHub({ [`GET /repos/${SLUG}/pulls`]: { status: 200, json: [pull(2, { user: { login: 'alice' } }), pull(1)] } });
    const list = await listOpenPullRequests(gh, SLUG);
    assert.deepEqual(list?.map((p) => [p.number, p.author]), [[2, 'alice'], [1, 'bob']]);
    assert.equal(await listOpenPullRequests(fakeGitHub({}), SLUG), null);
  });
});

describe('texts and links', () => {
  test('title from the only commit, else from the branch name', () => {
    assert.equal(prTitle([commit('Fix the login page')], 'task/whatever'), 'Fix the login page');
    assert.equal(prTitle([commit('a'), commit('b')], 'task/fix-login_page'), 'Fix login page');
    assert.equal(prTitle([commit('a'), commit('b')], 'task/แก้หน้า-login'), 'แก้หน้า login');
  });

  test('body lists the commits oldest first', () => {
    assert.equal(prBody([commit('second'), commit('first')]), '- first\n- second');
  });

  test('compare link encodes each part of the branch name', () => {
    assert.equal(compareUrl(SLUG, 'main', 'task/แก้'), `https://github.com/${SLUG}/compare/main...task/%E0%B9%81%E0%B8%81%E0%B9%89?expand=1`);
  });

  test("GitHub's error message with its details", () => {
    assert.equal(apiMessage({ message: 'Validation Failed', errors: [{ message: 'x' }, 'y'] }), 'Validation Failed: x; y');
    assert.equal(apiMessage(undefined), undefined);
  });
});
