#!/usr/bin/env node
// assert-e2e-results.mjs — E2E が「実際に実行され、1 件以上通り、失敗が無い」ことを検証する。
//
// 目的: 「テスト未実行」と「テスト成功」を CI 上で区別する（偽の成功の排除）。
// Playwright の JSON レポートを読み、次のいずれかに該当したら非ゼロ終了する。
//   - レポートが存在しない／壊れている（＝ランナーが起動しなかった疑い）
//   - 実行されたテストが 0 件
//   - 失敗・タイムアウト・中断が 1 件以上ある
//   - 全件が skip（実行されたとみなさない）
//
// 使い方:
//   node .claude/scripts/assert-e2e-results.mjs <report.json> [--min-tests 1]
//
// 純粋関数 summarize() はハーネステストから直接検証する。

import { existsSync, readFileSync } from 'node:fs';

/** Playwright JSON レポートを走査して結果を数える。 */
export function summarize(report) {
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, other: 0 };

  const visitSpec = (spec) => {
    for (const test of spec.tests ?? []) {
      counts.total += 1;
      const status = test.status ?? 'other';
      if (status === 'expected') counts.passed += 1;
      else if (status === 'unexpected') counts.failed += 1;
      else if (status === 'skipped') counts.skipped += 1;
      else if (status === 'flaky') counts.flaky += 1;
      else counts.other += 1;
    }
  };

  const visitSuite = (suite) => {
    for (const spec of suite.specs ?? []) visitSpec(spec);
    for (const child of suite.suites ?? []) visitSuite(child);
  };

  for (const suite of report?.suites ?? []) visitSuite(suite);
  return counts;
}

/**
 * 判定する。
 * @returns {{ ok: boolean, reason: string, counts: object }}
 */
export function evaluate(report, { minTests = 1 } = {}) {
  const counts = summarize(report);
  const executed = counts.passed + counts.failed + counts.flaky + counts.other;

  if (counts.failed > 0) {
    return { ok: false, reason: `失敗テストが ${counts.failed} 件あります`, counts };
  }
  if (counts.total === 0) {
    return { ok: false, reason: 'テストが 1 件も収集されませんでした（未実行）', counts };
  }
  if (executed < minTests) {
    return {
      ok: false,
      reason: `実行されたテストが ${executed} 件で下限 ${minTests} 件を下回ります（全件 skip の可能性）`,
      counts,
    };
  }
  return { ok: true, reason: '正常', counts };
}

function main() {
  const argv = process.argv.slice(2);
  const reportPath = argv.find((a) => !a.startsWith('--'));
  const minIndex = argv.indexOf('--min-tests');
  const minTests = minIndex >= 0 ? Number(argv[minIndex + 1]) : 1;

  if (!reportPath) {
    process.stderr.write('usage: assert-e2e-results.mjs <report.json> [--min-tests N]\n');
    process.exit(2);
  }
  if (!existsSync(reportPath)) {
    process.stderr.write(
      `✗ E2E レポートがありません: ${reportPath}\n` +
        '  テストランナーが起動しなかった可能性があります（未実行を成功として扱いません）。\n',
    );
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`✗ E2E レポートを解析できません: ${String(error?.message ?? error)}\n`);
    process.exit(1);
  }

  const result = evaluate(report, { minTests });
  const { counts } = result;
  process.stdout.write(
    `E2E 結果: total=${counts.total} passed=${counts.passed} failed=${counts.failed} ` +
      `skipped=${counts.skipped} flaky=${counts.flaky}\n`,
  );

  if (!result.ok) {
    process.stderr.write(`✗ E2E 判定: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write('✓ E2E 判定: 実行済み・全件成功\n');
}

if (process.argv[1] && process.argv[1].endsWith('assert-e2e-results.mjs')) {
  main();
}
