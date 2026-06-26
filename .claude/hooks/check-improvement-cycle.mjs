#!/usr/bin/env node
// Stop Hook — 改善サイクルの未実施チェック（非ブロッキング・警告のみ）
//
// 方針（docs/claude-code/improvement-cycle.md）:
// - 成果物の存在は check-deliverables.mjs が見る。本フックは「改善ループ」固有の観点だけを見る。
// - `.claude/state/current-feature` が設定された作業単位（= L2/L3 相当）で、複数 Subagent が
//   動いた（subagent-log にエントリがある）のに reflection-agent の振り返り候補が無い場合に
//   注意喚起する。L1（feature 未設定）では沈黙し誤検知を出さない。
// - 強制はしない（常に exit 0）。改善ループの起動判断は Orchestrator / 人間に委ねる。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const NOTICE_COOLDOWN_MS = 30 * 60 * 1000; // 同一警告セットを再掲しない窓（30分）

// 同一の警告セットを毎ターン繰り返さないためのデバウンス。
// 警告セットが変化したか、クールダウンを過ぎたときだけ true（= emit すべき）。
// state 読み書き失敗時は fail-open（true を返し従来どおり警告する。沈黙して隠さない）。
function shouldEmitNotice(key, feature, warnings) {
  const statePath = join(ROOT, '.claude/state/hook-notice-state.json');
  const hash = createHash('sha1')
    .update(feature)
    .digest('hex');
  let state = {};
  try {
    if (existsSync(statePath)) state = JSON.parse(readFileSync(statePath, 'utf8')) || {};
  } catch {
    return true; // 読めない → 従来どおり出す
  }
  const prev = state[key];
  const now = Date.now();
  if (prev && prev.hash === hash && now - prev.ts < NOTICE_COOLDOWN_MS) return false;
  state[key] = { hash, ts: now, feature };
  try {
    mkdirSync(join(ROOT, '.claude/state'), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    /* 書き込み失敗は致命でない。今回は出し、次回も出る（fail-open） */
  }
  return true;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readFeatureName() {
  const p = join(ROOT, '.claude/state/current-feature');
  if (!existsSync(p)) return null;
  const v = readFileSync(p, 'utf8').trim().split('\n')[0]?.trim();
  return v || null;
}

function subagentLogHasEntries() {
  const p = join(ROOT, '.claude/state/subagent-log.jsonl');
  if (!existsSync(p)) return false;
  try {
    return readFileSync(p, 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext } })
  );
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }
  if ((input.hook_event_name || 'Stop') !== 'Stop') process.exit(0);

  const feature = readFeatureName();
  if (!feature) process.exit(0); // L1 等は沈黙

  const warnings = [];
  const candidatePath = join(ROOT, `docs/claude-code/improvements/candidates/${feature}.md`);
  const reviewPath = join(ROOT, `docs/reviews/${feature}.md`);

  if (subagentLogHasEntries() && !existsSync(candidatePath)) {
    warnings.push(
      `reflection-agent の振り返り候補が未作成: docs/claude-code/improvements/candidates/${feature}.md`
    );
  }
  if (!existsSync(reviewPath)) {
    warnings.push(
      `reviewer のレビュー記録が見当たりません（L3 など保存対象なら docs/reviews/${feature}.md）`
    );
  }

  if (warnings.length && shouldEmitNotice('check-improvement-cycle:Stop', feature, warnings)) {
    emit(
      `⚠ 改善サイクル・チェック（feature: ${feature}）— 完了前に確認してください:\n` +
        warnings.map((w) => ` - ${w}`).join('\n') +
        `\n（任意。改善ループの詳細は docs/claude-code/improvement-cycle.md。` +
        `不要なら .claude/state/current-feature をクリア）`
    );
  }
  process.exit(0);
}

main();
