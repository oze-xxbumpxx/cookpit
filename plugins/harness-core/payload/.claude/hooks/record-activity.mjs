#!/usr/bin/env node
// SessionStart / UserPromptSubmit / Stop Hook — 活動タイムスタンプの機械的記録（非ブロッキング）
//
// 方針:
// - 「いつ活動があったか」という機械的事実だけを1行1 JSONで追記する。
//   会話内容・プロンプト本文・秘密情報は一切保存しない（ts / event / session_idのみ）。
// - 用途: estimate-session-time.mjsがlogs/ の「所要時間」欄を自動推定するための入力。
//   record-subagent.mjsと同じ設計（append-only / 失敗しても常にexit 0）。
// - 層: harness-core（Plugin分割時）。依存はharness-paths.mjsのみで、
//   write-work-logの「所要時間」欄をestimate-session-time.mjs経由で埋めるための入力。
// - 記録先: <永続領域>/activity-log.jsonl（harness-paths.mjsが解決。既定は
//   ~/.local/state/<ns>/ で <ns> はプロジェクト名から導出する（例: package.jsonのnameがshopならshop-harness）。
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
  // SessionEndのreason（clear / logout / other等）。会話本文は保存しない。
  if (typeof input.reason === 'string' && input.reason.trim() !== '') {
    entry.reason = input.reason.trim();
  }

  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(entry) + '\n');
  } catch {
    // 記録失敗で作業を止めない
  }
  process.exit(0);
}

main();
