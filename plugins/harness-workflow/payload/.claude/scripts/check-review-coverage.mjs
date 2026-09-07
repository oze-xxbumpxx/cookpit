#!/usr/bin/env node
// check-review-coverage.mjs — Codex ルート feature の受け入れレビュー記録の Task 網羅を照合する
// 使い方: node .claude/scripts/check-review-coverage.mjs <feature>
// 出力: ブリーフはあるが docs/reviews/<feature>.md に「## Task N」見出しが無い Task 番号の配列（JSON）
// 非ブロッキング前提（呼び出し側が警告表示に使う）。exit は常に 0。
// 出典: IMP-2026-026（pantry-core 事象 2 — ファイル存在チェックだけでは Task 2/3 の欠落を見逃す）
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

export function uncovered(feature) {
  if (!feature) return [];
  const tasksDir = join(ROOT, `docs/tasks/codex/${feature}`);
  if (!existsSync(tasksDir)) return []; // Codex ルートでなければ対象外
  const briefTasks = readdirSync(tasksDir)
    .map((f) => f.match(/^(\d{2})-.+\.md$/)) // NN-<layer>.md（README 除外）
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const reviewPath = join(ROOT, `docs/reviews/${feature}.md`);
  const review = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : '';
  const recorded = new Set([...review.matchAll(/^##\s*Task\s*(\d+)/gim)].map((m) => Number(m[1])));
  return briefTasks.filter((n) => !recorded.has(n)).sort((a, b) => a - b);
}

// CLI として直接実行されたときのみ出力する（check-improvement-cycle.mjs からは import で使う）
if (process.argv[1] && process.argv[1].endsWith('check-review-coverage.mjs')) {
  process.stdout.write(JSON.stringify(uncovered(process.argv[2])));
}
