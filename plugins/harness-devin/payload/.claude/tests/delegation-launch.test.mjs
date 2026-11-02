import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDevinArgs, launchDelegation, lockNameFor, observeLocalSession, parseLaunchArgs, readExportSessionId, runLaunchCli, sessionIdsIn } from '../scripts/delegation-launch.mjs';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const config = JSON.parse(readFileSync(new URL('../config/delegation-review.json', import.meta.url), 'utf8'));

async function fixture(fn, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'delegation-launch-'));
  try {
    const prompt = join(dir, 'prompt.txt');
    writeFileSync(prompt, 'PRIVATE PROMPT sentinel', { mode: 0o600 });
    let counter = 0;
    let spawnCount = 0;
    const clone = realpathSync(mkdtempSync(join(dir, 'clone-')));
    // 手元の一覧: 起動の前は空、起動のあとはsession-1だけ。
    let sessions = [];
    let clock = 0;
    const dependencies = {
      config, stateDir: dir, uuid: () => id(++counter),
      listSessions: async (cwd) => {
        assert.equal(cwd, clone);
        return structuredClone(sessions);
      },
      // 偽の時計。待つたびに進め、一覧を読む時間は0とする。
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      observeMs: 4,
      intervalMs: 2,
      spawnOnce: async (input) => {
        spawnCount += 1;
        sessions = [{ id: 'session-1', working_directory: clone, title: 'PRIVATE TITLE' }];
        assert.deepEqual(input.args.slice(-2), ['--prompt-file', realpathSync(prompt)]);
        assert.doesNotMatch(JSON.stringify(input.args), /PRIVATE PROMPT/);
        return { pid: null };
      },
      ...overrides,
    };
    const options = { issue: 81, runner: 'local', model: 'swe-2-high', promptFile: prompt, clone };
    await fn({ dir, prompt, clone, dependencies, options, count: () => spawnCount, setSessions: (value) => { sessions = value; } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Issue番号・runner・model・prompt fileを明示し、それ以外の引数を拒む', () => {
  const options = parseLaunchArgs(['81', '--runner', 'local', '--model', 'swe-2-high', '--prompt-file', '/private/prompt']);
  assert.deepEqual([options.issue, options.runner, options.model], [81, 'local', 'swe-2-high']);
  assert.throws(() => parseLaunchArgs(['81', '--model', 'swe-2-high', '--prompt-file', '/p']));
  assert.throws(() => parseLaunchArgs(['feature:task', '--runner', 'local', '--model', 'swe-2-high', '--prompt-file', '/p']));
  assert.throws(() => parseLaunchArgs(['81', '--runner', 'local', '--model', 'unknown', '--prompt-file', '/p']));
  assert.throws(() => parseLaunchArgs(['81', '--runner', 'local', '--model', 'swe-2-high', '--prompt-file', '/p', '--activation-id', id(1)]));
  assert.deepEqual(buildDevinArgs({ runner: 'cloud', model: 'swe-2-high', promptFile: '/p' }), ['--cloud', '--model', 'swe-2-high', '--permission-mode', 'dangerous', '-p', '--prompt-file', '/p']);
  assert.deepEqual(buildDevinArgs({ runner: 'local', model: 'swe-2-high', promptFile: '/p', exportFile: '/e' }), ['--model', 'swe-2-high', '--permission-mode', 'dangerous', '--export', '/e', '-p', '--prompt-file', '/p']);
  assert.throws(() => buildDevinArgs({ runner: 'local', model: 'unknown', promptFile: '/p' }));
});

test('手元のDevinを1回だけ起動し、セッションのIDを確定して返す。秘密を出さない', async () => {
  await fixture(async ({ dir, dependencies, options, count }) => {
    const result = await launchDelegation(options, dependencies);
    assert.deepEqual(result, { exitCode: 0, state: 'running', issue: 81, runner: 'local', requested_model: 'swe-2-high', session_id: 'session-1', pid: null });
    assert.equal(count(), 1);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
    assert.equal(statSync(join(dir, 'devin-logs', 'issue-81.log')).mode & 0o777, 0o600);
  });
});

test('手元の起動の確認が無い設定・prompt fileが他人に読める・CLIの引数の誤りでは起動しない', async () => {
  await fixture(async ({ prompt, dependencies, options, count }) => {
    assert.equal((await launchDelegation(options, { ...dependencies, config: { ...config, cli_launch_verified: false } })).exitCode, 4);
    chmodSync(prompt, 0o644);
    assert.equal((await launchDelegation(options, dependencies)).exitCode, 2);
    assert.equal((await runLaunchCli(['81', '--runner', 'local'], dependencies)).exitCode, 2);
    assert.equal(count(), 0);
  });
});

// devin-local-session: 手元のセッションのIDを、起動の前後の一覧の差で決める
const observe = (lists, extra = {}) => {
  let i = 0;
  let clock = 0;
  return observeLocalSession({ before: new Set(['old-1']), clone: '/clone', exportFile: '/no/such/export.json', listSessions: async () => { const next = lists[Math.min(i, lists.length - 1)]; i += 1; if (next instanceof Error) throw next; return next; }, now: () => clock, sleep: async (ms) => { clock += ms; }, observeMs: 6, intervalMs: 2, ...extra });
};
const at = (id, dir = '/clone') => ({ id, working_directory: dir });

test('LS-01: 待つ時間いっぱい読み、最後まで新しいIDがちょうど1つのときだけ返す', async () => {
  assert.equal(await observe([[at('old-1')], [at('old-1'), at('new-1')], [at('old-1'), at('new-1')]]), 'new-1');
  assert.equal(await observe([[at('old-1')], [at('old-1')], [at('old-1')]]), null);
});

test('LS-02: 途中で新しいIDが2つ以上になったら、あとで1つに見えても確定しない', async () => {
  assert.equal(await observe([[at('a')], [at('a'), at('b')], [at('a')]]), null);
});

test('LS-03: 別のフォルダのセッションは数えず、一覧を読めない・形が違うときは確定しない', async () => {
  assert.equal(await observe([[at('new-1', '/other')], [at('new-1', '/other')], [at('new-1', '/other')]]), null);
  assert.equal(await observe([[at('new-1')], new Error('PRIVATE'), [at('new-1')]]), null);
  assert.equal(await observe([[at('new-1')], { not: 'array' }, [at('new-1')]]), null);
  assert.equal(await observe([[at('bad id')], [at('bad id')], [at('bad id')]]), null);
  assert.throws(() => sessionIdsIn([{ id: '../x', working_directory: '/clone' }], '/clone'));
});

test('LS-04: 書き出しが出ていれば、そのIDが一覧のIDと違うとき確定しない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delegation-export-'));
  try {
    const file = join(dir, 'export.json');
    writeFileSync(file, JSON.stringify({ schema_version: 'ATIF-v1.7', session_id: 'new-1', steps: ['PRIVATE CONVERSATION'] }));
    assert.equal(readExportSessionId(file), 'new-1');
    assert.equal(await observe([[at('new-1')]], { exportFile: file }), 'new-1');
    writeFileSync(file, JSON.stringify({ session_id: 'someone-else' }));
    assert.equal(await observe([[at('new-1')]], { exportFile: file }), null);
    writeFileSync(file, '{not json');
    assert.equal(readExportSessionId(file), null);
    assert.equal(await observe([[at('new-1')]], { exportFile: file }), 'new-1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('LS-05: 起動の前の一覧を読めなければ起動しない', async () => {
  await fixture(async ({ dependencies, options, count }) => {
    dependencies.listSessions = async () => { throw new Error('PRIVATE'); };
    const result = await launchDelegation(options, dependencies);
    assert.equal(result.exitCode, 5);
    assert.equal(count(), 0);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  });
});

test('LS-06: 専用クローンのロックがあれば起動しない', async () => {
  await fixture(async ({ dir, clone, dependencies, options, count }) => {
    writeFileSync(join(dir, lockNameFor(clone)), '{}');
    const blocked = await launchDelegation(options, dependencies);
    assert.equal(blocked.exitCode, 4);
    assert.equal(count(), 0);
  });
});

test('LS-06b: 起動したらDevinのプロセスが終わるまでロックを残し、終わっていれば次の起動が取り直す', async () => {
  await fixture(async ({ dir, clone, dependencies, options, count }) => {
    const spawnOnce = dependencies.spawnOnce;
    dependencies.spawnOnce = async (input) => ({ ...(await spawnOnce(input)), pid: 4242 });
    let alive = true;
    dependencies.isAlive = (pid) => { assert.equal(pid, 4242); return alive; };
    assert.equal((await launchDelegation(options, dependencies)).state, 'running');
    const lock = join(dir, lockNameFor(clone));
    assert.equal(JSON.parse(readFileSync(lock, 'utf8')).devin_pid, 4242);
    assert.equal(JSON.parse(readFileSync(lock, 'utf8')).clone, clone);
    assert.equal(statSync(lock).mode & 0o777, 0o600);
    // Devinが動いているあいだは、次の起動を止める。
    const busy = await launchDelegation({ ...options, issue: 82 }, dependencies);
    assert.equal(busy.exitCode, 4);
    assert.equal(count(), 1);
    // 終わっていれば取り直して起動する。
    alive = false;
    await launchDelegation({ ...options, issue: 82 }, dependencies);
    assert.equal(count(), 2);
  });
});

test('LS-06e: クローンが違えば、動いているDevinがあっても別のクローンで起動できる', async () => {
  await fixture(async ({ dir, clone, dependencies, options, count }) => {
    dependencies.isAlive = () => true;
    dependencies.spawnOnce = async () => ({ pid: 4242 });
    // 1つ目のクローンでDevinが動いている（ロックにプロセス番号が残っている）。
    dependencies.listSessions = async () => [];
    await launchDelegation(options, dependencies);
    assert.equal(JSON.parse(readFileSync(join(dir, lockNameFor(clone)), 'utf8')).devin_pid, 4242);
    // 2つ目のクローンでは、起動の後に新しいIDが1つだけ現れる。
    const other = realpathSync(mkdtempSync(join(dir, 'clone-')));
    let started = false;
    dependencies.listSessions = async (cwd) => (started && cwd === other ? [{ id: 'session-2', working_directory: other }] : []);
    dependencies.spawnOnce = async (input) => { assert.equal(input.clone, other); started = true; return { pid: 4343 }; };
    const second = await launchDelegation({ ...options, issue: 82, clone: other }, dependencies);
    assert.equal(second.state, 'running');
    assert.equal(second.session_id, 'session-2');
    // 1つ目のクローンには、まだ起動しない。
    assert.equal((await launchDelegation({ ...options, issue: 83 }, dependencies)).exitCode, 4);
    assert.equal(count(), 0);
  });
});

test('LS-06g: クローンの記録が無い前の形のロックは、Devinが動いているかもしれないあいだ、ほかのクローンの起動も止める', async () => {
  await fixture(async ({ dir, dependencies, options, count, setSessions }) => {
    const legacy = join(dir, 'devin-clone.lock');
    writeFileSync(legacy, JSON.stringify({ wrapper_pid: 1, devin_pid: 4242 }));
    let alive = true;
    dependencies.isAlive = () => alive;
    assert.equal((await launchDelegation(options, dependencies)).exitCode, 4);
    // プロセス番号の無いロックも止める。
    writeFileSync(legacy, '{}');
    assert.equal((await launchDelegation(options, dependencies)).exitCode, 4);
    assert.equal(count(), 0);
    // 前の形でもDevinが終わっていれば起動できる。
    writeFileSync(legacy, JSON.stringify({ wrapper_pid: 1, devin_pid: 4242 }));
    alive = false;
    assert.equal((await launchDelegation(options, dependencies)).state, 'running');
    // 新しい形のロック（クローンの記録あり）は、既定のクローンだけのものなので見ない。
    writeFileSync(legacy, JSON.stringify({ clone: '/default', wrapper_pid: 1, devin_pid: 4242 }));
    alive = true;
    rmSync(join(dir, lockNameFor(options.clone)));
    setSessions([]);
    assert.equal((await launchDelegation({ ...options, issue: 82 }, dependencies)).state, 'running');
  });
});

test('LS-06f: 既定のクローンは前からのロックの名前を使う', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'default-clone-')));
  try {
    assert.equal(lockNameFor(dir, dir), 'devin-clone.lock');
    assert.match(lockNameFor(join(dir, 'x'), dir), /^devin-clone-[0-9a-f]{16}\.lock$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('LS-06c: 起動の前に止まったらロックを外し、状態の置き場が無くても作る', async () => {
  await fixture(async ({ dir, clone, dependencies, options }) => {
    dependencies.listSessions = async () => { throw new Error('down'); };
    assert.equal((await launchDelegation(options, dependencies)).exitCode, 5);
    assert.equal(existsSync(join(dir, lockNameFor(clone))), false);
    const fresh = join(dir, 'fresh-state');
    dependencies.stateDir = fresh;
    assert.equal((await launchDelegation(options, dependencies)).exitCode, 5);
    assert.equal(statSync(fresh).mode & 0o777, 0o700);
  });
});

test('LS-06d: 一覧を読むのが遅くても、読む時間を含めて待つ時間の上限で止める', async () => {
  let clock = 0;
  let reads = 0;
  const result = await observeLocalSession({
    before: new Set(), clone: '/clone', exportFile: '/no/such/export.json',
    listSessions: async (_clone, remaining) => { reads += 1; assert.ok(remaining > 0); clock += 9_000; return []; },
    now: () => clock, sleep: async (ms) => { clock += ms; }, observeMs: 60_000, intervalMs: 2_000,
  });
  assert.equal(result, null);
  assert.ok(clock <= 60_000 + 9_000);
  assert.ok(reads <= 6);
});

test('LS-07: 起動のあとに別のセッションも出たら、IDを空にしてlaunch_unknownにし、起動し直さない', async () => {
  await fixture(async ({ clone, dependencies, options, count, setSessions }) => {
    const spawnOnce = dependencies.spawnOnce;
    dependencies.spawnOnce = async (input) => {
      const result = await spawnOnce(input);
      setSessions([{ id: 'session-1', working_directory: clone }, { id: 'desktop-app', working_directory: clone }]);
      return result;
    };
    const result = await launchDelegation(options, dependencies);
    assert.equal(result.state, 'launch_unknown');
    assert.equal(count(), 1);
    assert.equal(result.session_id, undefined);
  });
});

test('LS-08: 手元の起動は非公開の書き出し先を--exportで渡し、既にあれば起動しない', async () => {
  await fixture(async ({ dir, clone, dependencies, options, count }) => {
    const spawnOnce = dependencies.spawnOnce;
    let exportArg = null;
    dependencies.spawnOnce = async (input) => { exportArg = input.args[input.args.indexOf('--export') + 1]; return spawnOnce(input); };
    await launchDelegation(options, dependencies);
    assert.equal(exportArg, join(dir, 'devin-logs', `export-${id(1)}.json`));
    assert.equal(count(), 1);
  });
  await fixture(async ({ dir, dependencies, options, count }) => {
    mkdirSync(join(dir, 'devin-logs'), { recursive: true });
    writeFileSync(join(dir, 'devin-logs', `export-${id(1)}.json`), '{}');
    assert.equal((await launchDelegation(options, dependencies)).state, 'launch_unknown');
    assert.equal(count(), 0);
  });
});

test('LS-09: クラウドは起動しない（内部の再送とURLの形を確かめていないため）', async () => {
  await fixture(async ({ dependencies, options, count }) => {
    const result = await launchDelegation({ ...options, runner: 'cloud' }, dependencies);
    assert.equal(result.exitCode, 4);
    assert.equal(count(), 0);
  });
});
