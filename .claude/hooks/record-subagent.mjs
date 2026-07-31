#!/usr/bin/env node
// SubagentStop Hook — Subagent 完了の機械的記録（非ブロッキング）
//
// 方針（docs/claude-code/improvement-cycle.md）:
// - Command Hook は「いつ・どの作業単位で・どの Subagent 実行が終わったか」という機械的事実
//   だけを記録する。成果/失敗/未解決/Memory候補などの意味的な抽出は振り返り工程が
//   transcript と成果物を読んで行う（LLM 判断が必要なため Command Hook では決めない）。
// - 記録先: <永続領域>/subagent-log.jsonl（1 行 1 JSON、追記のみ。リポジトリ外の永続領域）。
// - 失敗しても処理はブロックしない（常に exit 0）。

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveReadablePath, safeStatePath } from '../lib/harness-paths.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readFeatureName() {
  try {
    const p = resolveReadablePath('current-feature');
    if (p === null || !existsSync(p)) return null;
    const v = readFileSync(p, 'utf8').trim().split('\n')[0]?.trim();
    return v || null;
  } catch {
    return null;
  }
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const record = {
    ts: new Date().toISOString(),
    event: input.hook_event_name || 'SubagentStop',
    feature: readFeatureName(),
    session_id: input.session_id ?? null,
    transcript_path: input.transcript_path ?? null,
    // 抽出すべき意味項目（振り返り工程が transcript から埋める）:
    // agent_name / 成果 / 失敗 / 未解決 / 引き継ぎ情報 / Memory候補 / 改善候補
    pending_reflection: true,
  };

  try {
    const logPath = safeStatePath('subagent-log.jsonl');
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch {
    // 記録失敗でも開発は止めない
  }

  process.exit(0);
}

main();
