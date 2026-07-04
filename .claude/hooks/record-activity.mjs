#!/usr/bin/env node
// SessionStart / UserPromptSubmit / Stop Hook — 活動タイムスタンプの機械的記録（非ブロッキング）
//
// 方針:
// - 「いつ活動があったか」という機械的事実だけを 1 行 1 JSON で追記する。
//   会話内容・プロンプト本文・秘密情報は一切保存しない（ts / event / session_id のみ）。
// - 用途: estimate-session-time.mjs が logs/ の「所要時間」欄を自動推定するための入力。
//   record-subagent.mjs と同じ設計（append-only / 失敗しても常に exit 0）。
// - 記録先: .claude/state/activity-log.jsonl（gitignore 済み・エフェメラル環境ではセッション限り）。

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LOG = join(ROOT, '.claude/state/activity-log.jsonl');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const entry = {
    ts: new Date().toISOString(),
    event: input.hook_event_name || 'unknown',
    session_id: input.session_id || null,
  };

  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(entry) + '\n');
  } catch {
    // 記録失敗で作業を止めない
  }
  process.exit(0);
}

main();
