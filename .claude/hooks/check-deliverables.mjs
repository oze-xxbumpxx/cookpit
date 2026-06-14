#!/usr/bin/env node
// 成果物チェック Hook（警告のみ・非ブロッキング）
//
// 方針（docs/claude-code/document-policy.md の §feature-name と成果物検証）:
// - `.claude/state/current-feature` に feature-name が設定されている時だけ働く。
//   未設定（= Level 1 など）では何も言わない → 誤検知を出さない。
// - ソースコード変更（packages/*/src, apps/web/src）に対し、L2 ベースラインの成果物
//   （designs / implementation-plans / tests）の存在と、設計書の必須セクション非空を確認。
// - 不足を見つけても処理はブロックしない（exit 0）。additionalContext で警告を返すだけ。
// - 機械判定できない意味的整合性は validate-deliverables Skill / reviewer に委譲。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readFeatureName() {
  const p = join(ROOT, '.claude/state/current-feature');
  if (!existsSync(p)) return null;
  const v = readFileSync(p, 'utf8').trim().split('\n')[0]?.trim();
  return v || null;
}

function isSourceFile(filePath) {
  if (!filePath) return false;
  const rel = filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
  if (!/\.(ts|tsx)$/.test(rel)) return false;
  // ソースのみ対象（docs, .claude, 設定, テストランナー成果物は除外）
  return /^packages\/[^/]+\/src\//.test(rel) || /^apps\/web\/src\//.test(rel);
}

// 必須セクションが空か判定（ヘッダー直後に本文が無く次のヘッダーが来る = 空）。
// 「対象外」「変更なし」だけでも本文ありとみなす（誤検知回避）。
const REQUIRED_DESIGN_SECTIONS = ['目的', '要件', '変更後構成', 'テスト方針'];

function emptySections(designPath) {
  const text = readFileSync(designPath, 'utf8');
  const lines = text.split('\n');
  const empties = [];
  for (const section of REQUIRED_DESIGN_SECTIONS) {
    const idx = lines.findIndex((l) => /^#{2,3}\s/.test(l) && l.includes(section));
    if (idx === -1) {
      empties.push(`${section}（セクション欠落）`);
      continue;
    }
    let hasBody = false;
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^#{1,3}\s/.test(lines[i])) break;
      if (lines[i].trim() !== '') {
        hasBody = true;
        break;
      }
    }
    if (!hasBody) empties.push(`${section}（空）`);
  }
  return empties;
}

function checkDeliverables(feature) {
  const warnings = [];
  const designPath = join(ROOT, `docs/designs/${feature}.md`);
  const planPath = join(ROOT, `docs/implementation-plans/${feature}.md`);
  const testPath = join(ROOT, `docs/tests/${feature}.md`);

  if (!existsSync(designPath)) warnings.push(`設計書が未作成: docs/designs/${feature}.md`);
  else {
    const empties = emptySections(designPath);
    if (empties.length) warnings.push(`設計書の必須セクションが空: ${empties.join(', ')}`);
  }
  if (!existsSync(planPath)) warnings.push(`実装計画が未作成: docs/implementation-plans/${feature}.md`);
  if (!existsSync(testPath)) warnings.push(`試験計画が未作成: docs/tests/${feature}.md`);
  return warnings;
}

function emit(additionalContext, event) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } })
  );
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }
  const event = input.hook_event_name || 'PostToolUse';
  const feature = readFeatureName();
  if (!feature) process.exit(0); // 作業単位未設定 → 沈黙

  if (event === 'PostToolUse') {
    const filePath = input.tool_input?.file_path;
    if (!isSourceFile(filePath)) process.exit(0);
    const warnings = checkDeliverables(feature);
    if (warnings.length) {
      emit(
        `⚠ 成果物チェック（feature: ${feature}）— Level 2 以上ならソース変更前に成果物を揃えてください:\n` +
          warnings.map((w) => ` - ${w}`).join('\n') +
          `\n（Level 1 の軽微変更ならこの警告は無視可。詳細は docs/claude-code/document-policy.md）`,
        event
      );
    }
    process.exit(0);
  }

  if (event === 'Stop') {
    const warnings = checkDeliverables(feature);
    if (warnings.length) {
      emit(
        `⚠ 完了前チェック（feature: ${feature}）— 未充足の成果物があります:\n` +
          warnings.map((w) => ` - ${w}`).join('\n') +
          `\nvalidate-deliverables Skill で整合性を確認し、不要なら .claude/state/current-feature をクリアしてください。`,
        event
      );
    }
    process.exit(0);
  }

  process.exit(0);
}

main();
