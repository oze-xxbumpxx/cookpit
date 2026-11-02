// validate-agent-config.mjs（PostToolUse Hook）の安全境界テスト。
// 実際にフックをサブプロセスとして起動し、終了コードでallow(0) / deny(2)を検証する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath =
  process.env.VALIDATE_HOOK_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), '../hooks/validate-agent-config.mjs');

const ALLOW = 0;
const DENY = 2;

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'validate-hook-'));
  const root = join(base, 'repo');
  mkdirSync(root, { recursive: true });
  return {
    base,
    root,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function runHook(sb, payload) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: sb.root,
  };
  try {
    execFileSync(process.execPath, [hookPath], {
      input: JSON.stringify(payload),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (error) {
    return { code: error.status ?? -1, stderr: String(error.stderr ?? '') };
  }
}

function writeRel(sb, rel, contents) {
  const abs = join(sb.root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  return abs;
}

function afterWrite(sb, rel) {
  return runHook(sb, {
    tool_name: 'Write',
    tool_input: { file_path: join(sb.root, rel) },
  });
}

const AGENT_TEMPLATE = (model) => `---
name: demo
description: 検証用
model: ${model}
tools: Read, Grep
---

本文
`;

const SKILL_OK = `---
name: demo
description: 検証用スキル
---

# Demo
`;

test('スキルの補助 .md は frontmatter なしでも許可し、SKILL.md の欠落は拒否する', () => {
  const sb = sandbox();
  try {
    writeRel(sb, '.claude/skills/demo/reference.md', '# 参考資料\nfrontmatter なし\n');
    assert.equal(afterWrite(sb, '.claude/skills/demo/reference.md').code, ALLOW);

    writeRel(sb, '.claude/skills/demo/SKILL.md', '# Demo\nfrontmatter なし\n');
    const denied = afterWrite(sb, '.claude/skills/demo/SKILL.md');
    assert.equal(denied.code, DENY);
    assert.match(denied.stderr, /frontmatter/);
  } finally {
    sb.cleanup();
  }
});

test('正常な SKILL.md は許可する', () => {
  const sb = sandbox();
  try {
    writeRel(sb, '.claude/skills/demo/SKILL.md', SKILL_OK);
    assert.equal(afterWrite(sb, '.claude/skills/demo/SKILL.md').code, ALLOW);
  } finally {
    sb.cleanup();
  }
});

test('model の公式エイリアスと inherit を許可し、未知の値は拒否する', () => {
  const sb = sandbox();
  try {
    for (const model of ['inherit', 'sonnet', 'opus', 'haiku', 'fable', 'claude-sonnet-5-5', 'claude-opus-5-5']) {
      writeRel(sb, '.claude/agents/demo.md', AGENT_TEMPLATE(model));
      assert.equal(
        afterWrite(sb, '.claude/agents/demo.md').code,
        ALLOW,
        `拒否されています: model: ${model}`,
      );
    }
    writeRel(sb, '.claude/agents/demo.md', AGENT_TEMPLATE('gpt-4'));
    const denied = afterWrite(sb, '.claude/agents/demo.md');
    assert.equal(denied.code, DENY);
    assert.match(denied.stderr, /model 指定が不正/);
  } finally {
    sb.cleanup();
  }
});

test('settings.json の欠けたフック参照先を拒否する', () => {
  const sb = sandbox();
  try {
    writeRel(
      sb,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/missing-hook.mjs"',
                },
              ],
            },
          ],
        },
      }),
    );
    const denied = afterWrite(sb, '.claude/settings.json');
    assert.equal(denied.code, DENY);
    assert.match(denied.stderr, /フック参照先が存在しません/);
  } finally {
    sb.cleanup();
  }
});

test('ConfigChange でも不正な settings.json を拒否する', () => {
  const sb = sandbox();
  try {
    writeRel(sb, '.claude/settings.json', '{not-json');
    const denied = runHook(sb, {
      hook_event_name: 'ConfigChange',
      source: 'project_settings',
      file_path: join(sb.root, '.claude/settings.json'),
    });
    assert.equal(denied.code, DENY);
    assert.match(denied.stderr, /JSON が不正/);
  } finally {
    sb.cleanup();
  }
});

test('ConfigChange の skills で壊れた SKILL.md を拒否する', () => {
  const sb = sandbox();
  try {
    writeRel(sb, '.claude/skills/demo/SKILL.md', '# no frontmatter\n');
    const denied = runHook(sb, {
      hook_event_name: 'ConfigChange',
      source: 'skills',
      file_path: join(sb.root, '.claude/skills/demo/SKILL.md'),
    });
    assert.equal(denied.code, DENY);
    assert.match(denied.stderr, /frontmatter/);
  } finally {
    sb.cleanup();
  }
});

test('settings.json の実在するフック参照は許可する', () => {
  const sb = sandbox();
  try {
    writeRel(sb, '.claude/hooks/ok.mjs', '// ok\n');
    writeRel(
      sb,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/ok.mjs"',
                },
              ],
            },
          ],
        },
      }),
    );
    assert.equal(afterWrite(sb, '.claude/settings.json').code, ALLOW);
  } finally {
    sb.cleanup();
  }
});
