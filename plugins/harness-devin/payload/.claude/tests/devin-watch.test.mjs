// devin-watch.mjsの解釈と表示のテスト。ps・git・ghは呼ばない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeLsofPath,
  directCommands,
  displayWidth,
  findDevin,
  formatAge,
  parseArgs,
  parsePs,
  render,
  shortenCommand,
  splitSentences,
  summarizePr,
  summarizeStatus,
  truncate,
} from '../scripts/devin-watch.mjs';

const CLONE = '/Users/siro/個人開発/devin-work/sample';
const PS = [
  '17048 12509 1-00:00:00 devin',
  '98097 1 34:41 /bin/zsh -c cd /x && devin --model swe-2-max -p GitHub Issue #73 | tee -a log',
  '98100 98097 34:41 devin --model swe-2-max --permission-mode dangerous -p GitHub Issue #73',
  '98101 98097 34:41 tee -a /Users/siro/.local/state/sample-harness/devin-logs/issue-73.log',
  '98102 98100 34:41 /opt/homebrew/bin/devin acp',
  '99001 98102 00:05 bash -c cd /Users/siro/M-eM-^@/devin-work/sample && npm test 2>&1',
  '99002 99001 00:05 npm test',
  '99003 99002 00:02 node (vitest 1)',
  '99004 99002 00:02 node (vitest 2)',
].join('\n');

test('引数: Issue 番号は必須。--install だけなら不要', () => {
  assert.deepEqual(parseArgs(['73']), { issue: 73, interval: 5, once: false, install: false, logPath: false, clone: null });
  assert.equal(parseArgs(['--log-path', '73']).logPath, true);
  assert.throws(() => parseArgs(['--log-path']), /Issue 番号/);
  assert.equal(parseArgs(['--install']).install, true);
  assert.equal(parseArgs(['73', '--interval', '2', '--once']).interval, 2);
  assert.throws(() => parseArgs([]), /Issue 番号/);
  assert.throws(() => parseArgs(['73', '--interval', '0']), /--interval/);
  assert.throws(() => parseArgs(['73', '--bogus']), /不明な引数/);
});

test('表示幅: 全角は 2 桁。切るときは文字の途中で切らない', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('旅行API'), 7);
  assert.equal(displayWidth('🍡'), 2);
  assert.equal(truncate('旅行の作成と一覧', 9), '旅行の作…');
  assert.equal(truncate('short', 10), 'short');
  assert.ok(displayWidth(truncate('あ'.repeat(50), 21)) <= 21);
});

test('文の分割: 空白の無い連結でも文ごとに分ける', () => {
  assert.deepEqual(splitSentences('Lint passes.Now the unit tests.All 246 pass. 次に build です。完了しました'), [
    'Lint passes.',
    'Now the unit tests.',
    'All 246 pass.',
    '次に build です。',
    '完了しました',
  ]);
  // バージョン番号などの小数点では分けない
  assert.deepEqual(splitSentences('drizzle 0.45.2 を使う。'), ['drizzle 0.45.2 を使う。']);
});

test('プロセス: 作業用コピーで -p 付きの devin を本体にし、対話の devin と別の場所の devin は見ない', () => {
  const rows = parsePs(`55000 1 10:00 devin --model swe-2-high -p other project\n${PS}`);
  const cwdOf = (pid) => (pid === 98100 ? CLONE : '/Users/siro/other');
  const found = findDevin(rows, { clone: CLONE, cwdOf });
  assert.equal(found.root.pid, 98100);
  assert.equal(found.acp.pid, 98102);
  assert.equal(findDevin(parsePs('17048 12509 1-00:00:00 devin'), { clone: CLONE, cwdOf: () => CLONE }), null);
  assert.equal(findDevin(rows, { clone: CLONE, cwdOf: () => null }), null);
});

test('lsof のパス: \\xNN のバイトを UTF-8 に戻す', () => {
  const raw = '/Users/siro/' + [...Buffer.from('個人開発')].map((b) => `\\x${b.toString(16)}`).join('') + '/devin-work/sample';
  assert.equal(decodeLsofPath(raw), CLONE);
  assert.equal(decodeLsofPath('/plain/path'), '/plain/path');
});

test('プロセス: Devin が直接実行したコマンドだけを出し、その下は数える', () => {
  const rows = parsePs(PS);
  const { commands, others } = directCommands(rows, 98102);
  assert.deepEqual(commands.map((c) => c.pid), [99001]);
  assert.equal(others, 3);
});

test('コマンドの短縮: 作業用コピーのパスと定型の cd を落とす', () => {
  const cmd = 'bash -c cd /Users/siro/M-eM-^@M-dM-:/devin-work/sample && npm run test:api-db 2>&1';
  assert.equal(shortenCommand(cmd, CLONE), 'npm run test:api-db');
  assert.equal(shortenCommand('node <x>/devin-work/sample/node_modules/.bin/vitest', CLONE), 'node <clone>/node_modules/.bin/vitest');
});

test('git status: 新規・変更・削除を数える', () => {
  const s = summarizeStatus([' M apps/api/src/app.module.ts', '?? apps/api/src/modules/planning/domain/trip.ts', ' D old.ts', 'A  new.ts', '']);
  assert.deepEqual([s.added, s.modified, s.deleted], [2, 1, 1]);
  assert.equal(s.files[1].path, 'apps/api/src/modules/planning/domain/trip.ts');
});

test('経過時間の表示', () => {
  assert.equal(formatAge(20_000), '20 秒前');
  assert.equal(formatAge(5 * 60_000), '5 分前');
  assert.equal(formatAge(90 * 60_000), '1 時間 30 分前');
});

test('PR: CI の結論と最新のコメント', () => {
  const now = Date.parse('2026-09-28T00:10:00Z');
  const pr = {
    number: 74,
    url: 'u',
    state: 'OPEN',
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }, { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null }],
    comments: [{ author: { login: 'devin-ai-integration' }, createdAt: '2026-09-28T00:00:00Z' }],
    reviews: [{ author: { login: 'oze-xxbumpxx' }, submittedAt: '2026-09-28T00:05:00Z' }],
  };
  const s = summarizePr(pr, now);
  assert.equal(s.ci, 'pending');
  assert.equal(s.comments, 2);
  assert.deepEqual(s.lastComment, { author: 'oze-xxbumpxx', age: '5 分前' });
  assert.equal(summarizePr({ ...pr, statusCheckRollup: [] }, now).ci, 'none');
  assert.equal(summarizePr(null, now), null);
});

const snapshot = (over = {}) => ({
  issue: 73,
  title: 'feat(api): M2-a3 旅行の API',
  clock: '08:26:17',
  running: true,
  elapsed: '34:41',
  commands: [],
  others: 0,
  lastActivity: '21 秒前',
  idleMs: 21_000,
  branch: 'devin/m2-a3-trips-api-73',
  commits: [],
  pr: null,
  status: summarizeStatus([]),
  diffStat: '',
  recentFiles: [],
  sentences: ['一つ目。', '二つ目。', '三つ目。', '四つ目。', '五つ目。'],
  ...over,
});

test('表示: 実行中は直近 4 文、止まったら最後の報告を長めに出す', () => {
  const running = render(snapshot(), { width: 100 });
  assert.match(running, /■ Devin の最近の発言/);
  assert.doesNotMatch(running, /一つ目/);
  assert.match(running, /五つ目/);
  const stopped = render(snapshot({ running: false }), { width: 100 });
  assert.match(stopped, /停止/);
  assert.match(stopped, /■ Devin の最後の報告/);
  assert.match(stopped, /一つ目/);
  assert.doesNotMatch(stopped, /■ 実行中のコマンド/);
});

test('表示: 長く動きが無ければ注意を出す。コマンドが動いているなら出さない', () => {
  assert.match(render(snapshot({ idleMs: 11 * 60_000 }), { width: 100 }), /⚠ 11 分以上/);
  const busy = snapshot({ idleMs: 11 * 60_000, commands: [{ etime: '05:00', command: 'sleep 300' }] });
  assert.doesNotMatch(render(busy, { width: 100 }), /⚠/);
});

test('表示: すべての行が画面幅に収まる', () => {
  const wide = snapshot({ commands: [{ etime: '00:01', command: 'x'.repeat(300) }], sentences: ['あ'.repeat(200)] });
  for (const line of render(wide, { width: 60 }).split('\n')) assert.ok(displayWidth(line) <= 60, line);
});
