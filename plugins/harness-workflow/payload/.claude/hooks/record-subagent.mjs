#!/usr/bin/env node
// SubagentStop Hook — Subagent完了の機械的記録（非ブロッキング）
//
// 方針（docs/claude-code/improvement-cycle.md）:
// - Command Hookは「いつ・どの作業単位で・どのSubagent実行が終わったか」という機械的事実
//   だけを記録する。成果/失敗/未解決/Memory候補などの意味的な抽出は振り返り工程が
//   transcriptと成果物を読んで行う（LLM判断が必要なためCommand Hookでは決めない）。
// - 記録先: <永続領域>/subagent-log.jsonl（1行1 JSON、追記のみ。リポジトリ外の永続領域）。
// - 失敗しても処理はブロックしない（常にexit 0）。

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

/** 空文字は「無い」とみなしnull。非文字列はnull（本文を誤って保存しない）。 */
function optionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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
    // SubagentStop入力の機械的事実（Claude Code 2026-09時点）。
    // agent_typeが無い古い入力ではagent_nameを使う。
    agent_type: optionalString(input.agent_type) ?? optionalString(input.agent_name),
    agent_id: optionalString(input.agent_id),
    agent_transcript_path: optionalString(input.agent_transcript_path),
    // last_assistant_messageは会話本文になり得るので保存しない（秘密・全文ポリシー）。
    // 抽出すべき意味項目（振り返り工程がtranscriptから埋める）:
    // 成果 / 失敗 / 未解決 / 引き継ぎ情報 / Memory候補 / 改善候補
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
