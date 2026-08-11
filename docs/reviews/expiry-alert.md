# レビュー記録: expiry-alert（設計フェーズ・成果物 6 点）

- レビュー日: 2026-08-09
- レビュー対象（実装は未着手。設計成果物のみ）:
  - `docs/requirements/expiry-alert.md`
  - `docs/designs/expiry-alert.md`（confirmed・P-1〜P-14）
  - `docs/designs/expiry-alert.contract.md`
  - `docs/tests/expiry-alert.md`
  - `docs/implementation-plans/expiry-alert.md`
  - `docs/decisions/ADR-0017-web-push-expiry-alert.md`
- 観点: 文書間整合（N-x/E-x/B-x のトレーサビリティ・P-1〜P-14 の反映）/ 実コードとの事実整合 /
  設計判断の妥当性 / 抜け漏れ（特に実装計画のステップ分解）/ ドキュメント品質 /
  障害設計（外部 I/O 新設のため適用）
- **セキュリティ観点は対象外**（security-reviewer が `docs/reviews/expiry-alert.security.md` で並行実施）。
  本書は M-3 で「秘密情報そのもの」ではなく「未設定時のフェイルクローズ挙動が要件 E-7 を満たさない」
  という**要件充足性**の観点だけを扱う。
- 結果: **Must 5 件 / Should 8 件 / Nice 7 件**

---

## 0. 先に確認できた「問題なし」の範囲（再検証不要）

以下は実コードを開いて裏取りし、文書の記述が正しいことを確認した。後続工程は再検証しなくてよい。

| 文書の記述                                                                                                                                        | 実コードでの確認                                                                                                                                                                                     | 判定                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `next.config.ts` は `NODE_ENV === 'production'` のときだけ Serwist を適用（L24-29）                                                               | `apps/web/next.config.ts:24-29` の三項演算子                                                                                                                                                         | 一致                                                                      |
| `sw.ts` は Serwist のみ・`push`/`notificationclick` ハンドラ無し・全 58 行・`serwist.addEventListeners()` は L58                                  | `apps/web/src/app/sw.ts`（58 行）                                                                                                                                                                    | 一致（設計書 L71 の「全 58 行」が正・試験計画の「59 行」は N-1 参照）     |
| `runtimeCaching` 4 件 = Google Fonts / `GET /api/shopping-lists/:id` / `GET /api/stores` / `GET /shopping-lists*`                                 | 同 L17-55                                                                                                                                                                                            | 一致（設計書の「L18-54」は誤差 1 行内）                                   |
| `packages/infrastructure` は `@cookpit/domain` にのみ依存（P-13 の根拠）                                                                          | `dependencies` は `@cookpit/domain`/`@neondatabase/serverless`/`drizzle-orm` の 3 件のみ                                                                                                             | 一致                                                                      |
| `vercel.json` はリポジトリに存在しない                                                                                                            | `ls vercel.json` → not found                                                                                                                                                                         | 一致                                                                      |
| Hono の `.use(` は 0 件（ミドルウェア・認証なし）                                                                                                 | `apps/web/src` 全体で 0 件                                                                                                                                                                           | 一致                                                                      |
| `app.ts` は全 35 行・7 ルート・`onError` は L24-33 の 3 分岐                                                                                      | `apps/web/src/server/app.ts`                                                                                                                                                                         | 一致                                                                      |
| Cron を `GET` にできる（Route Handler の割当）                                                                                                    | `app/api/[[...route]]/route.ts` は `runtime='nodejs'` で GET/POST/PUT/PATCH/DELETE を `handle(app)` に割当                                                                                           | 一致                                                                      |
| `create-test-db.ts`: `CREATE TABLE stocks` が L100-111、`CREATE INDEX` が L113、閉じ `` ` `` が L114、全 123 行                                   | 実測一致                                                                                                                                                                                             | 一致（契約書 §2・試験計画 §5-1・実装計画 前提確認 1 の 3 文書とも正しい） |
| 既存マイグレーションは `0000`〜`0007`。次は `0008`                                                                                                | `apps/web/src/db/migrations/`                                                                                                                                                                        | 一致                                                                      |
| `stocks.amount_value` が `numeric(10,3)`（罠 9 の根拠 `schema.ts:150`）・`expires_at` は `date()` nullable・index は `stocks_product_id_idx` のみ | `packages/infrastructure/src/db/schema.ts:144-162`                                                                                                                                                   | 一致                                                                      |
| `expiry.ts` の 6 値 export（`EXPIRY_URGENCY_WITHIN_DAYS=3` ほか）と各関数の実装内容                                                               | `apps/web/src/app/_utils/expiry.ts`                                                                                                                                                                  | 一致（実装計画 Step 3-1 の移設コードは実装と一字一句同じ）                |
| `selectExpiringStocks` は `dashboard-view.ts` L19-31。呼び出し元は `page.tsx` の 1 箇所のみ                                                       | `page.tsx:4,16` のみ（他は JSDoc 内の言及）                                                                                                                                                          | 一致                                                                      |
| `expiryUrgencyChipClass` は `category-color.ts:66-68`、引数は `urgency: string`（`ExpiryUrgency` を import していない）                           | 実測一致                                                                                                                                                                                             | 一致（実装計画 前提確認 11 が正しい。P-14 の「据え置き」は安全）          |
| `dashboard.tsx` に `'use client'` は無い／`stock-row.tsx` 自身にも無く `pantry-client.tsx`（`'use client'`）配下                                  | 実測一致                                                                                                                                                                                             | 一致（試験計画 §0-2・実装計画 前提確認 10 が正しい）                      |
| `dashboard.tsx` の「賞味期限が近い在庫」`<section>` は L108 開始                                                                                  | 実測一致                                                                                                                                                                                             | 一致                                                                      |
| `layout.tsx` の `appleWebApp: { capable:true, statusBarStyle:'default', title:'Cookpit' }` は L23-27                                              | 実測一致                                                                                                                                                                                             | 一致                                                                      |
| `StockDto.amount` は `{ value: number; unit: Unit }`（P-10b の `stock.amount.value > 0` が型上成立）                                              | `packages/application/src/pantry/pantry.dto.ts:9`                                                                                                                                                    | 一致                                                                      |
| ID 値オブジェクトの基底は `shared/identifier.ts` L13-25、`generateId()` は L27-29                                                                 | 実測一致                                                                                                                                                                                             | 一致（試験計画 §0-1 の「L13-25」が正しい）                                |
| `api-contract/src/index.ts` は 8 行・既存 7 本の `export *` のみ                                                                                  | 実測一致                                                                                                                                                                                             | 一致                                                                      |
| `NETWORK_ERROR_MESSAGE` は `use-api-action.ts:9`                                                                                                  | 実測一致                                                                                                                                                                                             | 一致（試験計画 EAS-07）                                                   |
| `repositories.ts` は `getDb()` を渡す手動 DI 関数 6 本（L11-33）                                                                                  | 実測一致                                                                                                                                                                                             | 一致                                                                      |
| `docs/reviews/stock-edit.md` の S-5（`numeric(10,3)` 丸め）は L156 起点                                                                           | 実測一致                                                                                                                                                                                             | 一致（設計書の `:156-164` 参照は生きている）                              |
| **Markdown テーブルの描画**                                                                                                                       | 6 文書すべてを走査し、セル内改行でテーブルが途切れる箇所は **0 件**                                                                                                                                  | 一致（Unit A の N-4 は再発していない。ただし N-2 の見出し崩れは別途あり） |
| 要件 N-1〜N-8 / E-1〜E-6 / B-1〜B-6 の試験観点への引き継ぎ                                                                                        | すべて試験計画に観点 ID（SUB/UNSUB/SEA/GES/Z-PUSH/INF/WH/EAS/MB）付きで対応あり                                                                                                                      | 一致（**E-7 のみ欠落 → M-3**）                                            |
| ADR-0017 Decision 6/7 と設計書 P-13/P-14、試験計画の更新注記の整合                                                                                | ADR L121-128（P-14）/ L130-145（P-13）と設計書 L1072-1095 / L1041-1070、試験計画 L17-27 が一致                                                                                                       | 一致（**実装計画のみ未反映 → M-1**）                                      |
| P-12 の反映（`vapid-public-key` を 500 フェイルクローズ）                                                                                         | 設計書 L612-625・§API 設計表 / 契約書 §5-2・§5-4・§6・§9.1・§10.1・§10.2 / 試験計画 WH-PUSH-02/03 / 実装計画 Step 5-2 のすべてで 500 に揃っている                                                    | 一致                                                                      |
| 障害設計 (a)(b)(d)(e)                                                                                                                             | リトライ 0 回（無限リトライ無し）・`timeout: 10_000`・`Promise.allSettled` による部分失敗隔離・縮退 UI 無しの明示 — いずれも設計書 §エラー処理に記載あり、試験観点（SEA-05/06/09・INF-WPS-02）も対応 | 妥当                                                                      |

**未検証（本レビューの範囲外・要注意）**: `packages/domain/src/index.ts` の行番号（L1-49）、
`packages/domain/tests/` 配下の既存テスト内容、`dashboard.test.tsx`／`stock-row.test.tsx` の
中身（実装計画 前提確認 12 自身が「中身は未確認」と明記）。`pnpm lint`/`type-check` は
`node_modules` 未インストールのため実行していない。

---

## Must（着手前に直すべき）

### M-1. 実装計画が P-13 / P-14 の確定を取り込んでおらず、未決事項として着手をブロックする

- 対象: `docs/implementation-plans/expiry-alert.md:3` / `:4` / `:27` / `:38` / `:59` / `:66` /
  `:261-262` / `:306-308` / `:612` / `:620-624` / `:1118` / `:1130` / `:1434-1435` / `:1489` /
  `:1493-1538` / `:1547`
- 問題: P-13 / P-14 は 2026-08-09 にユーザー確定済みであり、設計書・ADR・試験計画には反映済み。
  しかし実装計画だけが**確定前のスナップショットのまま**で、次の記述が残っている。
  - `:3` 「ステータス: ready（**要 Orchestrator 確認 2 件**。末尾「Orchestrator への申し送り」参照）」
  - `:4` 「設計書: … **P-1〜P-12** は 2026-08-09 ユーザー確定」（P-14 まで確定済み）
  - `:306-308` 「この配置変更は…**実装着手前に Orchestrator の確認を得ること**」（P-13 で確定済み）
  - `:624` 「これは P-4 の…字句とは矛盾するため、**実装着手前に Orchestrator の確認を得ること**」（P-14 で確定済み）
  - `:1493-1538` 申し送り#1 / #2 が「確認したいこと: この配置変更で進めてよいか」のまま
  - `:1547` DoD の**先頭チェック項目**が「申し送り#1・#2 について Orchestrator の確認が得られている（実装着手前）」
  - `:1434-1435` IMP-1 / IMP-2 が「reviewer が『設計から逸脱している』と誤診する可能性」というリスクとして残存
  - `:1489` ドキュメント更新対象 #4「ADR 本文または末尾の補記として実装との差異を記録するかを Orchestrator が判断する」（ADR は既に Decision 6/7 として本文反映済み）
- 根拠: 設計書 `:1038-1039`（確定表に P-13 / P-14）、`:1041-1095`（P-13 / P-14 の詳細＝確定）、
  ADR-0017 `:121-128`（Decision 6 に P-14 を本文取り込み）/ `:130-145`（Decision 7 が P-13）、
  試験計画 `:17-27`（P-13 / P-14 反映済みと明記）。
- 影響: implementer は実装計画を正典として読む。DoD の第 1 項目が「未確定事項の確認待ち」に
  なっているため、着手前に不要な差し戻しが 1 往復発生する。ユーザーの懸念（P-14 の取りこぼし）が
  **実際に起きているのはこの文書**。
- 直し方:
  1. `:3` を「ステータス: ready（P-1〜P-14 確定済み。未決事項なし）」、`:4` を「P-1〜P-14」に更新。
  2. Step 1-4（`:261-308`）と Step 3-1（`:612-624`）の「提案」「確認を得ること」を
     「P-13 確定」「P-14 確定」の記述に置換し、根拠として設計書 §確定事項 P-13 / P-14 を参照。
  3. §Orchestrator への申し送り（`:1493-1538`）は削除するか「**解決済み: P-13 / P-14 として確定**」の
     1 段落に圧縮。IMP-1 / IMP-2 のリスク行と DoD `:1547` のチェック項目を削除。
  4. 新規作成ファイル一覧から #15（`push-sender-types.ts`）を削除。#31 は Step 6（`:1124-1130`）が
     「作らない」と確定済みなので同様に削除（N-5 も参照）。
  5. `:1489` の #4 を「対応済み（ADR-0017 Decision 6 / 7 に本文反映済み）」に更新。

### M-2. 要件定義書が P-12 / P-13 / P-14 を一切反映していない。FR-5 が P-14 と矛盾する

- 対象: `docs/requirements/expiry-alert.md:24-25` / `:40-43` / `:54-55` / `:153-161` / `:199-210`
- 問題:
  - `:24-25` 「本セッションで **P-1〜P-11 をすべてユーザー確定済み**」、`:201` 「**未決事項なし。**
    P-1〜P-11 はすべて 2026-08-09 にユーザー確定済み」— P-12 / P-13 / P-14 への言及が 1 箇所も無い。
  - `:54-55` **FR-5**: 「期限判定ロジック（**残日数・緊急度算出・閾値以内の選出**）を Application 層へ
    移し、ダッシュボードの表示ロジックも新規 UseCase 経由に差し替える（確定・P-4）」。
    P-14 で移設が確定した**文言生成 `formatExpiryUrgencyLabel`** がこの列挙に含まれず、
    `apps/web/src/app/_utils/expiry.ts` を削除するという確定も書かれていない。
  - `:155` §対象範囲の Application 行も「期限判定ロジックの移設（`GetExpiringStocksUseCase` 新設）」止まり。
  - `:153` Domain の対象範囲に **`PushSender` port（P-13 で Domain 配置に確定）** が無い。
- 根拠: 設計書 `:1072-1095`（P-14 の詳細）/ `:1041-1070`（P-13 の詳細）、ADR-0017 `:121-128` /
  `:130-145`。
- 影響: 要件が下流成果物より狭い。実装完了時に「FR-5 を満たしたか」を要件書だけで判定すると
  `formatExpiryUrgencyLabel` の移設漏れを検知できない。要件 → 設計 → 試験のトレーサビリティが
  この 1 点で切れる。
- 直し方: FR-5 に「文言生成（`formatExpiryUrgencyLabel`）を含む `expiry.ts` の全 export を移設し、
  `apps/web/src/app/_utils/expiry.ts` は削除する（確定・P-14）」を追記。§対象範囲 Domain に
  `PushSender` port を追加。§未決事項の「P-1〜P-11」を「P-1〜P-14」に直し、参考再掲に
  P-12 / P-13 / P-14 の 3 行を追加する。

### M-3. 要件 E-7（VAPID 未設定時に Cron が 500）が設計・契約・試験のどこにも実装されていない。実装計画はむしろ `?? ''` でフェイルオープンする

- 対象: 要件 `docs/requirements/expiry-alert.md:102-104`（E-7） /
  実装計画 `:987-993`（`pushSender()`） / 設計書 `:643-662`（`cronRoute`） / 試験計画 §6-2
- 問題: E-7 は「VAPID 環境変数（公開鍵・**秘密鍵・subject**）が未設定のまま Cron が実行されると、
  送信処理は失敗としてログに記録し、Cron のレスポンスは 500 を返す（実装上の罠 4・**トラブル
  シュートのためにサイレント失敗にしない**）」と定めている。しかし:
  1. `cronRoute` のガードは `CRON_SECRET` のみ。VAPID 3 変数を検査しない。
  2. 実装計画 `:987-993` は次のとおり空文字で握りつぶす。

     ```ts
     export function pushSender(): WebPushSender {
       return new WebPushSender(
         process.env.VAPID_PUBLIC_KEY ?? '',
         process.env.VAPID_PRIVATE_KEY ?? '',
         process.env.VAPID_SUBJECT ?? '',
       );
     }
     ```

     これは **P-12 が `vapid-public-key` から取り除いたのと同じ `?? ''` パターン**である。
     設計書 §確定事項 `:1037` の P-12 は「**全エンドポイントで** 500 フェイルクローズに揃える」と
     書いており、この `pushSender()` はその確定に真正面から反する。

  3. 実際には `webpush.setVapidDetails('', '', '')` が throw して `app.onError` 経由で 500 になる
     公算が高いが、それは**偶然の安全**であり、要件 E-2 の理由づけ（「値が無ければ
     `Bearer undefined` と比較して常に不一致になるという**偶然の安全ではなく、明示的にガードする**」
     `:92-94`）と正反対の作りになる。`console.error('VAPID … is not configured')` も出ないため、
     Vercel 実行ログには `Internal Server Error` しか残らず、罠 4 が防ごうとした
     「環境変数の設定忘れで静かに壊れる」がそのまま起きる。
  4. 試験計画は E-7 を **WH-PUSH-02 / WH-PUSH-03（`vapid-public-key` の 500）にだけ**割り当てている
     （`:350-351`）。これは E-7 が述べている「**Cron が実行される**」シナリオとは別物であり、
     `cronRoute` 側の VAPID 未設定ケースは WH-CRON-01〜08 のどこにも無い。

- 直し方:
  1. `pushSender()`（または `cronRoute` の先頭、`CRON_SECRET` チェックの直後）で
     `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` の未設定・空文字を明示チェックし、
     `console.error` の上で 500 `{ error: 'Server misconfigured' }` を返す。`?? ''` は使わない。
  2. 設計書 §変更後構成の `cronRoute` コード例・§API 設計の表（500 の発生条件）と、契約書 §5-3 の
     ステータス対応表・§9.4 のサンプルに当該 500 を追加する。
  3. 試験計画 §6-2 に **WH-CRON-09（`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` 未設定 → 500 かつ
     `SendExpiryAlertsUseCase.execute` が呼ばれない）** を追加し、要件 E-7 のマッピングを
     WH-PUSH-02/03 からこちらへ付け替える（`vapid-public-key` 側は P-12 由来の別観点として残す）。

### M-4. `sw.ts` 追記のコード例が既存ファイルの型付けパターンと不整合で、そのままでは `type-check` を通らない見込み

- 対象: 設計書 `:685-698` / 実装計画 `:1278-1293`（Step 8-1）
- 問題: 既存 `apps/web/src/app/sw.ts` は**素の `self` を Service Worker グローバルとして扱っていない**。
  L10 で明示的にキャストしている。

  ```ts
  // apps/web/src/app/sw.ts:10（実測）
  const sw = self as unknown as WorkerGlobalScope & typeof globalThis;
  ```

  そして `apps/web/tsconfig.json` の `lib` は `["dom", "dom.iterable", "esnext"]` で
  **`webworker` を含まない**。この状態で設計書・実装計画のコード例のとおり

  ```ts
  self.addEventListener('push', (event) => { const data = event.data?.json() ... });
  self.registration.showNotification(...);
  self.clients.openWindow(url);
  ```

  と書くと、`self` は `Window & typeof globalThis` として解決される。`'push'` は `WindowEventMap` に
  無いのでハンドラ引数が `Event` に落ち `event.data` が型エラー、`self.registration` /
  `self.clients` は `Window` に存在せず型エラー、`notificationclick` の `event.notification` も同様。
  Step 8 の完了条件（`:1332`）は `pnpm --filter @cookpit/web type-check` を含むため、
  着手直後に確実に詰まる。**既存ファイルがわざわざキャストを置いている事実が、素の `self` では
  型が付かないことの傍証**である。

- 直し方: Step 8-1 に型付け方針を明記する。いずれか 1 つで足りる。
  - 既存の `sw` 別名を `ServiceWorkerGlobalScope` へ拡張して `sw.addEventListener('push', ...)` /
    `sw.registration` / `sw.clients` を使う（既存の `WorkerGlobalScope` 拡張との整合を確認）。
  - `apps/web/tsconfig.json` の `lib` に `"webworker"` を追加する（DOM 型と衝突しうるため要検証）。
  - `PushEvent` / `NotificationEvent` を明示的に型注釈する。

  どれを採るかは設計判断ではなく実装詳細だが、**「素の `self` で書ける」と読める現状のコード例は
  誤解を招く**ため、コード例自体を修正するのが望ましい。

### M-5. 実装計画のコード例が `@cookpit/domain/src/...` へディープ import している（ADR-0010 の公開境界違反・既存 0 件）

- 対象: `docs/implementation-plans/expiry-alert.md:413` / `:414` / `:415` / `:506` / `:683` /
  `:709` / `:710` / `:741` / `:759` / `:763` / `:764`（計 11 箇所）

  ```ts
  import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository'; // :683
  import { PushSubscription } from '@cookpit/domain/src/push-subscription/push-subscription'; // :709
  ```

- 根拠: 既存の `packages/application/src/**` は**例外なく**バレル import
  （`import { RecipeId } from '@cookpit/domain';` / `import type { RecipeRepository } from '@cookpit/domain';`）
  を使っており、`@cookpit/domain/src` を指す箇所は実測 **0 件**。`packages/domain/package.json` は
  `main`/`types` に `./src/index.ts` を指すだけで `exports` によるサブパス公開を行っていない。
  ADR-0010（パッケージの公開境界）に反し、同じ実装計画の Step 1-5（`:310-318`。
  `domain/src/index.ts` へバレル追記する）とも矛盾する。
- 影響: implementer はコード例をそのまま写す。11 箇所すべてが公開境界違反として実装レビューで
  差し戻しになる（＝手戻り 1 往復）。
- 直し方: Step 2 / Step 3 の全コード例を
  `import { PushSubscription, PushSubscriptionId } from '@cookpit/domain';` /
  `import type { PantryRepository, PushSubscriptionRepository, PushSender, PushPayload,
PushSendResult, PushSubscriptionTarget } from '@cookpit/domain';` に統一する。

---

## Should（直したほうがよい）

### S-1. 試験計画が設計書の**旧行番号**を引用したまま（自ら「引用しない」と宣言しているのに残っている）

- 対象: `docs/tests/expiry-alert.md:26-27` の宣言 vs `:51-68`（§0-1 の「出典」列）/ `:381` / `:468` / `:675`
- 問題: `:26-27` は「設計書・契約設計書はこちらで更新済みのため本書は再読していない
  （**新しい行番号は引用しない**）」と明記している。にもかかわらず §0-1 の出典列は
  L178-207 / L215-227 / **L419-437** / **L439-446** / **L358-415** / **L277-284** / **L508-537** /
  **L551-576** / **L588-615** / **L618-638** / **L659-674** / **L676-692** を引用し、
  §7-1 は L927-929、§9 は L896-901、§15 項目 5 は L930-931 を引用している。
- 根拠（実測との突き合わせ）: P-13 / P-14 の注記挿入で設計書の行が 20〜30 行下がっている。
  実測では `SubscribeToExpiryAlertUseCase` は **L443-472**、`SendExpiryAlertsUseCase` は
  **L374-441**、`GetExpiringStocksUseCase` は **L286-295**、`DrizzlePushSubscriptionRepository` は
  **L532-561**、`WebPushSender` は **L572-600**、`pushRoute` は **L612-639**、`cronRoute` は
  **L643-662**、`sw.ts` 追記は **L685-698**、購読 UI は **L701-717**、§テスト方針は **L955-956**。
  引用中の行番号は**ほぼ全滅**している。
- 直し方: 行番号を落として節名参照（「設計書 §変更後構成 Application」等）に統一する。行番号は
  文書更新で必ず腐るため、確定済み文書間の相互参照は節名で行うほうが保守できる。

### S-2. 契約設計書も設計書の旧行番号を引用している

- 対象: `docs/designs/expiry-alert.contract.md:154`（「§変更後構成 api-contract、**L456-479**」）/
  `:230` の表ヘッダ（同）/ `:661-663`（「本体設計書 **L426-437**」「**L449-452**」）
- 根拠: 実測では api-contract のコード例は **L481-504**、`SubscribeToExpiryAlertUseCase` の
  疑似コードは **L443-472**、プレースホルダ注記は **L474-477**。
- 直し方: S-1 と同じ。節名参照に置換する。

### S-3. `SendExpiryAlertsUseCase` が内部で `new GetExpiringStocksUseCase(...)` している（DI の外・UseCase 間の直接依存）。試験計画の SEA-\* 前提とも噛み合わない

- 対象: 設計書 `:396` / 実装計画 Step 3-4 / 試験計画 SEA-02・SEA-07・SEA-08・SEA-10 の「前提」列
- 問題:
  1. CLAUDE.md / `.claude/rules/domain-layer.md` は「1 ユースケース = 1 クラス・`execute()`」
     「DI は手動 DI（**コンストラクタ注入**）」としている。`execute()` の中で別の UseCase を `new`
     すると依存がコンストラクタシグネチャに現れず、差し替え点が消える。
     `SendExpiryAlertsUseCase` のコンストラクタは `pantryRepository` を受け取るのに、それを
     使う主体は自分ではなく内部生成した `GetExpiringStocksUseCase` という捻れも生む。
  2. 試験計画 SEA-02 は「`GetExpiringStocksUseCase` の結果が空」、SEA-07 は
     「`GetExpiringStocksUseCase` の結果に `amount.value === 0` の在庫を含める」を**前提**として
     書いているが、内部 `new` のため**テスト側から直接は制御できない**。実際には
     `InMemoryPantryRepository` に在庫を seed して間接的に作るしかなく、前提列の記述と
     テスト実装が乖離する。
- 直し方（いずれか）:
  - 案 A: `SendExpiryAlertsUseCase` は UseCase ではなく純粋関数を共有する
    （`selectExpiringStocks(toPantryDto(await this.pantryRepository.find()).stocks, asOf,
EXPIRY_URGENCY_WITHIN_DAYS)`）。P-4 の目的「判定を一本化してズレを構造的に防ぐ」は
    `selectExpiringStocks` を共有していれば満たされる。
  - 案 B: `GetExpiringStocksUseCase` をコンストラクタ注入にする。
  - いずれの場合も試験計画 SEA-\* の「前提」列を実際に制御可能な表現（PantryRepository への seed）に
    書き直す。

### S-4. `TZ=Asia/Tokyo` が Vercel で実際に効くかの裏取りが無く、手動確認にも「効果」の検証が無い

- 対象: 設計書 `:813-818`（罠 5）/ `:1173-1184`（P-5）/ R-5 / ADR-0017 `:147-158` /
  試験計画 `:487`（§10-1 の `TZ` 行）
- 問題:
  1. 本ユニットは費用（`:1003`）・Vercel Hobby の Cron 制約（罠 7）・Apple の VAPID subject 制約
     （罠 8）にはいずれも「2026-08-09 に公式ドキュメントで確認」と出典を付けている。しかし
     **`TZ` 環境変数が Vercel Functions の Node.js ランタイムで有効かどうかだけ出典が無い**。
     ここが効かなければ P-5 の前提（既存のローカル日付規約をそのまま使う）が丸ごと崩れる。
  2. 影響が大きい: Cron の実行時刻は JST 08:00 台 = **UTC 23 時台**で、UTC 基準では「前日」に
     あたる。`toLocalMidnight` が UTC で動くと `asOf` が 1 日前になり、対象在庫の選定が
     日付ごとずれる。まさに罠 5 が言う「コード上に痕跡が残らない」故障。
  3. 試験計画 §10-1 の `TZ` 行の確認事項は「**Preview Deployment の環境変数に設定済みであること**」
     ＝設定の**有無**だけで、**効果**を確認していない。MB-01〜MB-14 にも該当項目が無い。
     設定したのに効かなかった場合、この試験計画では検知できない。
- 直し方:
  1. `TZ` が Vercel の予約変数でないこと・Node ランタイムに反映されることを一次情報で確認し、
     設計書 §確定事項 P-5 または §移行とリリースに出典を残す。
  2. MB に「Cron を **UTC 23 時台（JST 翌朝 08 時台）** に手動実行し、レスポンスの
     `expiringStockCount` が **JST 基準で数えた期待値**と一致すること」を追加する。
     もしくは「JST 00:00〜09:00 の時間帯にダッシュボードの『賞味期限が近い在庫』が
     JST 基準の件数になっていること」を目視確認する項目でもよい（ADR-0017 `:157-158` が
     この時間帯の既存ズレの解消を効果として挙げているため、そこが検証点になる）。
  3. 効かなかった場合の代替（P-5 案 B: コード上で `Asia/Tokyo` を明示）を「棄却」ではなく
     「フォールバック候補」として残しておく。

### S-5. `stock-row.tsx` から `@cookpit/application` を**値 import** するのは本リポジトリで初のケース。R-12 は「バンドルサイズ」より重い（ビルド失敗）リスクを含む

- 対象: 設計書 `:316-321`（R-12 の申し送り）/ `:998`（R-12 の表）/ 実装計画 `:1189-1199` /
  試験計画 §0-2・§15 項目 7
- 根拠（実測）:
  - `apps/web/src` から `@cookpit/application` を**値**で import しているのは
    Server Component（`page.tsx` 群）と `server/routes/*` のみ。クライアント側
    （`shopping-list-client.tsx:14-20` など）は**すべて `import type`** で、値 import の前例が
    **0 件**である。
  - `@cookpit/application` のバレル（`src/index.ts`）は `./pantry` などを `export *` し、
    そこから `@cookpit/domain` を辿る。`packages/domain/src/shared/identifier.ts:1` と
    `packages/domain/src/shared/store.ts:1` は `import { randomUUID } from 'node:crypto'` を持つ。
  - つまり tree-shaking が期待どおり効かなかった場合の症状は「バンドルが太る」ではなく
    **client bundle で `node:crypto` が解決できずビルドが落ちる**。R-12 の「ページ初期表示が
    遅くなる可能性」という影響記述は実態より軽い。
- さらに: Step 6 の完了条件（`:1203-1207`）は `test` / `type-check` / `lint` のみで
  **`build` を含まない**。`pnpm --filter @cookpit/web build` は Step 8 まで登場しないため、
  この不具合が出るとしても Step 6 完了後 2 ステップ経ってから発覚する。
- 直し方:
  1. R-12 の影響を「クライアントバンドルへの Node 組み込みモジュール混入によるビルド失敗の可能性」に
     格上げする。
  2. Step 6 の完了条件に `pnpm --filter @cookpit/web build` の成功を**必須**として追加する
     （移設直後に検知できる位置）。
  3. 回避策を併記する: `@cookpit/application` に `./pantry/expiry` 相当のサブパス export を用意する、
     または `stock-row.tsx` で計算をやめて Server Component 側で算出済みの
     `remainingDays` / `urgency` / `label` を props で渡す（Presentation 層の責務としても素直）。

### S-6. MB-05 の期待値が同一セル内で自己矛盾している（「他 2 件」と「他 1 件」）

- 対象: `docs/tests/expiry-alert.md:549`
- 問題: 「Cron 実行後の通知本文が『**先頭 3 件 + 他 2 件**』の形式になっている（ES-1〜ES-4 が閾値内、
  ES-5 は amount 0 で除外、ES-6 は閾値外で除外。閾値内が ES-1〜ES-5 の 5 件中、amount>0 なのは
  ES-1〜ES-4 の 4 件 → **先頭 3 件 + 他 1 件**になるはず）」。1 つのセルに 2 通りの期待値が書かれており、
  実施者がどちらを PASS 基準にするか決められない。**「該当環境が無い／期待値が曖昧なので PASS」型の
  false PASS を招く構造**であり、Unit A で 4 回起きたパターンそのもの。
- 直し方: 期待値を「**先頭 3 件 + 他 1 件**」に一本化する（ES-1 asOf+1・ES-2 asOf-1・ES-3 asOf 当日・
  ES-4 asOf+2 の 4 件が対象、ES-5 は数量 0 で除外、ES-6 は閾値外）。あわせて §3-3 SEA-10
  （在庫 5 件 → 先頭 3 件 + 他 2 件）と件数が異なる点を「自動テストと手動確認で seed が異なる」と
  1 行注記して混同を防ぐ。

### S-7. §10 の手動確認に「Push Service 側の失効（E-1）」と「購読 0 件（B-3）」の実地確認が無い

- 対象: `docs/tests/expiry-alert.md:542-560`（MB-xx 一覧）
- 問題: 本ユニットで自動テストが必ずモックになる領域は 2 つある。
  1. **E-1（404/410 による購読削除）**: SEA-04 と INF-WPS-03/04 で検証するが、いずれも
     `PushSender` / `web-push` をモックした前提。**実際の Push Service が返す失効を `web-push` が
     `err.statusCode` に載せるか**は自動テストでは一切検証できない。ここを外すと
     「モックは Green・実機だけ失効購読が永久に残る」という典型的な false PASS になる。
     MB-02（Android で OFF → 以後届かない）は**アプリ側 unsubscribe 経路**であって
     Push Service 側の失効経路ではないため代替にならない。
  2. **B-3（購読も在庫も 0 件）**: MB-11 は「在庫 0 件」だけを扱い、購読 0 件のケースが無い。
- 直し方: MB に 2 件追加する。
  - **MB-15（E-1）**: 一方の端末でブラウザの通知権限を取り消す／サイトデータを削除して購読を
    無効化 → Cron を `curl` → レスポンスの `removedCount` が 1 になり、
    `push_subscriptions` から当該行が消えていることを DB で確認する。
  - **MB-16（B-3）**: MB-11 の状態からさらに全端末の購読を OFF にして Cron を叩き、
    `{ subscriptionCount: 0, sentCount: 0, removedCount: 0, expiringStockCount: 0 }` が返ることを確認する。

### S-8. `docs/tests/saturday-flow.md` の参照行が文書間で食い違っている

- 対象: 要件 `:142-143`（`:83-85`）/ 設計書 `:77`・`:800`（`:83-85`）/ 実装計画 `:1297`（`:83-85`）
  vs 試験計画 `:114`・`:421`・`:435`・`:560`（`:83-86`）
- 根拠（実測）: O-01 の記述は `docs/tests/saturday-flow.md` の **L83〜L86**。`:83-85` では
  最終行「→ ローカル/実機でのみ検証可（MB-10〜12）」が落ちる。この行は「本番ビルド + 実機が必要」を
  裏付ける最重要の一文で、罠 1・R-1 の根拠そのもの。
- 直し方: 4 文書とも `:83-86` に統一する。

---

## Nice（余裕があれば）

### N-1. 行数の実測値が 1 行ずれている箇所が 3 件

- 試験計画 `:64`「既存 `apps/web/src/app/sw.ts`（**全 59 行**）」→ 実測 **58 行**
  （設計書 `:71` の「全 58 行」・実装計画 `:1297` の「既存 58 行のうち L1-58」は正しい）
- 試験計画 `:59`「`apps/web/src/app/_utils/expiry.ts`（**全 52 行**・6 export）」→ 実測 **51 行**
- 試験計画 `:90`「`dashboard-view.node.test.ts`（実測・**全 196 行**）」→ 実測 **195 行**
- いずれも判断に影響しないが、「実測」と明記した数字が外れているのは記述の信頼度を下げる。

### N-2. 見出しが途中で改行され、残りが本文に割れている（Unit A の N-4 と同型の描画崩れ）

- 契約書 `:562-566`（§10.2）: `### 10.2 Hono ルート（配置先: \`...push.test.ts\` /` で見出しが切れ、
  閉じ括弧を含む残りが直後の段落として描画される。
- 契約書 `:575-577`（§10.3）: 同様（`…本体設計書` で切れ、`§テスト方針の再掲…）` が段落になる）。
- 試験計画 `:376-378`（§7-1）: 同様（`（新設。配置:` で切れる）。
- **テーブルは 6 文書すべてで崩れていない**（§0 参照）ので、Unit A の指摘は再発していない。
  今回は見出しの側で同種の崩れが出ている。
- 直し方: 配置先は見出しから外し、直下の本文行に「配置: `...`」として書く。

### N-3. 要件定義書に「未確定」時代の言い回しが残っている

- `:77` 「`/pantry`（**P-7 で確定する**遷移先）」/ `:79` 「P-8: … 設計を**推奨する**」/
  `:84` 「詳細は P-10」/ `:108` 「P-10 で除外方針を**扱う**」— いずれも既に確定済み。
  M-2 の修正と同時に確定形へ直すと、読み手が「まだ決まっていない」と誤読しない。

### N-4. ADR-0017 に P-12（環境変数未設定時のフェイルクローズ方針）の記載が無い

- Decision 7 点は P-13 / P-14 を本文へ取り込んだが、P-12（「全エンドポイントで 500 フェイルクローズに
  揃える」）は ADR に現れない。§Consequences の「VAPID 秘密鍵と `CRON_SECRET` という秘密情報が
  2 つ増える」（`:244-246`）か §Migration に「未設定時は 500 で落ちるため設定漏れは Vercel の
  実行ログで検知できる」を 1 行足すと、M-3 の修正とも噛み合い、方式決定の記録として完結する。

### N-5. 実装計画の新規作成ファイル一覧の件数と表の行数が合わない

- `:20` の見出しは「新規作成（**33 ファイル**。マイグレーション自動生成 2 件を含む）」だが、
  表は #1〜**#34** の 34 行ある。うち #15（`push-sender-types.ts`）は `:59` と `:304` で
  「不要になった」、#31（`expiry.node.test.ts`）は `:1124` と `:1128-1130` で「作らない」と
  本文が確定しているため、実体は **32 件**。M-1 の整理と合わせて表から削除し、件数を直す。

### N-6. `WebPushSender` のコンストラクタが `web-push` のモジュールグローバルを毎回書き換える

- 設計書 `:576-579` / 実装計画 Step 2-5。`pushSender()` は既存 `repositories.ts` のパターンどおり
  リクエストごとに `new` されるため、`webpush.setVapidDetails(...)`（`web-push` のプロセス
  グローバル設定）が毎回上書きされる。単一送信元の MVP1 では実害は無いが、将来 `web-push` を
  別用途で使い始めた瞬間に相互干渉する。
- 直し方: `PushSender` の JSDoc に「`web-push` のプロセスグローバル設定を書き換える」と契約情報として
  明記するか、`sendNotification(subscription, payload, { timeout, vapidDetails })` の
  `vapidDetails` にインスタンスの値を渡してグローバル書き換えを避ける。

### N-7. `deleteByEndpoints(endpoints)` の重複・空文字要素の契約が未定義

- 設計書 `:224-226` の JSDoc は「1 件ずつ削除すると N+1 になるため専用メソッドを設ける」だけで、
  `endpoints` に重複や空文字が混じった場合の契約（無視する／例外を投げる）が無い。
  INF-PUSH-07 が空配列は押さえているので、JSDoc に「重複要素は無視する（`IN` 句のため冪等）」の
  1 行を足せば足りる。`.claude/rules/coding-standards.md` の「JSDoc には型に表せない契約情報のみ」に
  沿った追記になる。

---

## Orchestrator への差し戻し（どの成果物を直すか）

| #   | 直す成果物                                         | 対応する指摘                                                                                                                                                 |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `docs/implementation-plans/expiry-alert.md`        | M-1（P-13/P-14 の確定反映）・M-3（`pushSender()` の `?? ''`）・M-4（`sw.ts` の型付け）・M-5（ディープ import）・S-5（Step 6 完了条件に build 追加）・N-5     |
| 2   | `docs/requirements/expiry-alert.md`                | M-2（FR-5・対象範囲・未決事項）・N-3                                                                                                                         |
| 3   | `docs/designs/expiry-alert.md`                     | M-3（`cronRoute` の VAPID ガード）・M-4（`sw.ts` コード例）・S-3（UseCase 内 `new`）・S-4（TZ の出典）・S-5（R-12 の影響格上げ）・S-8・N-6・N-7              |
| 4   | `docs/designs/expiry-alert.contract.md`            | M-3（§5-3 の 500 追加）・S-2（旧行番号）・N-2                                                                                                                |
| 5   | `docs/tests/expiry-alert.md`                       | M-3（WH-CRON-09 追加・E-7 の付け替え）・S-1（旧行番号）・S-3（SEA-\* の前提列）・S-4（TZ の効果確認）・S-6（MB-05 の期待値）・S-7（MB-15/16 追加）・N-1・N-2 |
| 6   | `docs/decisions/ADR-0017-web-push-expiry-alert.md` | N-4（P-12 の記載）                                                                                                                                           |

**Must 5 件のうち M-1 / M-2 は「確定済み事項の下流反映漏れ」、M-3 は「要件 E-7 の未実装」、
M-4 / M-5 は「コード例をそのまま写すと通らない／規約違反になる」であり、いずれも実装着手前に
直せば手戻りを防げる。** アーキテクチャ原則（依存方向・集約境界・手動 DI・`create()`/`reconstruct()`）
そのものへの違反は、M-5（公開境界）と S-3（UseCase 内 `new`）以外には見つからなかった。
P-13（`PushSender` を Domain へ）の判断自体は
`packages/infrastructure/package.json` の実測（`@cookpit/domain` のみに依存）に照らして妥当である。
