// E2E 結果判定のテスト（未実行・0 件・全 skip を成功扱いにしないこと）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate, summarize } from '../scripts/assert-e2e-results.mjs';

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/assert-e2e-results.mjs',
);

function report(tests) {
  return { suites: [{ specs: tests.map((status) => ({ tests: [{ status }] })) }] };
}

function runScript(args) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? '') };
  }
}

test('入れ子スイートを走査して件数を数える', () => {
  const nested = {
    suites: [
      {
        specs: [{ tests: [{ status: 'expected' }] }],
        suites: [{ specs: [{ tests: [{ status: 'expected' }, { status: 'skipped' }] }] }],
      },
    ],
  };
  assert.deepEqual(summarize(nested), {
    total: 3,
    passed: 2,
    failed: 0,
    skipped: 1,
    flaky: 0,
    other: 0,
  });
});

test('1 件以上が成功していれば OK', () => {
  assert.equal(evaluate(report(['expected'])).ok, true);
});

test('テスト 0 件を成功扱いにしない', () => {
  const result = evaluate({ suites: [] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /1 件も収集されませんでした/);
});

test('空のスイートを成功扱いにしない', () => {
  const result = evaluate({ suites: [{ specs: [] }] });
  assert.equal(result.ok, false);
});

test('全件 skip を成功扱いにしない', () => {
  const result = evaluate(report(['skipped', 'skipped']));
  assert.equal(result.ok, false);
  assert.match(result.reason, /全件 skip/);
});

test('失敗が 1 件でもあれば失敗', () => {
  const result = evaluate(report(['expected', 'unexpected']));
  assert.equal(result.ok, false);
  assert.match(result.reason, /失敗テストが 1 件/);
});

test('レポートが存在しなければ非ゼロ終了する（未実行の検出）', () => {
  const { code } = runScript([join(tmpdir(), 'definitely-missing-report.json')]);
  assert.equal(code, 1);
});

test('レポートが壊れていれば非ゼロ終了する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-report-'));
  try {
    const path = join(dir, 'report.json');
    writeFileSync(path, '{ broken');
    assert.equal(runScript([path]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: 成功レポートは 0、0 件レポートは非ゼロ', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-report-'));
  try {
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify(report(['expected'])));
    assert.equal(runScript([good]).code, 0);

    const empty = join(dir, 'empty.json');
    writeFileSync(empty, JSON.stringify({ suites: [] }));
    assert.equal(runScript([empty]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--min-tests で下限を引き上げられる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-report-'));
  try {
    const path = join(dir, 'one.json');
    writeFileSync(path, JSON.stringify(report(['expected'])));
    assert.equal(runScript([path]).code, 0);
    assert.equal(runScript([path, '--min-tests', '2']).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
