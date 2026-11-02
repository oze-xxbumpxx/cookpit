#!/usr/bin/env node
// PreCompact Hook — コンパクション前に機械的な作業状態を再注入する（非ブロッキング）
//
// 方針:
// - 長いセッションでfeature名や「所要時間が未記録」が要約から落ちるのを防ぐ。
// - 会話本文・custom_instructions・秘密情報は出さない。
// - コンパクション自体は止めない（常にexit 0）。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveReadablePath } from '../lib/harness-paths.mjs';
import { dayInTz } from '../lib/harness-time.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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

function timeUnrecorded(today) {
  try {
    const p = join(ROOT, `logs/${today}.md`);
    if (!existsSync(p)) return `今日の作業ログ logs/${today}.md は未作成`;
    const content = readFileSync(p, 'utf8');
    const idx = content.indexOf('## 所要時間');
    if (idx === -1) return `logs/${today}.md に「所要時間」節が無い`;
    const section = content.slice(idx + '## 所要時間'.length).split('\n## ')[0];
    const body = section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
    if (/\d+\s*(分|時間|h)\b/i.test(body)) return null;
    if (body === '' || body === '記録なし' || body === '[作業時間]') {
      return `logs/${today}.md の所要時間が未記録。締めるときは close-session を使う`;
    }
    return null;
  } catch {
    return null;
  }
}

function main() {
  try {
    JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const today = dayInTz();
  const feature = readFeatureName();
  const lines = [
    feature
      ? `current-feature: ${feature}`
      : 'current-feature: 未設定（L0/L1 または未記入）',
  ];
  const timeNote = timeUnrecorded(today);
  if (timeNote) lines.push(timeNote);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreCompact',
        additionalContext: lines.join('\n'),
      },
    }),
  );
  process.exit(0);
}

main();
