import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToastXml, buildToastScript, parseAlerterOutput, xmlEscape } from '../src/notify/desktop';
import { summarizeIncoming } from '../src/core/messages';

test('toast XML escapes user text and keeps buttons as protocol links', () => {
  const xml = buildToastXml({
    group: 'pushpug-abc',
    title: 'Alice <script> & co',
    message: 'msg "quoted"',
    primaryLabel: 'ดึงโค้ดมารวม',
    laterLabel: 'ไว้ทีหลัง',
    primaryUri: 'vscode://pushpug.pushpug/pull?repo=C%3A%5Cwork&x=1',
  });
  assert.match(xml, /scenario="reminder"/);
  assert.match(xml, /Alice &lt;script&gt; &amp; co/);
  assert.match(xml, /activationType="protocol" arguments="vscode:\/\/pushpug\.pushpug\/pull\?repo=C%3A%5Cwork&amp;x=1"/);
  assert.match(xml, /content="ไว้ทีหลัง" activationType="system" arguments="dismiss"/);
});

test('toast script quotes single quotes for PowerShell', () => {
  const script = buildToastScript("<toast>it's</toast>", "tag'1", 'App');
  assert.match(script, /LoadXml\('<toast>it''s<\/toast>'\)/);
  assert.match(script, /\$toast\.Tag = 'tag''1'/);
  assert.equal(xmlEscape(`'"`), '&apos;&quot;');
});

test('alerter output parsing', () => {
  assert.equal(parseAlerterOutput('ดึงโค้ดมารวม\n', 'ดึงโค้ดมารวม'), 'primary');
  assert.equal(parseAlerterOutput('@CONTENTCLICKED', 'x'), 'content');
  assert.equal(parseAlerterOutput('@CLOSED', 'x'), 'later');
  assert.equal(parseAlerterOutput('ไว้ทีหลัง', 'x'), 'later');
  assert.equal(parseAlerterOutput('{"activationType":"actionClicked","activationValue":"x"}', 'x'), 'primary');
});

test('notification text in both languages', () => {
  const commits = [
    { sha: '2', author: 'Alice', email: 'a@x', time: Date.now() / 1000 - 120, subject: 'Fix login' },
    { sha: '1', author: 'Bob', email: 'b@x', time: Date.now() / 1000 - 600, subject: 'Add page' },
  ];
  const th = summarizeIncoming('th', '/w/shop', commits, 2, ['src/app.ts']);
  assert.equal(th.title, 'Alice กับอีก 1 คน push โค้ดใหม่มา');
  assert.match(th.body, /^2 commit ใหม่ใน shop · ล่าสุด: “Fix login” · 2 นาทีที่ผ่านมา$/);
  assert.match(th.sameFile!, /app\.ts/);
  const en = summarizeIncoming('en', '/w/shop', commits.slice(0, 1), 1, []);
  assert.equal(en.title, 'Alice pushed new code');
  assert.match(en.body, /1 new commit\(s\) in shop · latest: “Fix login” · 2 minutes ago/);
  assert.equal(en.sameFile, undefined);
});
