#!/usr/bin/env node
// SessionStart / UserPromptSubmit / Stop Hook — 活動タイムスタンプの機械的記録（非ブロッキング）
//
// 方針:
// - 「いつ活動があったか」という機械的事実だけを 1 行 1 JSON で追記する。
//   会話内容・プロンプト本文・秘密情報は一切保存しない（ts / event / session_id のみ）。
// - 用途: estimate-session-time.mjs が logs/ の「所要時間」欄を自動推定するための入力。
//   record-subagent.mjs と同じ設計（append-only / 失敗しても常に exit 0）。
// - 層: harness-core（Plugin 分割時）。依存は harness-paths.mjs のみで、
//   write-work-log の「所要時間」欄を estimate-session-time.mjs 経由で埋めるための入力。
// - 記録先: <永続領域>/activity-log.jsonl（harness-paths.mjs が解決。既定は
//   ~/.local/state/<ns>/ で <ns> はプロジェクト名から導出する（Cookpit では cookpit-harness）。
//   リポジトリ外のためコンテナ回収でも失われない）。

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeStatePath } from '../lib/harness-paths.mjs';

// 保存先はリポジトリ外の永続領域（解決できないときだけ旧 .claude/state/ へフォールバック）
const LOG = safeStatePath('activity-log.jsonl');

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
