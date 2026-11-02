// record-subagent.mjs（SubagentStop Hook）の機械的記録テスト。
// 状態ディレクトリはリポジトリ外（HARNESS_STATE_DIR）。本文は保存しない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), '../hooks/record-subagent.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'record-subagent-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return {
    base,
    root,
    state,
    logPath: join(state, 'subagent-log.jsonl'),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function runHook(sb, payload, { rawInput = null } = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
    HARNESS_STATE_DIR: sb.state,
  };
  try {
    execFileSync(process.execPath, [hookPath], {
      input: rawInput ?? JSON.stringify(payload),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0 };
  } catch (error) {
    return { code: error.status ?? -1, stderr: String(error.stderr ?? '') };
  }
}

function readRecords(sb) {
  if (!existsSync(sb.logPath)) return [];
  return readFileSync(sb.logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

test('agent_type / agent_id / agent_transcript_path を記録し、本文は捨てる', () => {
  const sb = sandbox();
  try {
    const secret = 'API_KEY=super-secret-do-not-store';
    const result = runHook(sb, {
      hook_event_name: 'SubagentStop',
      session_id: 'sess-1',
      transcript_path: '/tmp/parent.jsonl',
      agent_type: 'implementer',
      agent_id: 'agent-abc',
      agent_transcript_path: '/tmp/agent-abc.jsonl',
      last_assistant_message: secret,
    });
    assert.equal(result.code, 0);
    const records = readRecords(sb);
    assert.equal(records.length, 1);
    const rec = records[0];
    assert.equal(rec.event, 'SubagentStop');
    assert.equal(rec.session_id, 'sess-1');
    assert.equal(rec.transcript_path, '/tmp/parent.jsonl');
    assert.equal(rec.agent_type, 'implementer');
    assert.equal(rec.agent_id, 'agent-abc');
    assert.equal(rec.agent_transcript_path, '/tmp/agent-abc.jsonl');
    assert.equal(rec.pending_reflection, true);
    assert.equal('last_assistant_message' in rec, false);
    const raw = readFileSync(sb.logPath, 'utf8');
    assert.equal(raw.includes(secret), false);
    assert.equal(raw.includes('last_assistant_message'), false);
  } finally {
    sb.cleanup();
  }
});

test('agent_type が無いときは agent_name を使う', () => {
  const sb = sandbox();
  try {
    const result = runHook(sb, { agent_name: 'reviewer', session_id: 's' });
    assert.equal(result.code, 0);
    const [rec] = readRecords(sb);
    assert.equal(rec.agent_type, 'reviewer');
    assert.equal(rec.agent_id, null);
    assert.equal(rec.agent_transcript_path, null);
  } finally {
    sb.cleanup();
  }
});

test('壊れた JSON でも exit 0（作業を止めない）', () => {
  const sb = sandbox();
  try {
    const result = runHook(sb, {}, { rawInput: '{not-json' });
    assert.equal(result.code, 0);
    assert.equal(existsSync(sb.logPath), false);
  } finally {
    sb.cleanup();
  }
});

test('current-feature があれば feature に載せる', () => {
  const sb = sandbox();
  try {
    const featurePath = join(sb.root, '.claude/state/current-feature');
    mkdirSync(dirname(featurePath), { recursive: true });
    writeFileSync(featurePath, 'harness-instrumentation\n');
    const result = runHook(sb, { agent_type: 'implementer' });
    assert.equal(result.code, 0);
    assert.equal(readRecords(sb)[0].feature, 'harness-instrumentation');
  } finally {
    sb.cleanup();
  }
});
