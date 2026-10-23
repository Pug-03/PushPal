// Measures how many bytes one PushPug check really costs on the network, so the
// "≈ X KB/hour" numbers in the UI come from measurements, not guesses.
//
//   node scripts/measure-fetch.mjs [repoDir] [runs]
//
// HTTPS: git fetch (and one GitHub Actions API call) go through a local CONNECT
// proxy that counts every byte in both directions, TLS handshake included.
// SSH: `ssh -v` prints "Transferred: sent N, received M bytes" for the session.
import { createServer, connect } from 'node:net';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const runs = Number(process.argv[3] ?? 5);

function startProxy() {
  const counter = { up: 0, down: 0 };
  const server = createServer((client) => {
    client.once('data', (head) => {
      const m = /^CONNECT ([^:\s]+):(\d+)/.exec(head.toString('latin1'));
      if (!m) return client.destroy();
      const upstream = connect(Number(m[2]), m[1], () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.on('data', (d) => {
          counter.up += d.length;
          upstream.write(d);
        });
        upstream.on('data', (d) => {
          counter.down += d.length;
          client.write(d);
        });
      });
      const end = () => (client.destroy(), upstream.destroy());
      upstream.on('error', end).on('close', end);
      client.on('error', end).on('close', end);
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, counter, url: `http://127.0.0.1:${server.address().port}` })));
}

/** Async run: the proxy lives in this process, so a sync spawn would deadlock. */
function run(file, args, env) {
  return new Promise((ok) => {
    const p = spawn(file, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
    p.on('close', ok);
  });
}

function avg(xs) {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

const { server, counter, url } = await startProxy();
const remote = execFileSync('git', ['-C', repo, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const httpsUrl = remote.startsWith('http') ? remote : remote.replace(/^git@([^:]+):/, 'https://$1/');
const results = {};

async function measure(name, fn) {
  const totals = [];
  for (let i = 0; i < runs; i++) {
    counter.up = counter.down = 0;
    await fn();
    await new Promise((r) => setTimeout(r, 200));
    totals.push(counter.up + counter.down);
  }
  results[name] = { avgBytes: avg(totals), min: Math.min(...totals), max: Math.max(...totals) };
}

// Same command PushPug runs (src/git/repo.ts → fetchUpstream), over HTTPS.
await measure('httpsFetch', () =>
  run('git', ['-C', repo, '-c', `http.proxy=${url}`, 'fetch', '--quiet', '--no-write-fetch-head', httpsUrl], { GIT_TERMINAL_PROMPT: '0' }),
);

// One GitHub Actions "runs for this commit" request (src/core/actions.ts), first and conditional (ETag).
const slug = /github\.com[/:]([^/]+\/[^/.]+)/.exec(httpsUrl)?.[1];
if (slug) {
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const api = `https://api.github.com/repos/${slug}/actions/runs?head_sha=${sha}&per_page=20&exclude_pull_requests=true`;
  const etag = /etag: (.*)/i.exec(spawnSync('curl', ['-sI', api], { encoding: 'utf8' }).stdout)?.[1]?.trim();
  await measure('actionsCall', () => run('curl', ['-s', '--compressed', '-o', '/dev/null', '-x', url, '-H', 'Accept: application/vnd.github+json', api]));
  if (etag) await measure('actionsCall304', () => run('curl', ['-s', '--compressed', '-o', '/dev/null', '-x', url, '-H', `If-None-Match: ${etag}`, api]));
}

// Ref-list cost per ref: what grows with the number of branches/tags on the remote.
// `ls-remote --heads --tags` sends the same ls-refs request a fetch does.
for (const u of [httpsUrl, ...(process.env.EXTRA_REMOTES ?? '').split(' ').filter(Boolean)]) {
  const refs = execFileSync('git', ['ls-remote', '--heads', '--tags', u], { encoding: 'utf8' }).split('\n').filter(Boolean).length;
  await measure(`lsRemote ${u} (${refs} refs)`, () => run('git', ['-c', `http.proxy=${url}`, 'ls-remote', '--heads', '--tags', u], { GIT_TERMINAL_PROMPT: '0' }));
  results[`lsRemote ${u} (${refs} refs)`].refs = refs;
}

// SSH (only when a key for the host is set up).
const sshUrl = httpsUrl.replace(/^https:\/\/([^/]+)\//, 'git@$1:');
const sizes = [];
for (let i = 0; i < runs; i++) {
  const r = spawnSync('git', ['-C', repo, 'fetch', '--quiet', '--no-write-fetch-head', sshUrl], {
    encoding: 'utf8',
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -v -o BatchMode=yes', GIT_TERMINAL_PROMPT: '0' },
  });
  const m = /Transferred: sent (\d+), received (\d+) bytes/.exec(r.stderr);
  if (!m) break;
  sizes.push(Number(m[1]) + Number(m[2]));
}
if (sizes.length) results.sshFetch = { avgBytes: avg(sizes), min: Math.min(...sizes), max: Math.max(...sizes) };

server.close();
console.log(JSON.stringify({ repo: httpsUrl, runs, results }, null, 2));
