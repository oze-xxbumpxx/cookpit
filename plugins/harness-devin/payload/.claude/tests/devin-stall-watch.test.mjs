import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findIssueBranch, judgeStall } from '../scripts/devin-stall-watch.mjs';

const base = { elapsedSec: 0, logBytes: 100, offset: 100, branchFound: false, firstOutputSec: 300, branchSec: 3600 };

test('ブランチができていれば、発言や時間に関係なく branch', () => {
  assert.equal(judgeStall({ ...base, branchFound: true, elapsedSec: 99999 }), 'branch');
});

test('起動直前より発言が増えないまま first-output を過ぎたら no-output（前のセッションの発言は数えない）', () => {
  assert.equal(judgeStall({ ...base, logBytes: 100, elapsedSec: 299 }), 'wait');
  assert.equal(judgeStall({ ...base, logBytes: 100, elapsedSec: 300 }), 'no-output');
  // 前のセッションの発言でログが5000バイトあっても、offsetから増えていなければno-output
  assert.equal(judgeStall({ ...base, offset: 5000, logBytes: 5000, elapsedSec: 400 }), 'no-output');
});

test('発言はあるがブランチが branch 秒までにできなければ no-branch', () => {
  assert.equal(judgeStall({ ...base, logBytes: 180, elapsedSec: 3599 }), 'wait');
  assert.equal(judgeStall({ ...base, logBytes: 180, elapsedSec: 3600 }), 'no-branch');
});

test('ブランチ名の末尾が -<issue> の devin/ ブランチだけを拾う', () => {
  const out = [
    'aaa\trefs/heads/devin/m2-visual-fixes-91',
    'bbb\trefs/heads/devin/m2-now-line-192',
    'ccc\trefs/heads/claude/x-91',
  ].join('\n');
  assert.equal(findIssueBranch(out, 91), 'devin/m2-visual-fixes-91');
  assert.equal(findIssueBranch(out, 92), null);
});

test('引数が足りないと終了コード 2', () => {
  const cli = fileURLToPath(new URL('../scripts/devin-stall-watch.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli, '91', '--log', '/tmp/x.log'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
