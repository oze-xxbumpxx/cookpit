// guard-dangerous.mjs（PreToolUse Hook）の安全境界テスト。
// 実際にフックをサブプロセスとして起動し、終了コードで allow(0) / deny(2) を検証する。
// ユーザー環境は変更せず、一時ディレクトリとダミー run 状態だけを使う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { APPROVAL_FILENAME, APPROVAL_SCHEMA_VERSION, OPERATION_CONFIG_CHANGE } from '../lib/harness-approval.mjs';
import { RUN_STATE_FILENAME, createRunState } from '../lib/harness-state.mjs';

// 既定はリポジトリ内の実フック。GUARD_HOOK_PATH で差し替えられるのは、保護対象のため
// まだ適用できない候補版を適用前に検証するため（CI では常に既定＝実フックを検証する）。
const hookPath =
  process.env.GUARD_HOOK_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), '../hooks/guard-dangerous.mjs');

const ALLOW = 0;
const DENY = 2;

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'guard-hook-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  const run = createRunState({ taskId: 'guard-test' });
  writeFileSync(join(state, RUN_STATE_FILENAME), JSON.stringify(run));
  return {
    base,
    root,
    state,
    runId: run.runId,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function approve(sb, overrides = {}) {
  const now = Date.now();
  const approval = {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: randomUUID(),
    runId: sb.runId,
    operation: OPERATION_CONFIG_CHANGE,
    target: '.claude/hooks/',
    approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    approvedBy: 'human',
    ...overrides,
  };
  writeFileSync(join(sb.state, APPROVAL_FILENAME), JSON.stringify(approval));
  return approval;
}

/** フックを起動して終了コードを返す。rawInput を渡すと JSON 化せずそのまま送る。 */
function runHook(sb, payload, { rawInput = null, env: extraEnv = {} } = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
    HARNESS_STATE_DIR: sb.state,
    ...extraEnv,
  };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete env[key];
  }
  try {
    execFileSync(process.execPath, [hookPath], {
      input: rawInput ?? JSON.stringify(payload),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (error) {
    return { code: error.status ?? -1, stderr: String(error.stderr ?? '') };
  }
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } });
const read = (file_path) => ({ tool_name: 'Read', tool_input: { file_path } });

// ── 通常操作は妨げない ─────────────────────────────────────

test('通常のコマンドとソース読み取りは許可する', () => {
  const sb = sandbox();
  try {
    assert.equal(runHook(sb, bash('pnpm lint')).code, ALLOW);
    assert.equal(runHook(sb, bash('git status')).code, ALLOW);
    assert.equal(runHook(sb, bash('rg "useCase" packages/')).code, ALLOW);
    assert.equal(runHook(sb, read('packages/domain/src/recipe/recipe.ts')).code, ALLOW);
    assert.equal(runHook(sb, read('.claude/hooks/guard-dangerous.mjs')).code, ALLOW);
    assert.equal(runHook(sb, write('docs/designs/foo.md')).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

// ── 既存の危険操作ガード（回帰） ───────────────────────────

test('破壊的・本番影響コマンドを拒否する', () => {
  const sb = sandbox();
  try {
    for (const command of [
      'git push --force origin main',
      'git reset --hard HEAD~3',
      'pnpm publish',
      'terraform apply',
      'sst deploy',
      'rm -rf /',
      'rm -rf $HOME',
    ]) {
      assert.equal(runHook(sb, bash(command)).code, DENY, `許可されています: ${command}`);
    }
  } finally {
    sb.cleanup();
  }
});

test('秘密情報の読み取りを拒否する', () => {
  const sb = sandbox();
  try {
    assert.equal(runHook(sb, bash('cat .env')).code, DENY);
    assert.equal(runHook(sb, bash('printenv')).code, DENY);
    assert.equal(runHook(sb, read('/repo/.env')).code, DENY);
    assert.equal(runHook(sb, read('apps/web/.env.local')).code, DENY);
    // テンプレートは許可（誤検知を出さない）
    assert.equal(runHook(sb, read('apps/web/.env.example')).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

// ── 目的A: 承認の自己発行を不可能にする ──────────────────

test('承認ファイルへの Write を拒否する', () => {
  const sb = sandbox();
  try {
    assert.equal(runHook(sb, write(join(sb.state, APPROVAL_FILENAME))).code, DENY);
    assert.equal(runHook(sb, write(join(sb.state, 'run-state.json'))).code, DENY);
    assert.equal(runHook(sb, write('.claude/state/config-change-approved')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('あらゆるシェル経路での承認マーカー作成を拒否する', () => {
  const sb = sandbox();
  try {
    const approvalPath = join(sb.state, APPROVAL_FILENAME);
    const commands = [
      `touch ${approvalPath}`,
      `echo '{}' > ${approvalPath}`,
      `printf '{}' >> ${approvalPath}`,
      `echo '{}' | tee ${approvalPath}`,
      `cp /tmp/x.json ${approvalPath}`,
      `mv /tmp/x.json ${approvalPath}`,
      `install -m 600 /tmp/x.json ${approvalPath}`,
      `node -e "require('fs').writeFileSync('${approvalPath}','{}')"`,
      `python3 -c "open('${approvalPath}','w')"`,
      `ln -s /tmp/fake ${approvalPath}`,
      'touch .claude/state/config-change-approved',
      `rm ${approvalPath}`,
      `node .claude/scripts/harness-approve.mjs --target .claude/hooks/`,
      `bash .claude/scripts/harness-approve.mjs`,
      `HARNESS_APPROVAL_TOKEN=guess node .claude/scripts/harness-approve.mjs --target CLAUDE.md`,
    ];
    for (const command of commands) {
      assert.equal(runHook(sb, bash(command)).code, DENY, `許可されています: ${command}`);
    }
  } finally {
    sb.cleanup();
  }
});

test('状態ディレクトリを差し替える環境変数の設定を拒否する', () => {
  const sb = sandbox();
  try {
    for (const command of [
      'HARNESS_STATE_DIR=/tmp/fake node .claude/scripts/harness-run.mjs show',
      'export HARNESS_STATE_DIR=/tmp/fake',
      'HARNESS_APPROVAL_TOKEN=x node .claude/scripts/harness-approve.mjs --target CLAUDE.md --token x',
    ]) {
      assert.equal(runHook(sb, bash(command)).code, DENY, `許可されています: ${command}`);
    }
  } finally {
    sb.cleanup();
  }
});

// ── 目的B: 状態不在・破損時の fail-closed ────────────────

test('承認が無ければ保護対象の変更を拒否する', () => {
  const sb = sandbox();
  try {
    for (const path of [
      '.claude/hooks/guard-dangerous.mjs',
      '.claude/settings.json',
      '.claude/agents/implementer.md',
      '.claude/rules/coding-standards.md',
      '.claude/skills/quality-gates/SKILL.md',
      '.claude/lib/harness-approval.mjs',
      '.claude/tests/guard-dangerous.test.mjs',
      '.claude/scripts/run-quality-gates.sh',
      '.github/workflows/ci.yml',
      'lefthook.yml',
      'CLAUDE.md',
      'AGENTS.md',
    ]) {
      assert.equal(runHook(sb, write(path)).code, DENY, `承認なしで許可されています: ${path}`);
    }
  } finally {
    sb.cleanup();
  }
});

test('有効な承認があれば対象範囲の変更だけを許可する', () => {
  const sb = sandbox();
  try {
    approve(sb, { target: '.claude/hooks/' });
    assert.equal(runHook(sb, write('.claude/hooks/guard-dangerous.mjs')).code, ALLOW);
    // 承認対象外は拒否のまま
    assert.equal(runHook(sb, write('.claude/settings.json')).code, DENY);
    assert.equal(runHook(sb, write('CLAUDE.md')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('run ID が一致しない承認を拒否する', () => {
  const sb = sandbox();
  try {
    approve(sb, { runId: 'run-someone-else' });
    assert.equal(runHook(sb, write('.claude/hooks/x.mjs')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('期限切れの承認を拒否する', () => {
  const sb = sandbox();
  try {
    const past = Date.now() - 60 * 60_000;
    approve(sb, {
      approvedAt: new Date(past).toISOString(),
      expiresAt: new Date(past + 60_000).toISOString(),
    });
    assert.equal(runHook(sb, write('.claude/hooks/x.mjs')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('壊れた承認ファイルで保護対象の変更を拒否する（fail-closed）', () => {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.state, APPROVAL_FILENAME), '{ broken');
    const result = runHook(sb, write('.claude/hooks/x.mjs'));
    assert.equal(result.code, DENY);
    assert.match(result.stderr, /壊れて|corrupt/);
  } finally {
    sb.cleanup();
  }
});

test('run 状態が無ければ承認を照合できず拒否する', () => {
  const sb = sandbox();
  try {
    rmSync(join(sb.state, RUN_STATE_FILENAME), { force: true });
    approve(sb);
    assert.equal(runHook(sb, write('.claude/hooks/x.mjs')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('run 状態が壊れていれば拒否する', () => {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.state, RUN_STATE_FILENAME), '{ broken');
    approve(sb);
    assert.equal(runHook(sb, write('.claude/hooks/x.mjs')).code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('状態ディレクトリが信頼できない環境では保護対象の変更を拒否する', () => {
  const sb = sandbox();
  try {
    const result = runHook(sb, write('.claude/hooks/x.mjs'), {
      env: { HARNESS_STATE_DIR: '', XDG_STATE_HOME: '', HOME: '' },
    });
    assert.equal(result.code, DENY);
  } finally {
    sb.cleanup();
  }
});

test('ファイル単位の承認は単回使用で消費される', () => {
  const sb = sandbox();
  try {
    approve(sb, { target: 'CLAUDE.md' });
    assert.equal(runHook(sb, write('CLAUDE.md')).code, ALLOW);
    assert.equal(existsSync(join(sb.state, APPROVAL_FILENAME)), false, '承認が消費されていません');
    assert.equal(runHook(sb, write('CLAUDE.md')).code, DENY, '再利用できてしまいます');
  } finally {
    sb.cleanup();
  }
});

test('ディレクトリ単位の承認は期限内・同一 run で再利用できる（明示された再利用条件）', () => {
  const sb = sandbox();
  try {
    approve(sb, { target: '.claude/hooks/' });
    assert.equal(runHook(sb, write('.claude/hooks/a.mjs')).code, ALLOW);
    assert.equal(runHook(sb, write('.claude/hooks/b.mjs')).code, ALLOW);
    assert.equal(existsSync(join(sb.state, APPROVAL_FILENAME)), true);
  } finally {
    sb.cleanup();
  }
});

test('不正な入力は保護対象に触れる場合のみ拒否する（リスク別 fail-closed）', () => {
  const sb = sandbox();
  try {
    // 解析不能かつ保護対象へ言及 → 拒否
    assert.equal(runHook(sb, null, { rawInput: '{ broken .claude/hooks/x.mjs' }).code, DENY);
    assert.equal(runHook(sb, null, { rawInput: '{ broken approval.json' }).code, DENY);
    // 解析不能だが保護対象と無関係 → 通常操作を止めない
    assert.equal(runHook(sb, null, { rawInput: '{ broken' }).code, ALLOW);
    assert.equal(runHook(sb, null, { rawInput: '' }).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

// ── 目的E: Hook 回避の検出 ────────────────────────────────

test('ローカル Hook を回避するコマンドを拒否する', () => {
  const sb = sandbox();
  try {
    for (const command of [
      'git commit --no-verify -m "wip"',
      'git commit -m "wip" --no-verify',
      'git push --no-verify',
      'LEFTHOOK=0 git commit -m "wip"',
      'HUSKY=0 git commit -m "wip"',
      'SKIP=lint git commit -m "wip"',
      'git config core.hooksPath /dev/null',
      'git config --local core.hooksPath ""',
    ]) {
      assert.equal(runHook(sb, bash(command)).code, DENY, `許可されています: ${command}`);
    }
    // 通常のコミット・プッシュは妨げない
    assert.equal(runHook(sb, bash('git commit -m "feat: add"')).code, ALLOW);
    assert.equal(runHook(sb, bash('git push -u origin feature/x')).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

test('拒否時は理由を stderr に出す', () => {
  const sb = sandbox();
  try {
    const result = runHook(sb, bash('git push --force'));
    assert.equal(result.code, DENY);
    assert.ok(result.stderr.length > 0, '理由が出力されていません');
  } finally {
    sb.cleanup();
  }
});

test('拒否メッセージに秘密情報を含めない', () => {
  const sb = sandbox();
  try {
    const result = runHook(sb, bash('cat .env'), {
      env: { SUPER_SECRET_TOKEN: 'tok_should_not_leak' },
    });
    assert.equal(result.code, DENY);
    assert.equal(result.stderr.includes('tok_should_not_leak'), false);
  } finally {
    sb.cleanup();
  }
});
