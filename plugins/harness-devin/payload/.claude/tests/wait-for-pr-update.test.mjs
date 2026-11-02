// wait-for-pr-update.mjsの「PRが更新されたか」の判定と引数検査のテスト。ghは呼ばない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksComplete, ciConclusion, countNewCommits, detectUpdate, parseArgs } from '../scripts/wait-for-pr-update.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '../scripts/wait-for-pr-update.mjs');

const SINCE = '2026-09-26T10:00:00Z';
const NOW = Date.parse('2026-09-26T10:30:00Z');
const run = (status, conclusion = null) => ({ __typename: 'CheckRun', status, conclusion });
const ctx = (state) => ({ __typename: 'StatusContext', state });
const pr = ({ state = 'OPEN', head = 'bbbbbbb1', commits, rollup = [] } = {}) => ({
  state,
  headRefOid: head,
  commits: commits ?? [
    { oid: 'aaaaaaa1', committedDate: '2026-09-26T09:00:00Z' },
    { oid: 'bbbbbbb1', committedDate: '2026-09-26T10:10:00Z' },
  ],
  statusCheckRollup: rollup,
});

test('W-01: head のコミットが since より前なら未更新', () => {
  const p = pr({ head: 'aaaaaaa1', commits: [{ oid: 'aaaaaaa1', committedDate: '2026-09-26T09:00:00Z' }] });
  const r = detectUpdate(p, { since: SINCE, nowMs: NOW });
  assert.equal(r.status, 'waiting');
  assert.equal(r.newCommits, 0);
  // --shaと同じheadも未更新（コミット時刻にかかわらず）
  assert.equal(detectUpdate(pr({ rollup: [run('COMPLETED', 'SUCCESS')] }), { since: SINCE, sha: 'bbbbbbb', nowMs: NOW }).status, 'waiting');
});

test('W-02: since より後の head でも CI 実行中なら未更新', () => {
  const r = detectUpdate(pr({ rollup: [run('COMPLETED', 'SUCCESS'), run('IN_PROGRESS')] }), { since: SINCE, nowMs: NOW });
  assert.equal(r.status, 'waiting');
});

test('W-03: since より後の head で CI がすべて成功したら更新あり', () => {
  const r = detectUpdate(pr({ rollup: [run('COMPLETED', 'SUCCESS'), run('COMPLETED', 'SKIPPED')] }), {
    since: SINCE,
    sha: 'aaaaaaa1',
    nowMs: NOW,
  });
  assert.deepEqual(r, { status: 'updated', ciConclusion: 'success', headSha: 'bbbbbbb1', newCommits: 1 });
});

test('W-04: 失敗を含んで完了しても更新ありとして返し、結論は failure', () => {
  const r = detectUpdate(pr({ rollup: [run('COMPLETED', 'SUCCESS'), run('COMPLETED', 'FAILURE')] }), { since: SINCE, nowMs: NOW });
  assert.equal(r.status, 'updated');
  assert.equal(r.ciConclusion, 'failure');
});

test('W-05: チェックが 0 件なら、head を初めて見てから猶予を過ぎるまで待つ', () => {
  const opts = { since: SINCE, nowMs: NOW, graceSec: 180 };
  assert.equal(detectUpdate(pr(), { ...opts, headSeenAtMs: NOW - 60_000 }).status, 'waiting');
  const r = detectUpdate(pr(), { ...opts, headSeenAtMs: NOW - 200_000 });
  assert.equal(r.status, 'updated');
  assert.equal(r.ciConclusion, 'none');
});

test('W-06: PR が CLOSED / MERGED なら closed', () => {
  for (const state of ['CLOSED', 'MERGED']) {
    assert.equal(detectUpdate(pr({ state }), { since: SINCE, nowMs: NOW }).status, 'closed', state);
  }
});

test('W-07: StatusContext と CheckRun の混在。PENDING があれば未完了、ERROR は失敗', () => {
  assert.equal(checksComplete([run('COMPLETED', 'SUCCESS'), ctx('PENDING')]), false);
  assert.equal(checksComplete([run('COMPLETED', 'SUCCESS'), ctx('SUCCESS')]), true);
  assert.equal(ciConclusion([run('COMPLETED', 'SUCCESS'), ctx('ERROR')]), 'failure');
  assert.equal(ciConclusion([ctx('SUCCESS')]), 'success');
  assert.equal(ciConclusion([]), 'none');
});

test('W-04b: 成功扱いは SUCCESS / SKIPPED / NEUTRAL だけ。STALE など想定外の結論は失敗', () => {
  assert.equal(ciConclusion([run('COMPLETED', 'NEUTRAL'), run('COMPLETED', 'SKIPPED')]), 'success');
  assert.equal(ciConclusion([run('COMPLETED', 'STALE')]), 'failure');
  assert.equal(ciConclusion([run('COMPLETED', 'SUCCESS'), run('COMPLETED', null)]), 'failure');
  assert.equal(ciConclusion([ctx('PENDING_UNKNOWN')]), 'failure');
  const r = detectUpdate(pr({ rollup: [run('COMPLETED', 'STALE')] }), { since: SINCE, nowMs: NOW });
  assert.equal(r.ciConclusion, 'failure');
});

test('W-09: 新しいコミットの数は --sha より後ろで数える（投稿前に作ったコミットを投稿後に push しても数える）', () => {
  const commits = [
    { oid: 'aaaaaaa1', committedDate: '2026-09-26T09:00:00Z' },
    { oid: 'ccccccc1', committedDate: '2026-09-26T09:50:00Z' }, // 投稿（10:00）より前に作り、後で push
    { oid: 'ddddddd1', committedDate: '2026-09-26T09:55:00Z' },
  ];
  assert.equal(countNewCommits(commits, { since: SINCE, sha: 'aaaaaaa' }), 2);
  const r = detectUpdate(pr({ head: 'ddddddd1', commits, rollup: [run('COMPLETED', 'SUCCESS')] }), {
    since: SINCE,
    sha: 'aaaaaaa1',
    nowMs: NOW,
  });
  assert.equal(r.status, 'updated');
  assert.equal(r.newCommits, 2);
  // SHAが一覧に無い（force push）か --shaが無いときは時刻で数える
  assert.equal(countNewCommits(commits, { since: '2026-09-26T09:52:00Z', sha: 'eeeeeee' }), 1);
  assert.equal(countNewCommits(commits, { since: '2026-09-26T09:52:00Z' }), 1);
});

test('W-08: 引数の誤りは null、CLI は exit 2', () => {
  assert.equal(parseArgs([]), null);
  assert.equal(parseArgs(['12']), null); // --since が無い
  assert.equal(parseArgs(['12', '--since', 'yesterday']), null);
  assert.equal(parseArgs(['12', '--since', SINCE, '--sha', 'XYZ']), null);
  assert.equal(parseArgs(['12', '--since', SINCE, '--foo', '1']), null);
  assert.equal(parseArgs(['12', '--since', SINCE, '--interval']), null);
  assert.deepEqual(parseArgs(['12', '--since', SINCE, '--sha', 'abc1234', '--interval', '30']), {
    pr: 12,
    since: SINCE,
    sha: 'abc1234',
    interval: 30,
    timeout: 4 * 60 * 60,
    grace: 180,
  });
  const res = spawnSync(process.execPath, [scriptPath, 'x'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage/);
});

test('I-17: agent-reviewはCI完了と結論の集計から除外する', () => {
  const pendingReview = { __typename: 'CheckRun', name: 'agent-review', status: 'IN_PROGRESS', conclusion: null };
  const passing = { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS' };
  assert.equal(checksComplete([pendingReview, passing]), true);
  assert.equal(ciConclusion([pendingReview, passing]), 'success');
  assert.equal(ciConclusion([pendingReview]), 'none');
  assert.equal(checksComplete([{ __typename: 'StatusContext', context: 'agent-review', state: 'PENDING' }, passing]), true);
  assert.equal(ciConclusion([{ ...pendingReview, status: 'COMPLETED', conclusion: 'FAILURE' }, passing]), 'success');
});
