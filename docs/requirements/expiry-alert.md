# 要件定義: expiry-alert

- task-id / 変更レベル: Sprint 8 Unit B（roadmap タスク 3）/ L3
- 作成日: 2026-08-09

## 背景

Sprint 8 の完了条件 3 件（`docs/05-roadmap.md:638-640`）のうち、以下の 2 件は Unit A
（stock-edit・マージ済み）で満たされた。

- 買い物完了時に賞味期限を入力できる（任意）
- 既存の在庫に後から期限・保存場所を設定できる

残る 1 件「**期限が近い在庫にアプリを開かずに気づける**」（`docs/05-roadmap.md:640`）だけが
未達である。Unit A により在庫（`Stock.expiresAt`）に実データが入る経路が揃ったため、
本ユニット（Unit B: expiry-alert）で通知機能を実装する前提が満たされた。

方式は `docs/05-roadmap.md:660-664` でユーザー確定済み: **Web Push（VAPID）+ 日次 Cron**。
`setAppBadge` は iOS 非対応かつアプリ起動が前提のため却下されている。manifest（`display:
'standalone'`）と `appleWebApp`（`capable: true`）は既に iOS Web Push の前提（ホーム画面
追加）を満たしているが、`push` ハンドラ・購読テーブル・VAPID 鍵・`vercel.json` はいずれも
未整備（同 L663）。

本セッションで **P-1〜P-17 をすべてユーザー確定済み**（詳細は `docs/designs/expiry-alert.md`
§確定事項）。設計書のステータスは confirmed。P-12 は契約設計、P-13 / P-14 は実装計画、
P-15〜P-17 はセキュリティレビューの各フェーズで下流 Agent が検出した論点。

## 目的

- ユーザーがアプリを開かなくても、期限が近い（または期限切れの）在庫があることに
  日次で気づけるようにする（Web Push によるダイジェスト通知）。
- 通知をきっかけに `/pantry` へ遷移し、消費・廃棄・編集（Unit A の編集ダイアログ）などの
  行動に繋げられるようにする。

## ユーザー要求（原文の要約）

- roadmap Sprint 8 完了条件 3（`docs/05-roadmap.md:640`）:
  「期限が近い在庫にアプリを開かずに気づける」。
- ユーザー確定（2026-08-09、`docs/05-roadmap.md:660-664`）: 方式は Web Push（VAPID）+
  日次 Cron。`setAppBadge` は却下。
- ユーザー確定（2026-08-09、P-1〜P-6）: 詳細は `docs/designs/expiry-alert.md` §確定事項。
  Cron 基盤は Vercel Cron、通知は 1 日 1 通のダイジェスト再送あり、購読 ON/OFF はダッシュボード
  内、期限判定ロジックは Application 層へ移す（既存 UI も差し替える）、TZ は
  `Asia/Tokyo` を環境変数で固定、Push 購読情報は新規 Domain 集約として扱う。

## 機能要件

- FR-1: ユーザーはダッシュボードの「賞味期限が近い在庫」セクション内のボタンから、
  期限アラート通知の購読を ON にできる（確定・P-3）。
- FR-2: ユーザーは同じ導線から購読を OFF にできる。
- FR-3: 日次 Cron（Vercel Cron）が起動時点で期限が近い在庫を集計し、購読中の全エンドポイント
  へダイジェスト通知を送信する（確定・P-1・P-2）。
- FR-4: 通知は 1 日 1 通のダイジェスト形式で、期限が近い在庫がある限り再送する（送信履歴
  テーブルは持たない。確定・P-2）。
- FR-5: 期限判定ロジック（残日数・緊急度算出・閾値以内の選出**・残日数の文言生成**）を
  Application 層へ移し、ダッシュボードの表示ロジックも新規 UseCase 経由に差し替える
  （確定・P-4 / **P-14**）。`apps/web/src/app/_utils/expiry.ts` は削除する。
  CSS クラス名を返す `expiryUrgencyChipClass` は `category-color.ts` に据え置く。
- FR-6: 日付計算は `TZ=Asia/Tokyo` を Vercel 環境変数で固定した上で、既存のローカル日付規約
  （`toLocalDateString` 等）をそのまま利用する（確定・P-5）。
- FR-7: Push 購読情報（endpoint・鍵）を新規集約として Domain 層に持つ（確定・P-6）。
- FR-8: Cron エンドポイントは Vercel が付与する `Authorization: Bearer $CRON_SECRET` で
  保護し、汎用認証ミドルウェアは追加しない（確定・P-1 に付随）。

## 非機能要件

- 外部 I/O 新設（Push Service への配信）と Cron による定期実行を伴うため、L3 かつ
  「性能設計を厚く書く」条件に該当する（`docs/designs/expiry-alert.md` §性能を参照）。
- 追加費用は発生しない見込み（`docs/designs/expiry-alert.md` §費用を参照。Vercel Cron・
  Web Push・Neon いずれも本ユニットの利用規模では無料枠内）。
- 可用性: Push Service（FCM / Apple / Mozilla）や Cron 自体のダウンには対策を設けない
  （ベストエフォートの通知であり、翌日の再送で自然に回復する設計。§エラー処理 (a)(e) 参照）。

## 正常系

- N-1: ユーザーがダッシュボードで通知 ON ボタンを押し、ブラウザの通知許可を承認すると、
  購読情報が保存される。
- N-2: 期限が近い（または期限切れの）在庫がある状態で日次 Cron が実行されると、購読中の
  全エンドポイントに通知が届く。
- N-3: 通知をタップすると `/pantry` へ遷移する（確定・P-7）。
- N-4: 既に購読済みのブラウザで再度 ON を押しても、同一 `endpoint` の購読が重複して増えない
  （確定・P-8。`endpoint` に UNIQUE 制約を付け upsert する）。
- N-5: ユーザーが OFF を押すと、当該ブラウザの購読が削除され、以後通知が届かなくなる。
- N-6: ホーム画面に追加済みの iOS PWA で、ユーザージェスチャ起点の許可要求を経て通知が届く
  （実装上の罠 3）。
- N-7: 期限が近い在庫が無い日は、Cron は実行されるが送信対象 0 件として早期終了する
  （送信自体は行わない。確定・P-10）。
- N-8: 複数デバイス（例: 世帯 2 人分）が購読している場合、全デバイスに届く。

## 異常系

- E-1: Push Service が特定の購読に対して 404 / 410 を返す（失効）と、当該購読は削除され、
  他の購読への送信は継続する（確定・P-8。削除の判断は Application 層が行う）。
- E-2: Cron エンドポイントに不正な、または欠落した `Authorization` ヘッダでリクエストされると
  401 を返す。`CRON_SECRET` 環境変数自体が未設定の場合は 500 を返し、フェイルオープンしない
  （「値が無ければ `Bearer undefined` と比較して常に不一致になる」という偶然の安全ではなく、
  明示的にガードする）。
- E-3: 個別の Push 送信がタイムアウト・ネットワークエラーで失敗しても、Cron 全体は失敗させず、
  他の購読への送信を継続する（`Promise.allSettled` 相当。§エラー処理 (d)）。
- E-4: ブラウザが Push 非対応（`PushManager` が無い等）の場合、UI は ON ボタンを無効化するか
  エラーメッセージを表示する。
- E-5: ユーザーが通知許可を拒否した場合、UI はエラーメッセージを表示し購読を作成しない。
- E-6: 購読・購読解除 API に不正なリクエストボディ（`endpoint` が URL でない等）が送られると
  400（`zValidator` の契約層バリデーション。stock-edit で確認済みの規約と同じ）。
- E-7: VAPID 環境変数（公開鍵・秘密鍵・subject）が **1 つでも**未設定のまま Cron が実行されると、
  **送信を試みる前に**明示的なガードで 500 を返し、ログに記録する（確定・P-12 を Cron 経路にも
  適用。実装上の罠 4）。`?? ''` で空文字を渡して `setVapidDetails` の throw に頼る形は
  **採らない** — 偶然の 500 になり、設定不備と実行時障害をログで切り分けられなくなるため。
- E-8: `VAPID_PUBLIC_KEY` が未設定または空文字のとき `GET /api/push/vapid-public-key` は
  500 を返す（確定・P-12）。200 + 空文字にしない理由は、クライアントが「サーバ未設定」と
  「ブラウザ非対応」を区別できず購読ボタンが無反応になる形でしか現れないため。
- E-9: 購読件数が上限（10 件）に達した状態で**新規** `endpoint` の登録が来ると 422 を返す
  （確定・P-15）。**既存 `endpoint` の再登録は上限の対象外**で 204 を返す。

## 境界条件

- B-1: 数量が 0（または `numeric(10,3)` への丸めで実質 0）の在庫は**通知経路でのみ除外する**
  （確定・P-10b。実装上の罠 9）。ダッシュボード・`/pantry` の表示には引き続き現れるため、
  「画面には出るが通知には出ない在庫」が存在するのが正しい挙動である。
- B-2: 期限切れ（残日数が負）の在庫を通知対象に含めるか。既存の `selectExpiringStocks` /
  ダッシュボードの扱いと同様、**含める**（期限切れこそ最も気づくべき情報のため）。
- B-3: 購読も在庫も 0 件の日の Cron 実行（何もせず早期終了する。N-7 と対）。
- B-4: 同一エンドポイントに対する購読 API の連続呼び出し（二重送信・再購読）が重複行を
  作らないこと（確定・P-8）。**購読件数が上限に達していても既存 `endpoint` の再登録は
  成功する**（確定・P-15）。
- B-5: Cron が同時刻に重複起動された場合（Vercel Cron の仕様上まれ）、送信が二重に行われる
  可能性がある。冪等性キーは持たない設計（P-2 の確定に対応）ため、重複送信自体は許容する
  （リスク参照）。
- B-6: Vercel Cron（Hobby プラン）の発火は指定時刻ちょうどではなく、指定時刻を含む 1 時間の
  幅でブレる（実装上の罠 7）。「毎朝ちょうど n 時に届く」ことを前提にした試験観点は組めない。

## 前提

- Unit A（stock-edit）がマージ済みで、`Stock.expiresAt` に実データが入る経路が揃っている。
- `apps/web/src/app/manifest.ts`（`display: 'standalone'`）と `apps/web/src/app/layout.tsx`
  の `appleWebApp: { capable: true, ... }`（L23-27）は iOS Web Push の前提を既に満たしている。
- `apps/web/src/app/sw.ts` は Serwist 製の Service Worker として存在するが、`push` /
  `notificationclick` ハンドラは無い（実装上の罠 2 参照）。
- `apps/web/next.config.ts` は `NODE_ENV === 'production'` のときだけ Serwist を有効化する
  （L24-29）。dev では SW が生成されない（実装上の罠 1）。
- `vercel.json` はリポジトリに存在しない（新設が必要）。
- アプリコードに TZ 設定は無い（`TZ=Asia/Tokyo` を Vercel 環境変数として新設する。P-5）。
- 環境変数の検証層（`.env.example` やスキーマ検証）は存在しない。`apps/web/src/db/client.ts`
  の「未設定なら null、`getDb()` で初めて throw」が唯一の前例。
- Hono に `.use(` によるミドルウェアは 0 件（ADR-0003）。認証は導入しない。
- `web-push` パッケージは未導入（確定・P-9 で導入する。追加先は `packages/infrastructure`）。

## 制約

- 認証の全体導入はしない（ADR-0003 を再訪しない）。Cron エンドポイントの保護は
  当該ルート限定のインラインチェックとし、汎用ミドルウェアを追加しない。
- `apps/web/src/app/sw.ts` の既存 `runtimeCaching` 4 件（Google Fonts / 買い物リスト詳細 GET /
  店舗一覧 GET / `/shopping-lists*` GET）は `docs/tests/saturday-flow.md:83-85`
  （オフライン再訪問 O-01）が固定した挙動であり、`push` / `notificationclick` ハンドラの
  追加でこれを壊してはならない（実装上の罠 2）。
- `packages/infrastructure/tests/testing/create-test-db.ts` の PGlite DDL テンプレート
  （L100-113 が既存の `stocks` テーブル定義）に新規テーブルを手動で追記しないと、対応する
  Repository テストが全滅する（実装上の罠 6）。
- VAPID 秘密鍵をクライアントへ渡さない。公開鍵のみを配る経路（`GET /api/push/vapid-public-key`
  等）を設計する（実装上の罠 4）。

## 対象範囲

- Domain: Push 購読情報を表す新規集約（`PushSubscription`）とその Repository インターフェース。
- Application: 購読 ON/OFF の UseCase、日次ダイジェスト送信の UseCase、期限判定ロジックの
  移設（`GetExpiringStocksUseCase` 新設）。
- api-contract: 購読・購読解除のリクエストスキーマ。
- Infrastructure: 新規テーブル（`push_subscriptions`）・Repository 実装、VAPID 署名付き
  Push 送信の実装（`web-push` パッケージを利用する。確定・P-9）。`PushSender` port 自体は
  Domain に置く（確定・P-13）。
- Presentation: Cron 用ルート（Vercel Cron から `Authorization: Bearer $CRON_SECRET` で
  呼ばれる）、購読/購読解除の Hono ルート、`sw.ts` への `push` / `notificationclick`
  ハンドラ追加、ダッシュボードへの購読 ON/OFF UI 追加。
- 設定: `vercel.json` の新設（Cron スケジュール定義）、Vercel 環境変数（VAPID 鍵一式・
  `CRON_SECRET`・`TZ=Asia/Tokyo`）の追加。

## 対象外

- 認証の導入（ADR-0003 を再訪しない）。Cron エンドポイントの Bearer 保護は当該ルート限定。
- Unit C（stock-undo。消費・廃棄の取り消し）。
- Sprint 9 の Background Sync（`sw.ts` を両ユニットが触るため、共存方針のみ設計書
  §将来課題に残す）。
- 通知の送信履歴・開封率などの分析。
- 期限アラート以外の通知（献立リマインダー等）。
- DB スキーマ変更のうち、`stocks` テーブルへの変更（既存の nullable 列をそのまま利用する）。

## 後方互換性・データ移行

新規テーブル（`push_subscriptions`）の追加のみで、既存テーブル・既存データへの影響は無い。
既存の `stocks` / `pantry` 関連スキーマは変更しない。ダッシュボードの期限判定ロジックを
Application 層へ移設する変更（P-4）は挙動不変を目標とするが、既存 UI（ダッシュボード・
`/pantry`）のコードパスに手が入るため、移設前後で表示結果が変わらないことをリグレッション
テストで確認する（`docs/designs/expiry-alert.md` §テスト方針）。

## 受け入れ条件（Definition of Done に対応）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る（変更パッケージ分）。
- [ ] Domain: `PushSubscription` 集約の単体テスト（生成・復元・不変条件）。
- [ ] Application: 購読 ON/OFF UseCase・`SendExpiryAlertsUseCase`・`GetExpiringStocksUseCase`
      のテスト（正常系・購読 0 件・在庫 0 件・送信失敗の一部混在ケースを含む）。
- [ ] Infrastructure: PGlite 回帰テスト（`push_subscriptions` の save/findAll/findByEndpoint/
      deleteByEndpoint(s)）。`create-test-db.ts` への DDL 追記を含む。
- [ ] apps/web: Cron ルートのテスト（200/401/500）、購読/購読解除ルートのテスト（200/400）、
      ダッシュボードの購読 ON/OFF UI のコンポーネントテスト。
- [ ] `expiry.ts` 相当の期限判定ロジック移設後、ダッシュボード・`/pantry` の既存表示に
      回帰が無いことを確認するテスト。
- [ ] iOS 実機での Push 到達確認手順を実施する（P-11 の手順に従う。dev では SW が生成されない
      制約があるため、Preview Deployment 等の本番ビルド環境を使う）。
- [ ] roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を満たす。

## 未決事項（誰に何を確認するか）

**未決事項なし。** P-1〜P-17 はすべて 2026-08-09 にユーザー確定済み（Orchestrator 経由の確認）。
確定内容と非採用案の記録は `docs/designs/expiry-alert.md` §確定事項を正典とする。

参考として P-7〜P-11 の確定結果を再掲する（詳細は設計書側）。

- P-7: 既存 `formatExpiryUrgencyLabel` を流用し、先頭 3 件 +「他 n 件」で要約。タップで `/pantry`。
- P-8: `endpoint` に UNIQUE 制約。失効（404/410）検知時の削除判断は Application 層が行う。
- P-9: `web-push` パッケージを追加する。
- P-10: Cron は JST 08:00 台（UTC `0 23 * * *`）。数量 0 の在庫は**通知経路だけ**で除外する。
- P-11: Vercel Preview Deployment + iPhone 実機で確認する。
