#!/usr/bin/env node
// Stop Hook — 改善サイクルの未実施チェック（非ブロッキング・警告のみ）
//
// 方針（docs/claude-code/improvement-cycle.md）:
// - 成果物の存在は check-deliverables.mjs が見る。本フックは「改善ループ」固有の観点だけを見る。
// - `.claude/state/current-feature` が設定された作業単位（= L2/L3 相当）で、複数 Subagent が
//   動いた（subagent-log にエントリがある）のに reflection-agent の振り返り候補が無い場合に
//   注意喚起する。L1（feature 未設定）では沈黙し誤検知を出さない。
// - 強制はしない（常に exit 0）。改善ループの起動判断は Orchestrator / 人間に委ねる。

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { uncovered as reviewTasksUncovered } from '../scripts/check-review-coverage.mjs';
import { resolveReadablePath, safeStatePath } from '../lib/harness-paths.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const NOTICE_COOLDOWN_MS = 30 * 60 * 1000; // 同一警告セットを再掲しない窓（30分）
const LOG_STALE_DAYS = 3; // 作業ログがこの日数より古ければ督促（feature 未設定でも出す）

// 同一の警告セットを毎ターン繰り返さないためのデバウンス。
// 警告セットが変化したか、クールダウンを過ぎたときだけ true（= emit すべき）。
// state 読み書き失敗時は fail-open（true を返し従来どおり警告する。沈黙して隠さない）。
function shouldEmitNotice(key, feature, warnings) {
  const statePath = safeStatePath('hook-notice-state.json');
  const hash = createHash('sha1').update(feature).digest('hex');
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
  const p = resolveReadablePath('current-feature');
  if (p === null || !existsSync(p)) return null;
  const v = readFileSync(p, 'utf8').trim().split('\n')[0]?.trim();
  return v || null;
}

function subagentLogHasEntries() {
  const p = resolveReadablePath('subagent-log.jsonl');
  if (p === null || !existsSync(p)) return false;
  try {
    return readFileSync(p, 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

// logs/YYYY-MM-DD.md の最新日付が LOG_STALE_DAYS より古ければ警告文字列を返す。
// ログが 1 本も無い・読めない場合は沈黙（fail-open で作業を妨げない）。
function staleWorkLogWarning() {
  try {
    const files = readdirSync(join(ROOT, 'logs'))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort();
    const latest = files[files.length - 1];
    if (!latest) return null;
    const latestDate = new Date(`${latest.slice(0, 10)}T00:00:00Z`);
    const ageDays = (Date.now() - latestDate.getTime()) / 86_400_000;
    if (ageDays <= LOG_STALE_DAYS) return null;
    return (
      `作業ログが ${Math.floor(ageDays)} 日更新されていません（最新: logs/${latest}）。` +
      `write-work-log スキルで今日のログを追記してください`
    );
  } catch {
    return null;
  }
}

// 今日のログの「所要時間」が未記録なら close-session を促す（R5・2026-07-06）。
// 発動忘れで「所要時間: 記録なし」が常態化する再発対策（7/5 も再発）。
// 30 分クールダウン（shouldEmitNotice）で毎ターンのノイズにはしない。常に非ブロッキング。
//
// 判定はセクション本文の「完全一致」寄りにする（meal-plan-core 事象1）。
// 部分一致だと「約 30 分（…先行セッションは記録なし）」のような注記付き記録済み行を
// 未記録と誤判定するため、trim 後の本文行がプレースホルダのみ／空のときだけ未記録とする。
// 時間表現（数字 + 分/時間/h）があれば記録済みとみなす。
function timeUnrecordedNudge() {
  try {
    // COOKPIT_TZ は旧名（後方互換）。新規は HARNESS_TZ を使う。
    const tz = process.env.HARNESS_TZ || process.env.COOKPIT_TZ || 'Asia/Tokyo';
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: tz });
    const p = join(ROOT, `logs/${today}.md`);
    if (!existsSync(p)) return null;
    const content = readFileSync(p, 'utf8');
    const idx = content.indexOf('## 所要時間');
    if (idx === -1) return null;
    const section = content.slice(idx + '## 所要時間'.length).split('\n## ')[0];
    const body = section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
    if (/\d+\s*(分|時間|h)\b/i.test(body)) return null;
    const unrecorded = body === '' || body === '記録なし' || body === '[作業時間]';
    if (!unrecorded) return null;
    return {
      date: today,
      message:
        `今日のログ（logs/${today}.md）の所要時間が未記録です。` +
        `セッションを締めるときは close-session スキルを使ってください（所要時間の自動推定込み）`,
    };
  } catch {
    return null;
  }
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext } }),
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

  const notices = [];

  // 作業ログの鮮度は feature の有無に関係なく確認する（引き継ぎ切れ対策）
  const logWarn = staleWorkLogWarning();
  const today = new Date().toISOString().slice(0, 10);
  if (logWarn && shouldEmitNotice('work-log-staleness:Stop', `log:${today}`, [logWarn])) {
    notices.push(`⚠ ${logWarn}`);
  }

  // close-session の発動忘れナッジ（今日のログの所要時間が未記録のとき・30分毎まで）
  const timeNudge = timeUnrecordedNudge();
  if (
    timeNudge &&
    shouldEmitNotice('close-session-nudge:Stop', `time:${timeNudge.date}`, [timeNudge.message])
  ) {
    notices.push(`ℹ ${timeNudge.message}`);
  }

  const feature = readFeatureName();
  if (feature) {
    const warnings = [];
    const candidatePath = join(ROOT, `docs/claude-code/improvements/candidates/${feature}.md`);
    const reviewPath = join(ROOT, `docs/reviews/${feature}.md`);

    if (subagentLogHasEntries() && !existsSync(candidatePath)) {
      warnings.push(
        `reflection-agent の振り返り候補が未作成: docs/claude-code/improvements/candidates/${feature}.md`,
      );
    }
    // Codex ルート feature は Task 単位の網羅を見る（存在だけでは Task 2/3 欠落を見逃す。pantry-core 事象 2）
    const tasksDir = join(ROOT, `docs/tasks/codex/${feature}`);
    if (existsSync(tasksDir)) {
      const uncoveredTasks = reviewTasksUncovered(feature);
      if (uncoveredTasks.length) {
        warnings.push(
          `docs/reviews/${feature}.md に受け入れレビュー記録が無い Codex Task: ` +
            `${uncoveredTasks.map((n) => `Task ${n}`).join(' / ')}` +
            `（未着手 Task は無視可。main マージ済みなら記録が完了条件）`,
        );
      }
    } else if (!existsSync(reviewPath)) {
      warnings.push(
        `reviewer のレビュー記録が見当たりません（L3 など保存対象なら docs/reviews/${feature}.md）`,
      );
    }

    if (warnings.length && shouldEmitNotice('check-improvement-cycle:Stop', feature, warnings)) {
      notices.push(
        `⚠ 改善サイクル・チェック（feature: ${feature}）— 完了前に確認してください:\n` +
          warnings.map((w) => ` - ${w}`).join('\n') +
          `\n（任意。改善ループの詳細は docs/claude-code/improvement-cycle.md。` +
          `不要なら .claude/state/current-feature をクリア）`,
      );
    }
  }

  if (notices.length) emit(notices.join('\n'));
  process.exit(0);
}

main();
