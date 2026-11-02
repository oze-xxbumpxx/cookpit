// wait-for-pr.mjsの「Issueに紐づくPR」の判定と引数検査のテスト。ghは呼ばない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLinkedPr } from '../scripts/wait-for-pr.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '../scripts/wait-for-pr.mjs');

test('本文の Closes / Fixes / Resolves #N で見つける', () => {
  for (const body of ['Closes #37', 'fixes #37', 'Resolved #37 です']) {
    const pr = findLinkedPr([{ number: 40, body, headRefName: 'x' }], 37);
    assert.equal(pr?.number, 40, body);
  }
});

test('GitHub が認識した紐づけ（closingIssuesReferences）とブランチ名の末尾 -N で見つける', () => {
  assert.equal(findLinkedPr([{ number: 39, body: '', headRefName: 'devin/m1-b4', closingIssuesReferences: [{ number: 37 }] }], 37)?.number, 39);
  // #33は本文にClosesが無かったが、ブランチ名の末尾で紐づく
  assert.equal(findLinkedPr([{ number: 33, body: 'Issue #32（M1-b3）。', headRefName: 'devin/m1b3-me-contract-32' }], 32)?.number, 33);
});

test('本文で「Issue #N」と言及しただけの別 PR は紐づけとみなさない', () => {
  const prs = [{ number: 28, body: 'Issue #24 / #26 の作成と PR #25 のレビュー', headRefName: 'docs/log-devin-automation' }];
  assert.equal(findLinkedPr(prs, 24), null);
});

test('Issue の作成より前に作られた PR は対象外', () => {
  const since = '2026-09-25T22:57:13Z';
  const prs = [
    { number: 20, body: 'Closes #37', headRefName: 'a', createdAt: '2026-09-20T00:00:00Z' },
    { number: 39, body: 'Closes #37', headRefName: 'b', createdAt: '2026-09-26T00:20:27Z' },
  ];
  assert.equal(findLinkedPr(prs, 37, since)?.number, 39);
  assert.equal(findLinkedPr(prs.slice(0, 1), 37, since), null);
  // 作成日時が取れないPRも、since指定時は対象外（安全側）
  assert.equal(findLinkedPr([{ number: 41, body: 'Closes #37', headRefName: 'c' }], 37, since), null);
});

test('複数候補は曖昧として止め、小さい番号を選ばない', () => {
  const prs = [
    { number: 45, body: 'Closes #37', headRefName: 'b' },
    { number: 41, body: 'Fixes #37', headRefName: 'a' },
  ];
  assert.equal(findLinkedPr(prs, 37), null);
  assert.deepEqual(prs.map((p) => p.number), [45, 41]);
});

test('引数が不正なら終了コード 2 で gh を呼ばない', () => {
  for (const args of [[], ['abc'], ['0'], ['37', '--interval', '-1'], ['37', '--unknown', '5']]) {
    let code = 0;
    try {
      execFileSync(process.execPath, [scriptPath, ...args], { stdio: 'pipe' });
    } catch (error) {
      code = error.status;
    }
    assert.equal(code, 2, JSON.stringify(args));
  }
});

test('W-CLI: CLIとして起動してもdelegation.mjsとの読み込みの輪で止まらず、PRを見つけて0で終わる', async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'wait-for-pr-cli-'));
  try {
    // 偽のgh。Issueの作成日時とPR一覧だけ返し、ほかの呼び出し（共有状態の読み取りなど）は失敗させる。
    const gh = join(dir, 'gh');
    writeFileSync(
      gh,
      [
        '#!/bin/sh',
        'case "$1 $2" in',
        '  "issue view") echo "2026-10-10T00:00:00Z" ;;',
        `  "pr list") echo '[{"number":201,"title":"t","body":"Closes #198","headRefName":"devin/x-198","url":"https://example.test/pr/201","createdAt":"2026-10-10T01:00:00Z","closingIssuesReferences":[{"number":198}]}]' ;;`,
        '  *) exit 1 ;;',
        'esac',
      ].join('\n'),
    );
    chmodSync(gh, 0o755);
    const script = join(dirname(fileURLToPath(import.meta.url)), '../scripts/wait-for-pr.mjs');
    const result = spawnSync(process.execPath, [script, '198', '--interval', '1', '--timeout', '5'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, HARNESS_STATE_DIR: dir },
      timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /"number":201/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
