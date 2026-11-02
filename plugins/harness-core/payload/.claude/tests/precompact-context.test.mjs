// precompact-context.mjs — feature名と所要時間の未記録だけを再注入する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayInTz } from '../lib/harness-time.mjs';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), '../hooks/precompact-context.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'precompact-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { base, root, state, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function runHook(sb, payload = { hook_event_name: 'PreCompact', trigger: 'auto' }, extraEnv = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
    HARNESS_STATE_DIR: sb.state,
    HARNESS_TZ: 'UTC',
    ...extraEnv,
  };
  const stdout = execFileSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

test('feature 未設定とログ未作成を additionalContext に載せる', () => {
  const sb = sandbox();
  try {
    const out = runHook(sb);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreCompact');
    const ctx = out.hookSpecificOutput.additionalContext;
    assert.match(ctx, /current-feature: 未設定/);
    assert.match(ctx, /作業ログ .* は未作成/);
    assert.doesNotMatch(ctx, /custom_instructions|secret|API_KEY/);
  } finally {
    sb.cleanup();
  }
});

test('current-feature と所要時間未記録を載せ、本文は捨てる', () => {
  const sb = sandbox();
  try {
    mkdirSync(join(sb.root, '.claude/state'), { recursive: true });
    writeFileSync(join(sb.root, '.claude/state/current-feature'), 'demo-feature\n');
    const today = dayInTz(new Date(), 'UTC');
    mkdirSync(join(sb.root, 'logs'), { recursive: true });
    writeFileSync(join(sb.root, `logs/${today}.md`), `# ${today}\n\n## 所要時間\n\n記録なし\n`);
    const out = runHook(
      sb,
      {
        hook_event_name: 'PreCompact',
        trigger: 'manual',
        custom_instructions: 'drop secrets please',
      },
      { HARNESS_TZ: 'UTC' },
    );
    const ctx = out.hookSpecificOutput.additionalContext;
    assert.match(ctx, /current-feature: demo-feature/);
    assert.match(ctx, /所要時間が未記録/);
    assert.doesNotMatch(ctx, /drop secrets/);
  } finally {
    sb.cleanup();
  }
});
