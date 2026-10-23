// Tags the version in package.json and pushes only the tag; CI then builds the
// .vsix and publishes the release. main only takes pull requests, so the version
// bump itself is merged through one first (see PUBLISHING.md).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${version}`;
if (git('branch', '--show-current') !== 'main') fail('Switch to main first: git checkout main && git pull');
if (git('status', '--porcelain')) fail('There are uncommitted changes. Commit them through a pull request first.');
git('fetch', '--quiet', 'origin', 'main', '--tags');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) fail('Your main differs from GitHub. Run git pull first.');
if (git('tag', '--list', tag)) fail(`${tag} already exists. Raise "version" in package.json (through a pull request) first.`);
if (!readFileSync('CHANGELOG.md', 'utf8').includes(`## ${version}`)) fail(`CHANGELOG.md has no "## ${version}" section yet.`);
git('tag', tag);
git('push', 'origin', tag);
console.log(`Pushed ${tag}. CI builds the .vsix and the GitHub release now.`);
