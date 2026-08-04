#!/usr/bin/env node
// 作業ログ（logs/YYYY-MM-DD.md）の「所要時間」欄を自動推定する。
//
// 層: harness-core（Plugin 分割時）。write-work-log（core）の雛形にある「所要時間」節を
// 埋めるため core に置く。メトリクスの*集計*側は improvement 層。
//
// 使い方:
//   node .claude/scripts/estimate-session-time.mjs [YYYY-MM-DD]
//   （日付省略時は HARNESS_TZ（旧 COOKPIT_TZ・既定 Asia/Tokyo）での今日）
//
// 入力ソース（あるものだけ使う。どれも無ければ「記録なし」を出力して正常終了）:
//   1. .claude/state/activity-log.jsonl — record-activity.mjs Hook の活動タイムスタンプ
//   2. git log（現在ブランチ）の当日コミット時刻
//
// 推定方法:
//   全イベントを時刻順に並べ、連続イベント間の間隔を GAP_CAP_MIN（既定 30 分）で
//   打ち切って合計 = 「活動時間」。休憩や放置の長い空白を作業時間に数えないため。
//   併せて「セッション帯（最初〜最後）」も出す。
// 出力: そのまま logs/ に貼れる 1 行の Markdown。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { resolveReadablePath } from '../lib/harness-paths.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// COOKPIT_* は旧名（後方互換）。新規は HARNESS_* を使う。
const TZ = process.env.HARNESS_TZ || process.env.COOKPIT_TZ || 'Asia/Tokyo';
const GAP_CAP_MIN = Number(
  process.env.HARNESS_GAP_CAP_MIN || process.env.COOKPIT_GAP_CAP_MIN || 30,
);

function dayInTz(date) {
  // en-CA ロケールは YYYY-MM-DD 形式を返す
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}
function timeInTz(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const targetDay = process.argv[2] || dayInTz(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDay)) {
  console.error('usage: estimate-session-time.mjs [YYYY-MM-DD]');
  process.exit(2);
}

const timestamps = [];
let activityCount = 0;
let commitCount = 0;

// 1. 活動ログ（Hook）。永続領域を優先し、旧 .claude/state/ もフォールバックで読む
const activityLog = resolveReadablePath('activity-log.jsonl') ?? '';
if (activityLog !== '' && existsSync(activityLog)) {
  for (const line of readFileSync(activityLog, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const d = new Date(JSON.parse(line).ts);
      if (!Number.isNaN(d.getTime()) && dayInTz(d) === targetDay) {
        timestamps.push(d);
        activityCount++;
      }
    } catch {
      // 壊れた行は無視
    }
  }
}

// 2. 当日コミット（現在ブランチ）
try {
  const out = execSync('git log --format=%aI --since="48 hours ago" HEAD', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const d = new Date(line.trim());
    if (!Number.isNaN(d.getTime()) && dayInTz(d) === targetDay) {
      timestamps.push(d);
      commitCount++;
    }
  }
} catch {
  // git が使えない環境でも活動ログだけで推定する
}

if (timestamps.length === 0) {
  console.log(`記録なし（${targetDay} の活動ログ・コミットが見つからない）`);
  process.exit(0);
}

timestamps.sort((a, b) => a.getTime() - b.getTime());
const first = timestamps[0];
const last = timestamps[timestamps.length - 1];

let activeMs = 0;
for (let i = 1; i < timestamps.length; i++) {
  const gap = timestamps[i].getTime() - timestamps[i - 1].getTime();
  activeMs += Math.min(gap, GAP_CAP_MIN * 60_000);
}

function fmtDuration(ms) {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `約${m}分`;
  return `約${h}時間${m > 0 ? `${m}分` : ''}`;
}

const sources = [
  activityCount > 0 ? `活動イベント${activityCount}件` : null,
  commitCount > 0 ? `コミット${commitCount}件` : null,
]
  .filter(Boolean)
  .join('・');

if (timestamps.length === 1) {
  console.log(
    `${fmtDuration(10 * 60_000)}未満と推定（${targetDay} のイベントが1件のみ: ${timeInTz(first)} ${TZ} / ${sources}）`,
  );
} else {
  console.log(
    `${fmtDuration(activeMs)}（自動推定・活動時間ベース / セッション帯 ${timeInTz(first)}〜${timeInTz(last)} ${TZ} / ${sources} / 空白${GAP_CAP_MIN}分超は除外）`,
  );
}
