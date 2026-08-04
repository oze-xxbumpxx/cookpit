#!/usr/bin/env node
// migrate-state.mjs — 旧 .claude/state/ の実データを永続領域へ移行する（冪等）。
//
// 方針:
// - **元データは削除しない**（読み取り側は永続領域 → 旧パスの順で見るため、両方あっても壊れない）。
// - 移行先に同名ファイルが既にある場合は上書きしない（重複移行の防止）。
// - 移行前に旧ディレクトリ全体のバックアップを永続領域へ作る（Git 管理外の安全な場所）。
// - 廃止済みの承認ファイルは移行対象外。
//
// 使い方:
//   node .claude/scripts/migrate-state.mjs [--dry-run]

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { legacyStateDir, repoRoot, resolveStateDir, stateDir } from '../lib/harness-paths.mjs';

const dryRun = process.argv.includes('--dry-run');

// 旧方式の承認マーカー・消費ログは移行しない。
const DEPRECATED_APPROVAL_FILES = new Set([
  'config-change-approved',
  'approval.json',
  'used-approvals.jsonl',
]);

const root = repoRoot();
const legacyDir = legacyStateDir(root);

let resolved;
try {
  resolved = resolveStateDir();
} catch (error) {
  process.stderr.write(`状態ディレクトリを解決できません: ${String(error?.message ?? error)}\n`);
  process.exit(1);
}

if (!resolved.trusted) {
  process.stderr.write(
    `移行先がリポジトリ内フォールバックです（source: ${resolved.source}）。\n` +
      'HARNESS_STATE_DIR にリポジトリ外の絶対パスを設定してから再実行してください。\n',
  );
  process.exit(1);
}

process.stdout.write(
  `移行元: ${legacyDir}\n移行先: ${resolved.dir}（source: ${resolved.source}）\n\n`,
);

if (!existsSync(legacyDir)) {
  process.stdout.write('旧状態ディレクトリがありません。移行不要です。\n');
  process.exit(0);
}

const entries = readdirSync(legacyDir).filter((name) => {
  if (DEPRECATED_APPROVAL_FILES.has(name)) return false;
  try {
    return statSync(join(legacyDir, name)).isFile();
  } catch {
    return false;
  }
});

if (entries.length === 0) {
  process.stdout.write('移行対象のファイルがありません。\n');
  process.exit(0);
}

const target = dryRun ? resolved.dir : stateDir();
const backupDir = join(
  target,
  `migration-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

const copied = [];
const skipped = [];

if (!dryRun) mkdirSync(backupDir, { recursive: true, mode: 0o700 });

for (const name of entries) {
  const from = join(legacyDir, name);
  const to = join(target, name);
  if (existsSync(to)) {
    skipped.push(`${name}（移行先に既存）`);
    continue;
  }
  if (dryRun) {
    copied.push(`${name}（dry-run）`);
    continue;
  }
  copyFileSync(from, join(backupDir, name)); // バックアップ（元は残す）
  copyFileSync(from, to);
  copied.push(name);
}

process.stdout.write(`移行: ${copied.length} 件\n`);
for (const name of copied) process.stdout.write(`  + ${name}\n`);
process.stdout.write(`スキップ: ${skipped.length} 件\n`);
for (const name of skipped) process.stdout.write(`  = ${name}\n`);
if (!dryRun && copied.length > 0) {
  process.stdout.write(`\nバックアップ: ${backupDir}\n`);
}
process.stdout.write(
  '\n旧 .claude/state/ は削除していません（読み取りは新旧どちらも参照します）。\n',
);
