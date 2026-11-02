// record-activity.mjs — 機械的事実だけを残し、本文は捨てる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), '../hooks/record-activity.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'record-activity-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return {
    base,
    root,
    state,
    logPath: join(state, 'activity-log.jsonl'),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function runHook(sb, payload) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
    HARNESS_STATE_DIR: sb.state,
  };
  try {
    execFileSync(process.execPath, [hookPath], {
      input: JSON.stringify(payload),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0 };
  } catch (error) {
    return { code: error.status ?? -1 };
  }
}

test('SessionEnd の reason を記録し、本文は捨てる', () => {
  const sb = sandbox();
  try {
    const secret = 'do-not-store-this-body';
    const result = runHook(sb, {
      hook_event_name: 'SessionEnd',
      session_id: 'sess-end',
      reason: 'clear',
      last_assistant_message: secret,
    });
    assert.equal(result.code, 0);
    const rec = JSON.parse(readFileSync(sb.logPath, 'utf8').trim());
    assert.equal(rec.event, 'SessionEnd');
    assert.equal(rec.session_id, 'sess-end');
    assert.equal(rec.reason, 'clear');
    assert.equal('last_assistant_message' in rec, false);
    assert.equal(readFileSync(sb.logPath, 'utf8').includes(secret), false);
  } finally {
    sb.cleanup();
  }
});

test('壊れた JSON でも exit 0', () => {
  const sb = sandbox();
  try {
    execFileSync(process.execPath, [hookPath], {
      input: '{nope',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: sb.root,
        HARNESS_STATE_DIR: sb.state,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(existsSync(sb.logPath), false);
  } finally {
    sb.cleanup();
  }
});
