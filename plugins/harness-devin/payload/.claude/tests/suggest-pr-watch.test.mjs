// suggest-pr-watch.mjs（PostToolUse Bash Hook）のテスト。gh issue createの直後だけ待機を促す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), '../hooks/suggest-pr-watch.mjs');

function runHook(input) {
  const stdout = execFileSync(process.execPath, [hookPath], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return stdout.trim() === '' ? null : JSON.parse(stdout);
}

const created = (command, stdout) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_response: { stdout, stderr: '' },
});

test('gh issue create の出力に Issue の URL があれば、待機コマンドを additionalContext で促す', () => {
  const out = runHook(
    created('gh issue create --title t --body-file b.md', 'https://github.com/oze-xxbumpxx/Sample/issues/37\n'),
  );
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /wait-for-pr\.mjs 37/);
  assert.match(out.hookSpecificOutput.additionalContext, /review-devin-pr/);
  // 承認済み計画のタスクはopen-taskで作り、起動はロックを取るラッパーに限る（ADR-0010）
  assert.match(out.hookSpecificOutput.additionalContext, /delegation\.mjs open-task/);
  assert.match(out.hookSpecificOutput.additionalContext, /delegation-launch\.mjs 37 --runner local/);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /request-file|devin --cloud|devin --model/);
  // U-10: Issueに紐づかないDevinのPRの待機
  assert.match(out.hookSpecificOutput.additionalContext, /wait-for-devin-pr\.mjs --since \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
});

test('複数作成したら全番号を 1 回ずつ挙げる', () => {
  const stdout = [30, 31, 32, 31].map((n) => `https://github.com/o/r/issues/${n}`).join('\n');
  const text = runHook(created('for t in a b c; do gh issue create --title "$t"; done', stdout)).hookSpecificOutput
    .additionalContext;
  for (const n of [30, 31, 32]) assert.match(text, new RegExp(`wait-for-pr\\.mjs ${n}\\b`));
  assert.equal(text.match(/wait-for-pr\.mjs 31\b/g).length, 1);
});

test('gh issue create 以外、または URL が無いときは何も出さない', () => {
  assert.equal(runHook(created('gh issue view 37', 'https://github.com/o/r/issues/37')), null);
  assert.equal(runHook(created('gh issue create --web', '')), null);
  assert.equal(runHook({ tool_input: {} }), null);
});

test('壊れた入力でも exit 0', () => {
  assert.equal(runHook('not json'), null);
});
