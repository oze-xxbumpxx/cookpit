// guard-dangerous.mjs（PreToolUse Hook）の安全境界テスト。
// 実際にフックをサブプロセスとして起動し、終了コードで allow(0) / deny(2) を検証する。
//
// 保護ファイルの人間承認層は撤去済み（承認境界は PR レビュー）。
// 本フックは破壊的操作・秘密情報・Hook 回避のみを決定論的に拒否する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath =
  process.env.GUARD_HOOK_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), '../hooks/guard-dangerous.mjs');

const ALLOW = 0;
const DENY = 2;

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'guard-hook-'));
  const root = join(base, 'repo');
  mkdirSync(root, { recursive: true });
  return {
    base,
    root,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/** フックを起動して終了コードを返す。rawInput を渡すと JSON 化せずそのまま送る。 */
function runHook(sb, payload, { rawInput = null, env: extraEnv = {} } = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
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

test('構成ファイルの変更はフックでは妨げない（承認境界は PR レビュー）', () => {
  const sb = sandbox();
  try {
    for (const path of [
      '.claude/hooks/guard-dangerous.mjs',
      '.claude/settings.json',
      '.claude/agents/implementer.md',
      '.claude/rules/coding-standards.md',
      '.claude/skills/quality-gates/SKILL.md',
      '.claude/lib/harness-state.mjs',
      '.claude/tests/guard-dangerous.test.mjs',
      '.claude/scripts/run-quality-gates.sh',
      '.github/workflows/ci.yml',
      'lefthook.yml',
      'CLAUDE.md',
      'AGENTS.md',
    ]) {
      assert.equal(runHook(sb, write(path)).code, ALLOW, `構成変更が拒否されています: ${path}`);
    }
    for (const command of [
      'echo "x" > .claude/hooks/guard-dangerous.mjs',
      'echo "x" >> CLAUDE.md',
      'node .claude/scripts/harness-run.mjs set --phase gates',
      'git apply /tmp/changes.patch',
      'git stash pop',
      `node -e "require('fs').writeFileSync('.claude/hooks/guard-dangerous.mjs','')"`,
    ]) {
      assert.equal(
        runHook(sb, bash(command)).code,
        ALLOW,
        `構成変更が拒否されています: ${command}`,
      );
    }
  } finally {
    sb.cleanup();
  }
});

test('ハーネススクリプトの実行・読み取りは妨げない', () => {
  const sb = sandbox();
  try {
    assert.equal(
      runHook(sb, bash('bash .claude/scripts/run-quality-gates.sh --all 2>&1')).code,
      ALLOW,
    );
    assert.equal(runHook(sb, bash('node .claude/scripts/harness-run.mjs show')).code, ALLOW);
    assert.equal(runHook(sb, bash('cat .claude/settings.json')).code, ALLOW);
    assert.equal(runHook(sb, bash('rg "deny" .claude/hooks/guard-dangerous.mjs')).code, ALLOW);
    assert.equal(runHook(sb, bash('pnpm test:harness')).code, ALLOW);
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

test('解析不能な入力は通常操作を妨げない', () => {
  const sb = sandbox();
  try {
    assert.equal(runHook(sb, null, { rawInput: '{ broken .claude/hooks/x.mjs' }).code, ALLOW);
    assert.equal(runHook(sb, null, { rawInput: '{ broken approval.json' }).code, ALLOW);
    assert.equal(runHook(sb, null, { rawInput: '{ broken' }).code, ALLOW);
    assert.equal(runHook(sb, null, { rawInput: '' }).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

test('インタープリタでも非保護パスなら妨げない（過剰検知の防止）', () => {
  const sb = sandbox();
  try {
    assert.equal(runHook(sb, bash(`node -e "console.log(1+1)"`)).code, ALLOW);
    assert.equal(
      runHook(sb, bash(`node -e "require('fs').writeFileSync('/tmp/x.json','{}')"`)).code,
      ALLOW,
    );
    assert.equal(runHook(sb, bash('node --test .claude/tests/harness-state.test.mjs')).code, ALLOW);
  } finally {
    sb.cleanup();
  }
});
