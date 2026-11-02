// delegation-status.mjs（記録を状態として使う）とSessionStart Hookのテスト。ghは呼ばない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addReview, newRecord, newSelfRecord, parseFinding, summarize, writeRecord } from '../scripts/delegation.mjs';
import {
  buildStatus,
  collectStatus,
  findPromotions,
  formatStatus,
  nextAction,
  offlineAction,
  oneLine,
  prunableMirrorKeys,
} from '../scripts/delegation-status.mjs';
import { hookOutput } from '../hooks/delegation-status.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const delegationCli = join(here, '../scripts/delegation.mjs');
const hookPath = join(here, '../hooks/delegation-status.mjs');

const NOW = Date.parse('2026-09-27T12:00:00Z');
const HEAD = 'aaaaaaa' + '1'.repeat(33);
const NEW_HEAD = 'bbbbbbb' + '2'.repeat(33);

const issueRec = (issue, extra = {}) => ({
  ...newRecord({ issue, title: `Issue ${issue}`, model: 'swe-2-medium', delegatedAt: '2026-09-27T09:00:00Z' }),
  ...extra,
});
const reviewed = (rec, verdict, extra = {}) =>
  addReview(rec, { round: rec.reviews.length, sha: HEAD, verdict, posted: verdict === 'fix', at: '2026-09-27T10:00:00Z', ...extra });
const ghPr = (number, extra = {}) => ({
  number,
  state: 'OPEN',
  headRefOid: HEAD,
  headRefName: `devin/x-${number}`,
  createdAt: '2026-09-27T09:30:00Z',
  body: '',
  title: `PR ${number}`,
  ...extra,
});

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'delegation-status-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('S-07: 完了した記録（merged / closed）には次の動きを出さない', () => {
  assert.equal(nextAction(issueRec(1, { outcome: 'merged' }), { prs: [], now: NOW }), null);
  assert.equal(nextAction(issueRec(2, { outcome: 'closed' }), { prs: [], now: NOW }), null);
  // finalizeをPRが開いている間に実行した記録（outcome: open）は完了ではない
  assert.equal(nextAction(issueRec(3, { outcome: 'open', gh: { pr: 30 } }), { prs: [ghPr(30)], now: NOW }).state, 'review');
  const status = buildStatus({ records: [issueRec(1, { outcome: 'merged' })], now: NOW });
  assert.deepEqual(status.actions, []);
});

test('S-08: PR が MERGED / CLOSED なら finalize', () => {
  const merged = nextAction(issueRec(58), { prs: [ghPr(60, { state: 'MERGED', body: 'Closes #58' })], now: NOW });
  assert.deepEqual([merged.state, merged.pr, merged.prState], ['finalize', 60, 'MERGED']);
  const closed = nextAction(reviewed(issueRec(59, { gh: { pr: 61 } }), 'escalate'), { prs: [ghPr(61, { state: 'CLOSED' })], now: NOW });
  assert.equal(closed.state, 'finalize');
});

test('S-09: 紐づく PR が無ければ PR 待ち。経過時間を出し、8 時間を超えたら注記する', () => {
  const a = nextAction(issueRec(59), { prs: [ghPr(70, { body: 'Closes #5' })], now: NOW });
  assert.equal(a.state, 'wait-pr');
  assert.equal(a.elapsedHours, 3);
  assert.equal(a.overdue, false);
  const late = nextAction(issueRec(59), { prs: [], now: Date.parse('2026-09-27T17:00:01Z') });
  assert.equal(late.overdue, true);
  assert.match(formatStatus(buildStatus({ records: [issueRec(59)], now: Date.parse('2026-09-27T17:00:01Z') })), /8 時間を超えた/);
});

test('S-10: PR があり reviews が空なら初回レビュー前（Issue なし PR の中断も同じ）', () => {
  const a = nextAction(issueRec(60), { prs: [ghPr(63, { headRefName: 'devin/feature-60' })], now: NOW });
  assert.deepEqual([a.state, a.pr, a.round], ['review', 63, 0]);
  const self = newSelfRecord({ pr: 64, title: 't', runner: 'cloud', createdAt: '2026-09-27T09:00:00Z' });
  const b = nextAction(self, { prs: [ghPr(64)], now: NOW });
  assert.deepEqual([b.key, b.state], ['pr-64', 'review']);
  assert.match(formatStatus(buildStatus({ records: [self], prs: [ghPr(64)], now: NOW })), /PR #64 初回レビュー前 → review-devin-pr の round 0（「Issue なし PR」の節）/);
});

test('S-11: head が最後の reviewed_sha と違えば再レビュー（round n+1）', () => {
  const rec = reviewed(issueRec(61, { gh: { pr: 65 } }), 'fix');
  const a = nextAction(rec, { prs: [ghPr(65, { headRefOid: NEW_HEAD })], now: NOW });
  assert.deepEqual([a.state, a.round], ['re-review', 1]);
  // マージ可と判定した後にpushされた（衝突の解消など）ときも再レビュー
  assert.equal(nextAction(reviewed(issueRec(62, { gh: { pr: 66 } }), 'merge'), { prs: [ghPr(66, { headRefOid: NEW_HEAD })], now: NOW }).state, 're-review');
});

test('S-12: 完全SHAが同じfixは修正待ち。mergeはユーザーのマージ待ち', () => {
  const rec = reviewed(issueRec(61, { gh: { pr: 65 } }), 'fix');
  const a = nextAction(rec, { prs: [ghPr(65)], now: NOW });
  assert.deepEqual([a.state, a.since, a.sha, a.local], ['wait-update', '2026-09-27T10:00:00Z', HEAD, true]);
  // reviewed_atの無い古い記録はdelegated_atを使う。クラウドは注記しない
  const legacy = addReview(issueRec(62, { gh: { pr: 66 }, runner: 'cloud' }), { round: 0, sha: HEAD, verdict: 'fix', posted: true });
  const b = nextAction(legacy, { prs: [ghPr(66)], now: NOW });
  assert.deepEqual([b.since, b.local], ['2026-09-27T09:00:00Z', false]);
  const text = formatStatus(buildStatus({ records: [rec, legacy], prs: [ghPr(65), ghPr(66)], now: NOW }));
  assert.match(text, /Issue #61（PR #65）修正待ち（round 0 で指摘を投稿）→ .*`node \.claude\/scripts\/wait-for-pr-update\.mjs 65 --since 2026-09-27T10:00:00Z --sha aaaaaaa111111111111111111111111111111111` を起動し直す。ローカルの委譲なので/);
  assert.doesNotMatch(text.split('\n').find((l) => l.includes('#62')), /ローカル/);
  const esc = nextAction(reviewed(issueRec(63, { gh: { pr: 67 } }), 'escalate'), { prs: [ghPr(67)], now: NOW });
  assert.deepEqual([esc.state, esc.verdict], ['await-user', 'escalate']);
  const ok = reviewed(issueRec(64, { gh: { pr: 68 } }), 'merge');
  assert.match(formatStatus(buildStatus({ records: [ok], prs: [ghPr(68)], now: NOW })), /レビュー済み。マージ判断はユーザー/);
});

test('S-13: PR の特定は pr・gh.pr・Issue への紐づけの順。番号が分かっても一覧に無ければ確かめられない', () => {
  const prs = [ghPr(52, { body: 'Closes #51' }), ghPr(56, { headRefName: 'devin/auth-error-redirect-55' })];
  assert.equal(nextAction(issueRec(51), { prs, now: NOW }).pr, 52);
  assert.equal(nextAction(issueRec(55), { prs, now: NOW }).pr, 56);
  assert.equal(nextAction(issueRec(55, { gh: { pr: 52 } }), { prs, now: NOW }).pr, 52);
  // 委譲より前に作られたPRは紐づけない
  assert.equal(nextAction(issueRec(51), { prs: [ghPr(52, { body: 'Closes #51', createdAt: '2026-09-27T08:00:00Z' })], now: NOW }).state, 'wait-pr');
  const unknown = nextAction(issueRec(57, { gh: { pr: 99 } }), { prs, now: NOW });
  assert.deepEqual([unknown.state, unknown.pr], ['unknown', 99]);
});

test('S-14: 未起票の昇格候補は、candidates/delegation-<category>.md が無いものだけ', () => {
  const withFinding = (issue, text) => ({ ...addReview(issueRec(issue), { round: 0, sha: 'abc1234', verdict: 'merge', findings: [parseFinding(text)] }), outcome: 'merged' });
  const summary = summarize([withFinding(31, 'security:security:x'), withFinding(44, 'security:security:y'), withFinding(37, 'nit:logging-gap:z')]);
  assert.deepEqual(findPromotions(summary, []), [{ category: 'security', issues: [31, 44] }]);
  assert.deepEqual(findPromotions(summary, ['delegation-security.md', '_TEMPLATE.md']), []);
  const text = formatStatus(buildStatus({ records: [withFinding(31, 'security:security:x'), withFinding(44, 'security:security:y')], now: NOW }));
  assert.match(text, /未起票の昇格候補.*\n- security（#31 #44）/);
});

test('S-14: 起票済みの候補を candidates/archive/ に移しても、未起票の昇格候補に戻らない', () => {
  withTmp((dir) => {
    const primary = join(dir, 'delegations');
    const candidates = join(dir, 'candidates');
    mkdirSync(join(candidates, 'archive'), { recursive: true });
    for (const issue of [31, 44]) {
      writeRecord(primary, { ...addReview(issueRec(issue), { round: 0, sha: 'abc1234', verdict: 'escalate', findings: [parseFinding('security:security:x')] }), outcome: 'merged' });
    }
    const status = () => collectStatus({ dir: primary, mirrorDir: null, candidatesDir: candidates, now: NOW, useGh: false });
    assert.deepEqual(status().promotions.map((p) => p.category), ['security']);
    writeFileSync(join(candidates, 'archive', 'delegation-security.md'), '# 改善候補: delegation-security\n');
    assert.deepEqual(status().promotions, []);
  });
});

test('S-15: 写しの掃除は、完了から 30 日を過ぎたものだけ', () => {
  const done = (issue, closedAt) => issueRec(issue, { outcome: 'merged', gh: { pr: issue + 1, closed_at: closedAt, merged_at: closedAt } });
  const records = [
    done(1, '2026-08-27T11:59:59Z'),
    done(2, '2026-08-28T12:00:00Z'),
    issueRec(3, { outcome: 'closed', gh: { pr: 4, closed_at: null, merged_at: null } }),
    issueRec(5),
  ];
  assert.deepEqual(prunableMirrorKeys(records, NOW), [1]);
});

test('S-16: 表示は 1 委譲 1 行。タイトルは改行を落として切る。出す行が無ければ空。gh が無ければ記録上の状態と注記', () => {
  assert.equal(oneLine('a\n\nb\tc'), 'a b c');
  assert.equal(oneLine('x'.repeat(100), 10), `${'x'.repeat(9)}…`);
  assert.equal(formatStatus(buildStatus({ records: [], now: NOW })), '');
  // ghが失敗しただけ（進行中の委譲も候補も無い）なら何も出さない
  assert.equal(formatStatus(buildStatus({ records: [issueRec(1, { outcome: 'merged' })], now: NOW, offline: true, ghError: 'spawnSync gh ENOENT' })), '');
  const unlinked = buildStatus({
    records: [],
    openPrs: [ghPr(70, { title: 'docs: 知見\n2 行目', headRefName: 'devin/update-skills-1790414398' }), ghPr(71), ghPr(72)],
    commentsOf: (n) => {
      if (n === 71) throw new Error('timeout');
      return n === 72 ? [{ body: '<!-- claude-review round=0 -->' }] : [];
    },
    now: NOW,
  });
  const text = formatStatus(unlinked);
  assert.match(text, /- PR #70（devin\/update-skills-1790414398）docs: 知見 2 行目\n/);
  assert.match(text, /- PR #71（devin\/x-71）PR 71 ※コメントを取得できず/);
  assert.match(text, /#72/);
  assert.match(text, /delegation\.mjs init pr-<番号>/);
  const fixing = reviewed(issueRec(61, { gh: { pr: 65 } }), 'fix');
  const offline = buildStatus({ records: [fixing, issueRec(62)], now: NOW, offline: true, ghError: 'spawnSync gh ENOENT' });
  assert.deepEqual(offline.actions, [offlineAction(fixing), offlineAction(issueRec(62))]);
  assert.deepEqual(offlineAction(fixing), { key: 61, pr: 65, state: 'offline', round: 0, verdict: 'fix' });
  const offlineText = formatStatus(offline);
  assert.match(offlineText, /Issue #61（PR #65）記録上: round 0 の判定 fix/);
  assert.match(offlineText, /Issue #62 記録上: レビュー前/);
  assert.match(offlineText, /gh で確かめられなかったため（spawnSync gh ENOENT）/);
  assert.equal(offline.unlinked.length, 0);
});

test('collectStatus は正 ∪ 写しを読み、写しの古い完了済みを消し、gh を使わなければ記録上の状態を出す', () => {
  withTmp((dir) => {
    const primary = join(dir, 'delegations');
    const mirror = join(dir, 'mirror');
    const candidates = join(dir, 'candidates');
    mkdirSync(candidates);
    writeRecord(primary, issueRec(60));
    writeRecord(mirror, reviewed(issueRec(60), 'fix'));
    writeRecord(mirror, issueRec(61));
    writeRecord(mirror, issueRec(40, { outcome: 'merged', gh: { pr: 41, closed_at: '2026-07-01T00:00:00Z' } }));
    writeFileSync(join(mirror, '62.yml'), 'broken: "x"');
    const status = collectStatus({ dir: primary, mirrorDir: mirror, candidatesDir: candidates, now: NOW, useGh: false });
    assert.deepEqual(status.actions.map((a) => [a.key, a.round]), [[60, 0], [61, null]]);
    assert.equal(existsSync(join(mirror, '40.yml')), false);
    assert.equal(existsSync(join(mirror, '61.yml')), true);
    const res = spawnSync(process.execPath, [delegationCli, 'status', '--no-gh', '--dir', primary, '--mirror-dir', mirror], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Issue #60 記録上: round 0 の判定 fix/);
    const json = spawnSync(process.execPath, [delegationCli, 'status', '--no-gh', '--json', '--dir', join(dir, 'empty')], { encoding: 'utf8' });
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout).actions, []);
    assert.equal(spawnSync(process.execPath, [delegationCli, 'status', '--bogus'], { encoding: 'utf8' }).status, 2);
  });
});

test('S-19: フックは出す行があれば SessionStart の additionalContext、無ければ何も出さない', () => {
  assert.equal(hookOutput(''), null);
  assert.deepEqual(JSON.parse(hookOutput('📋 x')), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: '📋 x' } });
});

test('S-19: フック全体。別の worktree で委譲した記録（写しだけにある）の PR を、偽の gh で「初回レビュー前」として出す', () => {
  withTmp((dir) => {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const linked = { number: 971, title: 'feat: x', body: 'Closes #970', headRefName: 'devin/feature-970', createdAt: '2026-09-27T10:00:00Z', state: 'OPEN', headRefOid: HEAD, closingIssuesReferences: [] };
    const knowledge = { ...linked, number: 972, title: 'docs: 知見', body: '', headRefName: 'devin/update-skills-1790000000', author: { login: 'app/devin-ai-integration' } };
    writeFileSync(
      join(bin, 'gh'),
      [
        '#!/bin/sh',
        'case "$*" in',
        `  *"--state all"*) echo '${JSON.stringify([linked])}' ;;`,
        `  *"--state open"*) echo '${JSON.stringify([{ ...linked, author: { login: 'me' } }, knowledge])}' ;;`,
        `  *"pr view"*) echo '{"comments":[]}' ;;`,
        '  *) exit 1 ;;',
        'esac',
      ].join('\n'),
      { mode: 0o755 },
    );
    const state = join(dir, 'state');
    writeRecord(join(state, 'delegations'), issueRec(970, { delegated_at: '2026-09-27T09:00:00Z' }));
    const res = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}`, HARNESS_STATE_DIR: state },
    });
    assert.equal(res.status, 0, res.stderr);
    const text = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
    assert.match(text, /- Issue #970（PR #971）初回レビュー前 → review-devin-pr の round 0\n/);
    assert.match(text, /- PR #972（devin\/update-skills-1790000000）docs: 知見/);
    assert.doesNotMatch(text, /PR #971（devin/);
  });
});

test('S-20: gh が無い環境でもフックは exit 0（出すなら SessionStart の形）', () => {
  withTmp((dir) => {
    const emptyBin = join(dir, 'bin');
    mkdirSync(emptyBin);
    const res = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      env: { ...process.env, PATH: emptyBin, HARNESS_STATE_DIR: join(dir, 'state') },
    });
    assert.equal(res.status, 0);
    if (res.stdout !== '') assert.equal(JSON.parse(res.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
  });
});

test('I-21: 旧短縮SHAはhead一致としてマージ可を表示しない', () => {
  const rec = addReview(issueRec(11, { gh: { pr: 12 } }), { round: 0, sha: HEAD.slice(0, 10), verdict: 'merge' });
  const action = nextAction(rec, { prs: [ghPr(12)], now: NOW });
  assert.equal(action.state, 're-review');
  const text = formatStatus(buildStatus({ records: [rec], prs: [ghPr(12)], now: NOW }));
  assert.doesNotMatch(text, /マージ可|マージ待ち/);
});
