#!/usr/bin/env node
// PostToolUse / ConfigChange Hook — Agent設定の構文・整合性検証
//
// 方針（docs/claude-code/improvement-cycle.md / memory機能改善 §7）:
// - 重要な制御はCommand Hookで行う。LLM判断が必要な部分はAgent（reflection / manager）に委ねる。
// - 強制度: 「構文エラーはブロック・方針違反は警告」
//     BLOCK(exit 2, stderr): 機械的に確実な誤り
//       - settings.jsonのJSONが不正
//       - Agent/SkillのYAML frontmatterが欠落or不正
//       - model指定が公式形式でもエイリアス（sonnet / opus / inherit等）でもない
//       - Agent名が重複している
//     WARN(exit 0, additionalContext): 方針・整合性の注意（ロックアウト回避のためブロックしない）
//       - Agent()ツール権限を許可外Agentが持つ（過剰権限の疑い）
//       - 参照先Agent / Skill / Ruleが存在しない
//       - Agent名とファイル名の不一致
// - 構成変更の人間承認はフックでは行わない（PRレビューが担う）。
// - 監視対象外のファイルでは即exit 0。

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// プロジェクト内のAgentは検証役だけ。Agent()でさらに子を起動しない。
const AGENT_TOOL_ALLOWED = new Set();
// Claude Code組み込みAgent（.claude/agents/ に定義ファイルが無い。存在チェックから除外）
const BUILTIN_AGENTS = new Set(['Explore']);
// 公式エイリアスとclaude-<family>-... 形式。Cursorのinheritも含む。
const MODEL_ALIAS = new Set(['inherit', 'opus', 'sonnet', 'haiku', 'fable']);
const MODEL_FULL = /^claude-(opus|sonnet|haiku|fable)(-|$)/;
// 構成変更の承認境界はPRレビュー（フック内の人間承認層は撤去済み）

function isAllowedModel(model) {
  return MODEL_ALIAS.has(model) || MODEL_FULL.test(model);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function toRel(filePath) {
  if (!filePath) return null;
  return filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
}

/** PostToolUseはtool_input.file_path。ConfigChangeはfile_path / source。 */
function resolveTargetRel(input) {
  const event = input.hook_event_name || 'PostToolUse';
  if (event === 'ConfigChange') {
    const fromField = toRel(input.file_path);
    if (fromField) return fromField;
    if (input.source === 'project_settings') return '.claude/settings.json';
    if (input.source === 'local_settings') return '.claude/settings.local.json';
    return null;
  }
  return toRel(input.tool_input?.file_path);
}

function isWatched(rel) {
  if (!rel) return false;
  return (
    rel === 'CLAUDE.md' ||
    rel === '.claude/settings.json' ||
    rel.startsWith('.claude/agents/') ||
    rel.startsWith('.claude/skills/') ||
    rel.startsWith('.claude/rules/')
  );
}

// frontmatter（先頭 --- ... --- ）を素朴にkey: valueで読む。
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null; // 閉じが無い = 不正
  const fm = {};
  let lastKey = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) {
      lastKey = m[1];
      fm[lastKey] = m[2].trim();
    } else if (lastKey && /^\s+/.test(line)) {
      // 折り返し（> や複数行）の継続行は直前キーへ連結
      fm[lastKey] = (fm[lastKey] + ' ' + line.trim()).trim();
    }
  }
  return fm;
}

function listAgentNames() {
  const dir = join(ROOT, '.claude/agents');
  const names = new Map(); // name -> [files]
  if (!existsSync(dir)) return names;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    try {
      const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
      const name = fm?.name;
      if (!name) continue;
      if (!names.has(name)) names.set(name, []);
      names.get(name).push(f);
    } catch {
      // 読めないファイルは無視
    }
  }
  return names;
}

function isSkillFile(rel) {
  return /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(rel);
}

function collectHookCommands(settings) {
  const commands = [];
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== 'object') return commands;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      for (const hook of entry?.hooks || []) {
        if (hook?.command) commands.push(String(hook.command));
      }
    }
  }
  return commands;
}

function missingHookPaths(settings) {
  const missing = [];
  const seen = new Set();
  for (const cmd of collectHookCommands(settings)) {
    const re = /\$CLAUDE_PROJECT_DIR\/([^"'\s]+)/g;
    let m;
    while ((m = re.exec(cmd))) {
      const relPath = m[1];
      if (seen.has(relPath)) continue;
      seen.add(relPath);
      if (!existsSync(join(ROOT, relPath))) missing.push(relPath);
    }
  }
  return missing;
}

function referencedAgents(toolsValue) {
  // 例: "Agent(architecture-designer, implementer, Explore), Read, Grep"
  const refs = [];
  const m = toolsValue.match(/Agent\(([^)]*)\)/);
  if (m && m[1].trim()) {
    for (const r of m[1].split(',')) {
      const n = r.trim();
      if (n) refs.push(n);
    }
  }
  return refs;
}

function blockExit(reasons) {
  process.stderr.write(
    '⛔ Agent 設定の検証エラー（構文・整合性）— 修正してください:\n' +
      reasons.map((r) => ` - ${r}`).join('\n') +
      '\n',
  );
  process.exit(2);
}

function warnExit(warnings, hookEventName = 'PostToolUse') {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext:
          '⚠ Agent 設定の注意（方針・整合性。ブロックはしません）:\n' +
          warnings.map((w) => ` - ${w}`).join('\n'),
      },
    }),
  );
  process.exit(0);
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const eventName = input.hook_event_name || 'PostToolUse';
  const rel = resolveTargetRel(input);
  if (!isWatched(rel)) process.exit(0);

  const blocks = [];
  const warns = [];
  const abs = join(ROOT, rel);

  let text = '';
  try {
    text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  } catch {
    process.exit(0);
  }

  // settings.json: JSON妥当性 + フック参照先の実在
  if (rel === '.claude/settings.json') {
    try {
      const settings = JSON.parse(text);
      for (const p of missingHookPaths(settings)) {
        blocks.push(`.claude/settings.json: フック参照先が存在しません: ${p}`);
      }
    } catch (e) {
      blocks.push(`.claude/settings.json の JSON が不正: ${String(e.message || e)}`);
    }
  }

  // Agent / Skillのfrontmatter検証（スキルはSKILL.mdのみ。補助 .mdは対象外）
  const isAgent = rel.startsWith('.claude/agents/') && rel.endsWith('.md');
  const isSkill = isSkillFile(rel);

  if (isAgent || isSkill) {
    const fm = parseFrontmatter(text);
    if (!fm) {
      blocks.push(`${rel}: YAML frontmatter が欠落または閉じられていません（先頭の --- ... ---）`);
    } else {
      if (!fm.name) blocks.push(`${rel}: frontmatter に name がありません`);
      if (isSkill && !fm.description) warns.push(`${rel}: Skill に description がありません`);

      if (isAgent) {
        // model形式（公式エイリアスとclaude-<family>-... を許可）
        if (fm.model && !isAllowedModel(fm.model)) {
          blocks.push(
            `${rel}: model 指定が不正（inherit / opus / sonnet / haiku / fable または claude-<family>-...）: "${fm.model}"`,
          );
        }
        if (!fm.model) warns.push(`${rel}: model 指定がありません`);

        // nameとファイル名の一致
        const fileBase = basename(rel).replace(/\.md$/, '');
        if (fm.name && fm.name !== fileBase) {
          warns.push(`${rel}: name "${fm.name}" がファイル名 "${fileBase}" と一致しません`);
        }

        // 名前の重複
        const names = listAgentNames();
        if (fm.name && (names.get(fm.name)?.length || 0) > 1) {
          blocks.push(`Agent 名 "${fm.name}" が重複: ${names.get(fm.name).join(', ')}`);
        }

        // tools: Agent()権限と参照先
        if (fm.tools) {
          const refs = referencedAgents(fm.tools);
          if (refs.length > 0 && fm.name && !AGENT_TOOL_ALLOWED.has(fm.name)) {
            const allowed =
              AGENT_TOOL_ALLOWED.size > 0
                ? [...AGENT_TOOL_ALLOWED].join(' / ')
                : 'なし（検証役は他のエージェントを起動しない）';
            warns.push(`${rel}: Agent() ツールの保持は ${allowed}（過剰権限の疑い）`);
          }
          for (const r of refs) {
            if (BUILTIN_AGENTS.has(r)) continue;
            if (!existsSync(join(ROOT, `.claude/agents/${r}.md`))) {
              warns.push(`${rel}: 参照先 Agent が存在しません: ${r}`);
            }
          }
        }
      }
    }
  }


  if (blocks.length) blockExit(blocks);
  if (warns.length) warnExit(warns, eventName);
  process.exit(0);
}

main();
