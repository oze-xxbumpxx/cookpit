// estimate-session-time.mjs — 対象日のgit窓が48時間固定ではないこと。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '../scripts/estimate-session-time.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'estimate-session-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return {
    base,
    root,
    state,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function git(root, args, extraEnv = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initRepo(root) {
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
}

function commitAt(root, isoDate, message) {
  writeFileSync(join(root, 'note.txt'), `${message}\n`);
  git(root, ['add', 'note.txt']);
  git(root, ['commit', '-m', message], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

function runEstimate(sb, day, extraEnv = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
    HARNESS_STATE_DIR: sb.state,
    HARNESS_TZ: 'Asia/Tokyo',
    ...extraEnv,
  };
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, day], {
      env,
      encoding: 'utf8',
      cwd: sb.root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (error) {
    return {
      code: error.status ?? -1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

test('3 日前のコミットも対象日を指定すれば拾う（旧 48h 窓では消えていた）', () => {
  const sb = sandbox();
  try {
    initRepo(sb.root);
    commitAt(sb.root, '2020-01-15T10:00:00+09:00', 'old-day');
    const found = runEstimate(sb, '2020-01-15');
    assert.equal(found.code, 0);
    assert.match(found.stdout, /コミット1件/);
    assert.match(found.stdout, /2020-01-15/);
    assert.doesNotMatch(found.stdout, /記録なし/);

    const otherDay = runEstimate(sb, '2020-01-16');
    assert.equal(otherDay.code, 0);
    assert.match(otherDay.stdout, /記録なし/);
  } finally {
    sb.cleanup();
  }
});

test('不正な日付は usage で exit 2', () => {
  const sb = sandbox();
  try {
    const result = runEstimate(sb, 'last-week');
    assert.equal(result.code, 2);
    assert.match(result.stderr, /usage:/);
  } finally {
    sb.cleanup();
  }
});
