# 設計書: shopping-list-screens

- ステータス: **実装・レビュー・実画面確認済み**（2026-07-13 S-1〜S-6 全件ユーザー確定・推奨案どおり
  実装完了。2026-07-14 reviewer レビュー（Must 0）と manual-browser-verify（MB-01〜09/13〜15 PASS・
  MB-10〜12 は環境制約で BLOCKED/コード確認）を実施。§未決事項の確定記録参照）
- レベル: L2
- スプリント: Sprint 4 Unit B
- 関連: `docs/requirements/shopping-list-screens.md`（要求分析・直前工程・入力）、
  `docs/designs/shopping-list-core.md`（Unit A 確定設計・正典。DTO 形・契約・S-1〜S-11/D-1〜D-8）、
  `docs/designs/meal-plan-screens.md`（Sprint 3 Unit B・L2 画面ユニットの先例。本書の構成・粒度はこれに揃える）、
  `docs/decisions/ADR-0006-shopping-list-generate-idempotent.md`、`docs/05-roadmap.md` Sprint 4

---

## 背景

Sprint 4 Unit A（`shopping-list-core`）で ShoppingList 集約のバックエンド一式（Domain /
Infrastructure / Application / API Contract / Presentation(API) 5 本）が実装済み・main マージ済み
（PR #51〜#57）。API・DTO・エラー処理・冪等性は確定済みであり、本ユニットはそれを使う画面（UI）と
PWA オフライン強化のみを対象とする。roadmap 上、本スプリントは「土曜の買い物がスマホ完結する」
MVP1 のクライマックスと位置付けられている。

## 目的

- 店舗ごとのグルーピング表示・チェック（購入実績入力）・手動追加・価格比較インジケーターを備えた
  買い物リスト画面を提供する。
- 献立画面（`/meal-plans`）から買い物リストへの導線を追加する（Sprint 3 スコープ判断で Sprint 4 と
  連動させると確定済み）。
- 電波が悪いスーパーでも最低限の操作ができる PWA オフライン（読み取り）強化を行う。

## 要件

要点のみ。詳細は `docs/requirements/shopping-list-screens.md` を正典とする。

- 画面 A（買い物リスト）: 店舗ごとグループ化表示、チェック＝購入実績入力（価格・実購入店舗）、
  手動追加フォーム、推奨店舗インジケーター、店舗未定グループの表示。
- 画面 B（献立画面からの導線）: `/meal-plans` に「買い物リストを作る/開く」導線を追加。
- PWA: 既存 Serwist 構成（`runtimeCaching`）に読み取りキャッシュを追記。書き込みキュー
  （Background Sync）は別フェーズ候補。
- 既存 5 API（Generate / Get / AddItem / MarkAsBought / ReassignStore）と `GET /api/stores` /
  `GET /api/products/:id` を使用する。新規 API・契約・DB・Domain 変更は行わない。
- 認証なし・2 名利用・週は土曜始まりという MVP1 の既存前提は変わらない。

## 設計判断サマリ

`docs/requirements/shopping-list-screens.md` §4 の S-B1〜S-B7 を、本書では S-x（ユーザー確定が必要）
と D-x（設計者裁量・先例準拠で確定）に整理し直す。**S-x は推奨案を示すのみで確定しない**（draft）。
**D-x は理由付きで確定として記録**する（別案を選ぶ場合の差分も明記）。

### S-x（ユーザー確定待ち）

| #   | 論点（対応する S-B）                                       | 推奨案                                                                                                                  | Unit B スコープ内/外                                                                         |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S-1 | 献立画面への「買い物リストを作る/開く」導線の範囲（S-B1）  | `/meal-plans`（meal-plan-client.tsx）に CTA ボタンを 1 個追加 + 独立した `/shopping-lists` エントリ画面も用意（両建て） | 内                                                                                           |
| S-2 | 画面訪問時の冪等 POST 呼び出し方式・自動発火の是非（S-B2） | 明示ボタンクリック時にのみ Client から Hono RPC で POST（Server Component の自動発火はしない）                          | 内                                                                                           |
| S-3 | チェック解除（bought→pending）UI・UseCase の要否（S-B3）   | 実装しない（Unit B スコープ外のまま据え置き）                                                                           | 外（実装する場合はバックエンド拡張が必要になり L2 を超える）※Superseded。詳細は S-3 本文参照 |
| S-4 | 楽観的更新の実装方式（S-B4）                               | `useOptimistic`（React 19 標準 API。新規依存追加なし）                                                                  | 内                                                                                           |
| S-5 | PWA オフライン**書き込み**キュー（S-B5）                   | 実装しない（別フェーズ候補として申し送りのみ）                                                                          | 外（別フェーズ候補）                                                                         |
| S-6 | 価格比較インジケーターの表示レベル（S-B6）                 | 推奨店舗バッジ（店舗グループヘッダー）のみ。金額差表示は対象外                                                          | バッジ: 内 / 金額差: 外の可能性（採用する場合は N+1 を許容するか判断が必要）                 |

各論点の詳細な選択肢比較は §S-x 詳細 に記載する。

### D-x（設計者裁量で確定）

| #   | 判断                                                                                          | 準拠する先例・理由                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 画面構成はルート分割（`/shopping-lists` エントリ + `/shopping-lists/[id]` 詳細）              | meal-plan-screens S-1（ルート分割）と同型。エントリは MealPlan 解決の入口、詳細は list-id ベースの読み取り専用 URL                                  |
| D-2 | 店舗未定（`targetStoreId === null`）グループは先頭に固定表示（S-B7）                          | D-1（shopping-list-core）の帰結として発生しうる状態を目立たせ、reassignStore による店舗確定を促す                                                   |
| D-3 | `ShoppingListNotFoundError` は `notFound()` で 404 ページに委譲                               | `apps/web/src/app/products/[id]/page.tsx` / `recipes/[id]/page.tsx` の既存 try/catch + `notFound()` パターンをそのまま踏襲                          |
| D-4 | チェック UI は自作の `role="checkbox"` ボタン（新規 UI プリミティブは追加しない）             | meal-plan-screens 「新規 UI 基盤は導入しない」方針。既存の削除ボタン・倍量トグルボタンと同じ自作パターン                                            |
| D-5 | 購入実績入力・店舗再割当・手動追加はインライン展開パネル（モーダル不採用）                    | `recipe-picker.tsx` の「展開パネル」パターンを踏襲。新規 Dialog プリミティブの追加を避ける                                                          |
| D-6 | 手動追加フォームに `productId` 選択 UI は設けない（常に `null` を送信）                       | S-3（shopping-list-core）「Product 名寄せは productRef 引き継ぎのみ」の設計思想と整合。商品検索 UI は新規コンポーネントが必要でスコープ肥大化を招く |
| D-7 | 2 人利用の同期は「画面フォーカス時の自動 refetch」+「手動更新ボタン」で実現（WebSocket 不要） | roadmap 完了条件「2人で同じリストを見て、お互いの操作が反映される（最低限 refetch でOK）」に忠実な最小実装                                          |

### requirements S-B1〜S-B7 との対応表

| 要求分析 # | 論点                                     | 本書での扱い |
| ---------- | ---------------------------------------- | ------------ |
| S-B1       | 献立画面への導線追加の要否・範囲         | **S-1**      |
| S-B2       | 冪等 POST の呼び出し方式・自動発火の是非 | **S-2**      |
| S-B3       | チェック解除 UI・UseCase の要否          | **S-3**      |
| S-B4       | 楽観的更新の実装方式                     | **S-4**      |
| S-B5       | PWA オフライン書き込みキュー             | **S-5**      |
| S-B6       | 価格比較インジケーターの表示レベル       | **S-6**      |
| S-B7       | 店舗未定グループの扱い                   | **D-2**      |

---

## 対象範囲

- `apps/web` の Presentation 層のみ（画面・Client/Server Component・Hono RPC 呼び出し）。
- 既存 5 API（Generate / Get / AddItem / MarkAsBought / ReassignStore）+ `GET /api/stores` +
  （S-6 でオプション扱いの）`GET /api/products/:id` をそのまま使用。
- `apps/web/src/app/sw.ts` の `runtimeCaching` 追記（既存 Serwist 構成の延長）。
- `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx` への導線追加（S-1）。

## 対象外

- バックエンド / Domain / Application / Infrastructure / API Contract（Zod）/ DB スキーマの変更
  （既存を使う前提。追加が必要になった場合も本書では実装せず、S-x として記録するのみ）。
- `GET /api/shopping-lists?mealPlanId=` 相当の新規クエリ API（shopping-list-core §S-7 の明示的スコープ外
  判断を継承。冪等 POST が get-or-create を兼ねるため不要と結論づける）。
- ~~チェック解除（bought→pending）UseCase・API の新規実装（S-3。実装しない）。~~
  Superseded（2026-07-24）: `docs/designs/shopping-list-item-check.md` により実装済み。
- Background Sync によるオフライン書き込みキューの実装（S-5。実装しない・別フェーズ候補）。
- 金額差を伴う価格比較表示の実装（S-6。ベースラインでは対象外）。
- 認証・複数ユーザー対応（ADR-0003 / ADR-0004 継続）。
- recipes / products 一覧ヘッダーへの「買い物リスト」リンク追加（依頼にない導線拡張。スコープ外）。
- implementation-planner / test-designer の成果物（詳細実装計画・試験計画はフェーズ 2）。

---

## S-x 詳細（選択肢比較）

### S-1: 献立画面への「買い物リストを作る/開く」導線の範囲（S-B1）

| 案        | 内容                                                                                               | 長所                                                                                                                                                      | 短所                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A         | `/meal-plans` にのみ CTA ボタンを追加。`/shopping-lists` は id 指定でのみ到達可能                  | 変更ファイルが最小                                                                                                                                        | ブックマーク・直接アクセス・PWA ホーム画面ショートカット等で `/shopping-lists` に直接来た場合の入口がない            |
| B（推奨） | `/meal-plans` に CTA ボタンを追加 **かつ** 独立した `/shopping-lists`（id なし）エントリ画面も用意 | 献立画面からの自然な導線と、直接アクセス・再訪問（PWA ホーム画面ショートカット等）の両方に対応。meal-plan-screens 論点(c)「両方を組み合わせる」と同じ判断 | 変更・新規ファイルがやや増える（ただしロジックは同一パターンの再利用）                                               |
| C         | `/shopping-lists` のみ用意し、`/meal-plans` 側の変更はしない                                       | `meal-plan-client.tsx` に触れず既存画面の回帰リスクをゼロにできる                                                                                         | 「土曜に献立を決めたらすぐ買い物リストへ」という主要動線が発見しにくくなり、roadmap の完了条件（スマホ完結）に反する |

**推奨: 案 B**。`meal-plan-client.tsx` への変更はボタン 1 個の追加（週表示の直後、レシピ追加導線より上に
プロミネントな CTA として配置）に限定し、既存の作成・追加・削除フローには触れない。

### S-2: 画面訪問時の冪等 POST 呼び出し方式・自動発火の是非（S-B2）

| 案        | 内容                                                                                                                                                                                                                                   | 長所                                                                                                                  | 短所                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A         | `/shopping-lists` を Server Component とし、`GenerateShoppingListUseCase` を手動 DI で直接呼び出して `redirect()` する（訪問しただけで POST が走る）                                                                                   | 画面遷移が 1 ステップで済む。初期表示は Server Component という presentation-layer.md の原則に忠実に見える            | 「閲覧するだけで副作用のある操作（POST）が自動発火する」。meal-plan-screens S-7「MealPlan 作成は明示ボタン・閲覧だけで自動作成しない」という直近の確定先例と方向性が逆になる。ブラウザのプリフェッチ・リロード・PWA 復帰等でも毎回発火する |
| B（推奨） | `/shopping-lists` の初期表示は「現在の MealPlan」を Server Component で読み取るだけ（副作用なし）。「買い物リストを作る/開く」は明示ボタンで、押下時に Client から Hono RPC 経由で POST → 成功後 `router.push('/shopping-lists/[id]')` | S-7 先例と一貫。presentation-layer.md の「書き込みは基本 Hono RPC」方針にも忠実。副作用が明示的なユーザー操作に紐づく | 遷移が「ボタン押下 → 遷移」の 2 ステップになる（ただし冪等 POST 自体は高速）                                                                                                                                                               |

**推奨: 案 B**。既存リストがある場合の「開く」も同じボタン・同じ POST 呼び出し（冪等なので既存を
200 で返す）で統一する。ボタンの文言のみ `mealPlan.status === 'draft'` で「買い物リストを作る」、
それ以外で「買い物リストを開く」に出し分ける（追加の読み取り API は不要）。

### S-3: チェック解除（bought→pending）UI・UseCase の要否（S-B3）

> **Superseded（2026-07-24, `docs/designs/shopping-list-item-check.md`）**: 本セクションの結論
> 「チェック解除 UI・UseCase は実装しない」は撤回された。ユーザーが「チェック操作を価格記録から
> 分離し、チェックは何度でも外せるようにする」ことを明示的に要求したため、`ShoppingItem.check()` /
> `uncheck()` と `SetItemCheckedUseCase` / `POST /api/shopping-lists/:id/items/:itemId/checked`
> を新設して bought→pending の逆遷移を可能にした。以下の案 A〜C の比較・確定理由は判断の経緯
> として残すが、現行の結論ではない。詳細は `docs/designs/shopping-list-item-check.md` を参照。

| 案        | 内容                                                                                                                                  | 長所                                                                          | 短所                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | Unit B では実装しない。訂正は S-11(a) の**上書き**（チェック済み item を再タップ→フォーム再展開→金額/店舗を訂正して再送信）で対応する | 既存 API のみで完結し L2 前提を超えない。誤って bought にしても金額訂正は可能 | 「そもそも bought にすべきでなかった」を pending に戻す手段がない（誤タップの完全な取り消しはできない）                                        |
| B         | `UnmarkAsBoughtUseCase`（仮）+ 新規 API を追加してチェック解除を実装する                                                              | UX として最も自然                                                             | Unit A 相当の Application/API 変更を伴い、「既存 API のみ使用」という L2 の前提を超える。ユーザー確定のうえ別ユニット（L3 寄り）として扱うべき |

**推奨: 案 A**。S-11(d)（shopping-list-core）で明示済みの未決事項をそのまま Unit B でも先送りする。
「金額・店舗の訂正はできるが pending には戻せない」という制約を画面文言（例: 購入実績入力フォームの
説明文）で示すことを実装計画に含める。

### S-4: 楽観的更新の実装方式（S-B4）

| 案        | 内容                                                                                                                              | 長所                                                                                                                                                                                                                 | 短所                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A         | `@tanstack/react-query` を新規導入し、`useMutation` の `onMutate` で楽観的更新・ロールバックを実装                                | presentation-layer.md が想定する構成に最も忠実。キャッシュ管理・再試行等の将来拡張の土台になる                                                                                                                       | 本プロジェクト初導入の新規依存（フェーズ 2 で security-reviewer 対象になる）。meal-plan-screens S-6「TanStack Query は導入しない」という直近の確定先例と矛盾する                    |
| B（推奨） | React 19 の `useOptimistic` + `startTransition` を使い、新規依存を増やさず楽観的更新を実装する                                    | 新規依存なし。失敗時は transition が reject した時点で自動的に楽観値が破棄される（手動ロールバック処理が最小で済む）。presentation-layer.md の「楽観的更新を効かせやすい」という意図を、新規ライブラリなしで満たせる | 本プロジェクトで `useOptimistic` の初使用になる（学習コスト・実装パターンの確立が必要）。チェック操作以外（手動追加・店舗再割当）にも同じパターンを広げるかは実装時に個別判断が必要 |
| C         | 楽観的更新を採用せず、送信 → 応答待ち → 成功時にレスポンス値で state 更新（meal-plan の `router.refresh()` 相当の「確定値反映」） | 実装最小・ロールバック不要でバグりにくい                                                                                                                                                                             | 「電波が悪いスーパーでも動く」「ストレスなく操作できる」という roadmap 完了条件に対し、低速回線でのチェック操作の体感が悪化する                                                     |

**推奨: 案 B**。対象はチェック操作（`markAsBought`）を最優先とし、手動追加・店舗再割当への適用は
実装フェーズでの追加判断とする（データ面はいずれも D-5 で確定済みの更新後 DTO を返すため、後から
適用範囲を広げても設計変更は不要）。

### S-5: PWA オフライン**書き込み**キュー（S-B5）

| 案        | 内容                                                                                                                             | 長所                                                                                                                                               | 短所                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | Unit B では実装しない。オフライン時の書き込み操作は既存の catch ブロックによる「通信エラーが発生しました。」表示に留める         | 新規のクライアント状態管理（キュー永続化・失敗時 UI・再送信ロジック）を追加せず、既存 Serwist 構成の軽微な延長（読み取りキャッシュのみ）で完結する | 「電波が悪いスーパーでも動く」の完了条件は「読み取り閲覧は可能」までで、書き込み（チェック）は依然オンライン前提のまま |
| B         | オンライン復帰を `window.addEventListener('online', ...)` で検知し、失敗した書き込みをメモリ上のキューに積んで自動再送する簡易版 | Background Sync API・新規パッケージなしで多少の耐障害性が得られる                                                                                  | リロード・タブ閉鎖でキューが消える中途半端な実装。かえって「同期されたはず」という誤った安心感を生むリスク             |
| C         | Serwist の Background Sync 相当プラグイン + IndexedDB キューで本格実装                                                           | 完全なオフラインファースト体験                                                                                                                     | 新規のクライアント側アーキテクチャ・状態設計が必要で L2（Presentation のみ）の粒度を超える。実質 L3 相当               |

**推奨: 案 A**。roadmap の「電波が悪いスーパーでも動くように」は §PWA設計 の読み取りキャッシュで
最低限満たし、書き込みの耐障害性は Sprint 5/6 以降の別課題として申し送る。

### S-6: 価格比較インジケーターの表示レベル（S-B6）

| 案        | 内容                                                                                                                                                                              | 長所                                                                                                                                  | 短所                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | 店舗グループのヘッダーに店舗名を表示するだけで「推奨店舗」を暗黙的に伝える（`targetStoreId` でグルーピングされていること自体が推奨の表現）。追加取得は `GET /api/stores` 1 回のみ | 既存データのみで完結（N+1 なし）。実装コスト最小                                                                                      | 「A店の方がB店より◯円安い」という定量的な比較は表示できない                                                                             |
| B         | 金額差表示を全アイテムに対して初期表示時に一括計算する（一意な `productId` の数だけ `GET /api/products/:id` を `Promise.all` で並列実行）                                         | 最も情報量が多い                                                                                                                      | N+1 相当の呼び出しが画面初期表示のたびに発生し、低速回線で表示が遅延する。バルク取得 API が存在しないため実装しても性能改善の余地がない |
| C         | 金額差表示をオンデマンド化する（アイテムをタップした時だけ、その 1 件の `GET /api/products/:id` を取得して詳細パネルに表示）                                                      | N+1 を回避しつつ「金額差を見たい」ニーズには応えられる。実装は購入実績入力パネル（D-5 の展開パネル）に 1 セクション追加するだけで済む | 全アイテムを一覧した状態での比較はできない（タップして初めて分かる）。API 呼び出しが増える分、実装・試験コストは案 A より高い           |

**推奨: 案 A（ベースライン）**。金額差まで見せたい場合は、性能上の理由から案 B ではなく**案 C を
選択肢として提示する**（本書では実装しない。採用する場合は S-x としてスコープに追加しユーザー確定
する）。

---

## 現状構成

```
apps/web/src/app/
├── meal-plans/                      # Sprint 3 実装済み（ShoppingList への導線なし）
│   └── _components/meal-plan-client.tsx
├── recipes/ / products/             # 既存一覧・詳細（ヘッダーに献立リンクあり）
└── shopping-lists/                  # ★ 存在しない（未着手）

apps/web/src/server/routes/shopping-lists.ts   # API 5 本実装済み（変更しない）
packages/api-contract/src/shopping-list.schema.ts # 契約実装済み（変更しない）
apps/web/src/app/sw.ts                          # runtimeCaching は Google Fonts 用 1 件のみ
```

確立済みの先例パターン（本設計はこれを踏襲する）:

- 一覧・詳細の初期表示: Server Component が UseCase を手動 DI で直呼び →
  Client Component に初期値を渡す（`meal-plans/page.tsx` / `products/[id]/page.tsx`）。
- 404 (NotFoundError) の扱い: `try/catch` + `notFound()`（`products/[id]/page.tsx` /
  `recipes/[id]/page.tsx`）。
- 書き込み: Client Component から素の Hono RPC（`client.api...`）→ 成功後 `router.refresh()` /
  `router.push()` / ローカル state 更新。
- 展開パネル型の入力 UI: `recipe-picker.tsx`（検索 + 選択 + プリセットボタン + 追加ボタン、展開したまま
  連続操作できる設計）。
- 店舗選択 UI: `SelectField`（`@base-ui/react` ラッパー、`price-record-form.tsx` で使用中）。
- Unit 選択肢: 各機能ローカルで `UNIT_OPTIONS = unitSchema.options`（`recipe-form-client.tsx` の
  パターン。他機能から import せず機能ごとに定義する）。

## 変更後構成

### 新規作成ファイル

```
apps/web/src/app/shopping-lists/
├── page.tsx                              # 新規: エントリ（Server Component。現在の MealPlan を解決）
├── [id]/
│   └── page.tsx                          # 新規: 買い物リスト詳細（Server Component）
├── _components/
│   ├── shopping-list-entry-client.tsx    # 新規: エントリ画面のボタン・空状態（Client）
│   ├── shopping-list-client.tsx          # 新規: 詳細画面の状態管理・全体統括（Client）
│   ├── store-group.tsx                   # 新規: 店舗ごとのグループ（ヘッダー + item 一覧）
│   ├── shopping-item-row.tsx             # 新規: item 1 行（チェック・表示・展開トグル・店舗変更）
│   ├── purchase-input-form.tsx           # 新規: 購入実績入力のインライン展開フォーム（D-5）
│   └── add-item-form.tsx                 # 新規: 手動追加フォーム（展開パネル、recipe-picker 同型）
└── _utils/
    └── shopping-list-view.ts             # 新規: groupItemsByStore / buildStoreNameMap / formatShoppingDate
```

### 既存ファイルへの追記・変更

| ファイル                                                       | 変更内容                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx` | 買い物リストへの CTA ボタンを 1 個追加（S-1）。既存の作成・追加・削除ロジックには触れない |
| `apps/web/src/app/sw.ts`                                       | `runtimeCaching` に 3 エントリ追加（§PWA設計。既存の Google Fonts エントリは変更しない）  |

既存の Recipe / Product / Store / MealPlan / ShoppingList の Domain・Application・Infrastructure・
API Contract・Hono ルートには**一切変更を加えない**。

---

## データフロー

### 層責務（誰が何をするか）

| 層             | 責務                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation   | Server Component は初期表示の読み取りのみ（副作用なし）。Client Component が Hono RPC 経由で書き込みを行い、ローカル state を更新する。ドメインロジックを書かない |
| Application    | 既存 UseCase（Unit A）をそのまま利用。変更なし                                                                                                                    |
| Domain         | 変更なし                                                                                                                                                          |
| Infrastructure | 変更なし                                                                                                                                                          |

### 初期表示（献立画面 → エントリ → 詳細）

```
ブラウザ → /meal-plans
  → mealPlan !== null なら CTA ボタン表示（「買い物リストを作る」/「買い物リストを開く」）
  → 押下 → client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } })   # S-2 案 B
      → 成功（201 or 200）→ router.push(`/shopping-lists/${result.id}`)
      → 失敗（404/422）→ errorMessage 表示（画面は /meal-plans のまま）

ブラウザ → /shopping-lists（直接アクセス・ブックマーク経由）
  → shopping-lists/page.tsx (Server Component, force-dynamic)
      → GetCurrentMealPlanUseCase.execute()（手動 DI: DrizzleMealPlanRepository）
  → <ShoppingListEntryClient mealPlan={dto|null} />
      → mealPlan === null → 「今週の献立がまだありません」+ /meal-plans への導線（E-01）
      → mealPlan !== null → 上記と同じボタン・同じ RPC 呼び出し

ブラウザ → /shopping-lists/[id]
  → [id]/page.tsx (Server Component, force-dynamic)
      → Promise.all([
          GetShoppingListUseCase.execute({ shoppingListId: id }),   # 手動 DI: DrizzleShoppingListRepository
          GetStoresUseCase.execute(),                                # 手動 DI: DrizzleStoreRepository
        ])
      → catch (ShoppingListNotFoundError) → notFound()（D-3）
  → <ShoppingListClient shoppingList={dto} stores={stores} />
```

### チェック（購入実績入力・S-4 楽観的更新）

```
item のチェックボタン（role="checkbox"）タップ
  → 該当 item の <PurchaseInputForm> を展開（D-5。actualStoreId の初期値は
     item.actualStoreId ?? item.targetStoreId ?? ''）
  → 価格・実購入店舗を入力 → [購入を記録]
  → startTransition(async () => {
       setOptimisticItems(itemId, { status: 'bought', actualPrice, actualStoreId })  # S-4 楽観的更新
       const res = await client.api['shopping-lists'][':id'].items[':itemId'].bought.$post({
         param: { id: shoppingListId, itemId },
         json: { actualPrice: { amount, currency: 'JPY' }, actualStoreId },
       })
       if (!res.ok) { setErrorMessage('操作に失敗しました。'); return }  # 楽観値は自動的に破棄される
       const updated = await res.json()
       setItems(現在のitemsをupdatedで置換)   # D-5 の確定値で state を更新
     })
  → フォームを閉じる
```

同一 item への再送信は上書き許容（S-11(a)。金額訂正がこの操作 1 つで完結する）。

### 手動追加

```
[手動で追加] → <AddItemForm> 展開（D-5）
  → displayName / requiredAmount.value / requiredAmount.unit（必須）+ targetStoreId（任意・既定は「店舗未定」）
    ※ productId は UI で選択させず常に null を送信（D-6）
  → client.api['shopping-lists'][':id'].items.$post({
      param: { id: shoppingListId },
      json: { displayName, requiredAmount, productId: null, targetStoreId: targetStoreId ?? null } })
  → 成功（201）→ items state に追加（source: 'manually_added'）。フォームは展開したまま入力欄のみクリア
    （recipe-picker 先例。連続追加できるように）
  → 失敗 → errorMessage 表示
```

### 店舗再割当（推奨店舗の変更）

```
item 行の店舗バッジをタップ → インライン SelectField に切替
  → 選択 → client.api['shopping-lists'][':id'].items[':itemId']['target-store'].$post({
      param: { id: shoppingListId, itemId }, json: { targetStoreId } })
  → 成功 → items state 更新（targetStoreId のみ変更。groupItemsByStore が再計算し所属グループが移動する）
  → bought 済み item でも操作可（S-11(c)。actualPrice/actualStoreId は変わらない）
  → 失敗 → errorMessage 表示
```

### 献立画面からの生成/遷移

§初期表示のとおり。「買い物リストを作る/開く」ボタンが生成と取得の両方を兼ねる（S-2）。

### 他端末との同期（refetch・D-7）

```
- 画面フォーカス復帰時（window の 'focus' イベント）に GET /:id を自動再取得し items state を置換
- 手動「更新」ボタン（詳細画面ヘッダー）でも同じ refetch を実行
- 楽観的更新（S-4）の pending 中に refetch が発火した場合は、transition 完了後の確定値を優先する
```

### オフライン時の挙動

```
- 詳細画面を再訪問（オフライン） → runtimeCaching 済みの直前の GET レスポンスを表示（§PWA設計）
- オフラインで書き込み操作（チェック等） → fetch が失敗 → catch → 「通信エラーが発生しました。」表示
  （S-5 によりキュー機構は持たない。楽観的更新（S-4）を採用している場合、楽観値は自動的に破棄される）
```

---

## API 設計

**変更なし。既存 API のみ使用する。** 新規 API・契約変更は行わない（正本:
`packages/api-contract/src/shopping-list.schema.ts` / `store.schema.ts`）。

| 用途                                  | エンドポイント                                            | 画面での使い方（Hono RPC）                                                                                                        |
| ------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 生成/取得（冪等 get-or-create）       | `POST /api/shopping-lists`                                | `client.api['shopping-lists'].$post({ json: { mealPlanId } })`。201/200 で新規/既存を判別（結果は同一形状のため画面側は分岐不要） |
| リスト詳細の取得（初期表示・refetch） | `GET /api/shopping-lists/:id`                             | Server Component: `GetShoppingListUseCase` 直呼び。Client: `client.api['shopping-lists'][':id'].$get({ param: { id } })`          |
| 手動追加                              | `POST /api/shopping-lists/:id/items`                      | `client.api['shopping-lists'][':id'].items.$post({ param: { id }, json })`                                                        |
| 購入実績入力（チェック）              | `POST /api/shopping-lists/:id/items/:itemId/bought`       | `client.api['shopping-lists'][':id'].items[':itemId'].bought.$post({ param: { id, itemId }, json })`                              |
| 推奨店舗の変更                        | `POST /api/shopping-lists/:id/items/:itemId/target-store` | `client.api['shopping-lists'][':id'].items[':itemId']['target-store'].$post({ param: { id, itemId }, json })`                     |
| 店舗名の解決（グルーピング表示）      | `GET /api/stores`                                         | Server Component: `GetStoresUseCase` 直呼び（`GetShoppingListUseCase` と `Promise.all`）                                          |
| 今週の MealPlan 解決（エントリ画面）  | `GET /api/meal-plans/current` 相当                        | Server Component: `GetCurrentMealPlanUseCase` 直呼び                                                                              |
| （S-6 案 C 採用時のみ）金額差詳細     | `GET /api/products/:id`                                   | ベースラインでは未使用。オンデマンド採用時のみアイテム詳細パネルで 1 件取得                                                       |

## DB 設計

**対象外（変更なし）**。既存の `shopping_lists` / `shopping_items` テーブル・マイグレーションを
そのまま使用する（正本: `docs/designs/shopping-list-core.md` §DB設計）。

## バックエンド設計

**対象外（変更なし）**。既存の Domain / Application / Infrastructure / Hono ルート
（`apps/web/src/server/routes/shopping-lists.ts`・`stores.ts`・`products.ts`）をそのまま使用する。
手動 DI の組み立ては Server Component（初期表示の読み取り専用 UseCase）と既存 Hono ルート（RPC 経由の
書き込み）が担う。

---

## フロントエンド設計

### `shopping-lists/page.tsx`（Server Component・エントリ）

- `export const dynamic = 'force-dynamic'`。
- 手動 DI で `GetCurrentMealPlanUseCase`（`DrizzleMealPlanRepository`）を組み立て、
  `mealPlan: MealPlanDto | null` を取得する（副作用なし。S-2 案 B）。
- `<ShoppingListEntryClient mealPlan={mealPlan} />` を返す。
- try/catch はしない（DB 障害は Next.js のエラーバウンダリに委ねる。meal-plans/page.tsx 先例）。

### `_components/shopping-list-entry-client.tsx`（Client Component）

- `'use client'`。Props: `{ mealPlan: MealPlanDto | null }`。
- ローカル state: `submitting`（多重発火防止）、`errorMessage: string | null`。
- `mealPlan === null` → 「今週の献立がまだありません」+ `/meal-plans` へのリンク（E-01）。
- `mealPlan !== null` → ボタン 1 個。ラベルは `mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'`。
  押下で `POST /api/shopping-lists`（RPC）→ 成功時 `router.push('/shopping-lists/' + result.id)`、
  失敗時 `errorMessage` 表示（`!response.ok` は「操作に失敗しました。」、catch は「通信エラーが発生しました。」）。
- ヘッダーは「戻る」（`/meal-plans`）+ タイトル「買い物リスト」（history/page.tsx のヘッダー構成を踏襲）。

### `shopping-lists/[id]/page.tsx`（Server Component・詳細）

- `export const dynamic = 'force-dynamic'`。
- `Promise.all([GetShoppingListUseCase.execute({shoppingListId:id}), GetStoresUseCase.execute()])` を
  `try/catch` し、`ShoppingListNotFoundError` は `notFound()`（D-3。`products/[id]/page.tsx` と同型）、
  それ以外は `throw error`（エラーバウンダリへ）。
- `<ShoppingListClient shoppingList={dto} stores={stores} />` を返す。

### `_components/shopping-list-client.tsx`（Client Component・状態管理の中心）

- `'use client'`。Props: `{ shoppingList: ShoppingListDto, stores: StoreDto[] }`。
- **ローカル state に `items: ShoppingItemDto[]` を持つ**（`shoppingList.items` で初期化）。meal-plan-client
  とは異なり、書き込みのたびにページ全体を再実行（`router.refresh()`）するのではなく、書き込み
  レスポンス（D-5 の更新後 DTO）で該当 item だけを部分更新する。理由: 買い物中は同一画面内で
  何十回もチェック操作が発生するため（shopping-list-core §性能の留意点）、都度サーバー往復で
  ページ全体を作り直すより軽量な部分更新が適切。
- その他のローカル state: `errorMessage: string | null`、`expandedItemId: string | null`
  （購入実績入力パネル / 店舗変更 UI がどの item で開いているか）、`addFormOpen: boolean`、
  `submittingItemId: string | null`（操作中の item のみ disable。他 item の操作は妨げない）。
- `storeNameMap = buildStoreNameMap(stores)` / `groupedItems = groupItemsByStore(items, stores)`
  （`_utils/shopping-list-view.ts`。D-2 で店舗未定グループを先頭固定）。
- `useEffect` で `window` の `'focus'` イベントに refetch ハンドラを登録（D-7）。アンマウント時に解除。
- ヘッダー: 「戻る」（`/meal-plans`）+ `formatShoppingDate(shoppingList.shoppingDate)` + 「更新」ボタン
  （手動 refetch。D-7）。
- 本文: `groupedItems.map(<StoreGroup>)`。`items.length === 0` は「リストにアイテムがありません」
  - 手動追加フォームは利用可能（B-03）。
- フッター相当: 「手動で追加」ボタン ⇄ `<AddItemForm>`（展開トグル）。

### `_components/store-group.tsx`

- Props: `{ storeId: string | null, storeName: string, items: ShoppingItemDto[], expandedItemId, submittingItemId, onToggleExpand, onMarkAsBought, onReassignStore, stores }`。
- ヘッダー: `storeId === null` なら「店舗未定」、それ以外は店舗名（S-6 案 A の「推奨店舗」表現を兼ねる。
  追加のバッジ・アイコンは付けない）。
- `items.map(<ShoppingItemRow>)`。

### `_components/shopping-item-row.tsx`

- Props: `{ item: ShoppingItemDto, stores: StoreDto[], expanded: boolean, submitting: boolean, onToggleExpand, onMarkAsBought, onReassignStore }`。
- チェック UI: `<button type="button" role="checkbox" aria-checked={item.status === 'bought'} onClick={() => onToggleExpand(item.id)}>`
  （D-4。自作。`item.status === 'bought'` でチェック済みスタイル、`'skipped'` も含め非 `'bought'` は未チェック
  スタイルとして扱う——skipped は Unit A に到達操作がなく Unit B でも通常発生しない。念のため型は網羅する）。
- `displayName` + (`requiredAmount !== null` なら `${value}${unit}`、そうでなければ `amountNote`)。
- `item.status === 'bought'` のとき「✓ {actualStoreName} で ¥{actualPrice.amount} 購入」を小さく併記。
- 店舗バッジ（`targetStoreId` の店舗名。null なら「店舗未定」）をタップすると `SelectField` に切替、選択で即座に
  `onReassignStore` を呼ぶ（確定ボタンなし。選択即送信）。
- `expanded === true` のとき行の下に `<PurchaseInputForm>` を表示。

### `_components/purchase-input-form.tsx`（D-5・インライン展開）

- Props: `{ item: ShoppingItemDto, stores: StoreDto[], submitting: boolean, onSubmit: (actualPrice: number, actualStoreId: string) => void, onCancel: () => void }`。
- 価格入力（`Input type="number" min={0}`。既存 `bought` item を再タップした場合は `item.actualPrice.amount`
  で初期値をプレフィルし訂正しやすくする）。
- 実購入店舗（`SelectField`。初期値は `item.actualStoreId ?? item.targetStoreId ?? ''`）。
- 「購入を記録」ボタン（店舗未選択・価格未入力なら disable）+「キャンセル」ボタン（`onCancel`）。

### `_components/add-item-form.tsx`（D-5・recipe-picker 同型の展開パネル）

- Props: `{ stores: StoreDto[], submitting: boolean, onAdd: (input) => void }`。
- `displayName`（`Input`。非空必須）、`requiredAmount.value`（`Input type="number" min={0}`）、
  `requiredAmount.unit`（`SelectField`。`UNIT_OPTIONS = unitSchema.options` をこの機能内でローカル定義。
  他機能からの import はしない先例に合わせる）。
- `targetStoreId`（任意。`SelectField` に「店舗未定」オプション（value `''` → 送信時 `null`）を含める）。
- `productId` は UI に出さず常に `null` を送信（D-6）。
- 「追加」ボタン押下で `onAdd`。成功後もパネルは開いたまま、入力欄のみクリア（recipe-picker 先例）。

### `_utils/shopping-list-view.ts`

```typescript
// id → 店舗名の Map。
export function buildStoreNameMap(stores: StoreDto[]): Map<string, string>;

// targetStoreId でグルーピングし、店舗未定グループ（storeId: null）を先頭に固定する（D-2）。
// stores の並び順（GET /api/stores の返却順）をそのまま各グループの表示順に使う。
// items が 0 件の店舗はグループごと出さない。targetStoreId が stores に存在しない場合は
// 防御的に「不明な店舗」として扱う（D-3 shopping-list-core の非チェック方針の帰結）。
export function groupItemsByStore(
  items: ShoppingItemDto[],
  stores: StoreDto[],
): Array<{ storeId: string | null; storeName: string; items: ShoppingItemDto[] }>;

// shoppingDate "2026-07-11" → 「7/11（土）の買い物リスト」。
// Date 構築は meal-plan-view.ts の formatWeekRange と同一のローカルタイム規約（'T00:00:00' 付与）。
export function formatShoppingDate(shoppingDate: string): string;
```

### 導線の追加（S-1）

- `meal-plan-client.tsx`: 週表示（`formatWeekRange`）の直後、`plannedRecipes` セクションより上に
  プロミネントな CTA ボタンを追加する（`mealPlan !== null` のときのみ表示）。ラベル・遷移ロジックは
  §データフロー のとおり。既存の作成・追加・削除フローとは独立した追加処理として実装する。
- recipes / products 一覧ヘッダーへの「買い物リスト」リンク追加は**対象外**（依頼にない拡張。
  気づきとして記録するに留める）。

### ビジュアル

- 既存のセマンティックトークン（`bg-background` / `text-foreground` / `text-muted-foreground` /
  `border` / `primary` / `secondary` / `accent` 系）のみ使用。新規トークン追加はしない。
- shadcn/ui 由来の既存コンポーネント（`Button` / `Input`）・`@base-ui/react` ラッパー（`SelectField`）と
  lucide-react アイコンを流用。新規 UI 基盤（新規パッケージ・新規プリミティブラッパー）は導入しない
  （D-4 / D-5）。

---

## PWA 設計

対象: `apps/web/src/app/sw.ts` の `runtimeCaching` 配列への追記のみ。既存の Google Fonts エントリ
（`CacheFirst`）は変更しない。新規パッケージ依存は追加しない（`serwist` は既存依存）。

### 追加する 3 エントリ（S-5 の読み取りキャッシュ部分。ベースライン）

| #   | 対象                                                                      | 戦略                                                                                                          | 理由                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `GET /api/shopping-lists/:id`                                             | `NetworkFirst`（`networkTimeoutSeconds: 3`、`ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60*60*24 })`） | 買い物中に頻繁に更新されるデータのため、オンライン時は常に最新を優先。オフライン時のみ直前のキャッシュにフォールバック               |
| 2   | `GET /api/stores`                                                         | `StaleWhileRevalidate`（`ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60*60*24*7 })`）                    | 店舗マスタは更新頻度が低い。キャッシュを即座に返しつつ裏で更新する方が体感が良い                                                     |
| 3   | `/shopping-lists` 配下の GET リクエスト（ページ本体・RSC ペイロード双方） | `NetworkFirst`（`networkTimeoutSeconds: 3`、`ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 60*60*24 })`） | `/shopping-lists/[id]` は動的セグメントのため build 時 precache 不可。オフライン再訪問（O-01）を成立させるには実行時キャッシュが必須 |

### 設計上の注意点

- 各エントリの `matcher` は **`request.method === 'GET'` を明示的に含む関数形式**にする
  （`({ url, request }) => request.method === 'GET' && /pattern/.test(url.pathname)`）。単純な
  URL 正規表現のみだと `POST`（bought / target-store / items 追加）にもマッチしうるため、書き込み系
  リクエストを誤ってキャッシュ戦略の対象にしないことを明示する。Cache API は元々 GET 以外を保存
  できないため実害は小さいが、意図を明確にするために条件へ含める。
- エントリ 3（ページ本体）は Next.js App Router のクライアントサイド遷移（RSC フェッチ）と
  フルリロード（document navigation）の両方をカバーする必要がある。`request.mode === 'navigate'`
  だけに限定すると RSC フェッチ（Link クリックでの遷移）を取りこぼす可能性があるため、パス一致
  ベースの matcher にする。
- 本番ビルド（`next build --webpack`）でのみ Serwist が有効になる制約（既存 `next.config.ts`）は
  変更しない。開発中の PWA 動作確認は `pnpm build && pnpm start` 相当の手順が必要（§テスト方針）。

### オフライン時の UX

- 直前に開いたことがある `/shopping-lists/[id]` はオフラインでも表示できる（O-01）。
- 未訪問の `/shopping-lists/[other-id]` へのオフラインアクセスはキャッシュがなく、ブラウザの標準
  オフライン画面になる（許容。書き込みキュー同様、別フェーズで改善余地として記録）。
- オフラインでの書き込み操作（チェック等）はキュー機構を持たない（S-5）。エラーメッセージ表示のみ（E-08）。

---

## エラー処理

外部 I/O は DB（既存接続）+ 既存 API のみのため、リトライ・タイムアウト等は既存機能と同一方針
（対象外）。画面のエラーハンドリングは以下のとおり。

| エラー種別                                                                   | 発生箇所                               | 処理                                                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `MealPlanNotFoundError`（404）                                               | エントリの POST                        | `errorMessage`「操作に失敗しました。」                                                                   |
| `InvalidMealPlanStateError`（422）                                           | エントリの POST                        | 同上（通常は到達しにくいが、削除競合等で起こりうる）                                                     |
| `ShoppingListNotFoundError`（404、詳細画面の初期表示）                       | `[id]/page.tsx`                        | `notFound()` で 404 ページ（D-3）                                                                        |
| `ShoppingListNotFoundError` / `ShoppingItemNotFoundError`（404、書き込み時） | Client（RPC 呼び出し後）               | `errorMessage`「操作に失敗しました。」+ 手動「更新」ボタンでの再同期を促す                               |
| `InvalidShoppingListStateError`（422）                                       | AddItem / MarkAsBought / ReassignStore | 同上（Unit B の到達可能性は低いが型として存在）                                                          |
| Zod バリデーション失敗（400）                                                | 各書き込み                             | クライアント側で簡易検証（displayName 非空・数値の非負）した上で、サーバー 400 はそのまま `errorMessage` |
| ネットワークエラー（fetch 失敗）                                             | Client（catch）                        | `errorMessage`「通信エラーが発生しました。」                                                             |
| DB 障害（初期表示）                                                          | Server Component                       | try/catch せず Next.js エラーバウンダリへ（`ShoppingListNotFoundError` のみ個別捕捉）                    |

冪等性: Generate は既存どおり冪等（S-6・shopping-list-core）のため、エントリボタンの二重送信は実害が
ない。AddItem は非冪等（二重送信で 2 行になる）ため `submittingItemId` / フォームの送信中 disable で
UX 上のガードのみ行う（既存 AddRecipe と同じ制約。shopping-list-core §エラー処理 (c) を継承）。

## ログと監視

対象外（MVP1 方針どおり）。サーバー側エラーは既存の `app.onError` の `console.error` に委ねる。

## セキュリティ

- 認証なしは MVP1 の既存前提と同じ（本機能で状況は変わらない）。
- 書き込み入力はすべて既存の Zod 契約（`shopping-list.schema.ts`）でサーバー側検証される。
  クライアント側検証（displayName 非空・数値の非負）は UX 目的の事前チェックであり、正はサーバー。
- 表示文字列（`displayName` 等）は React の標準エスケープに委ねる。`dangerouslySetInnerHTML` は使用しない。
- PWA キャッシュは同一オリジンの JSON レスポンスのみを対象とし、実行可能コードをキャッシュしない。
  認証・ユーザー分離がない MVP1 の前提上、キャッシュされたデータが別ユーザーに漏洩するリスクはない
  （既存前提と同一）。

## 性能

- 初期表示（詳細画面）は `GetShoppingListUseCase` + `GetStoresUseCase` の 2 UseCase を `Promise.all`
  で並列実行する（meal-plan-screens 先例と同型）。`GET /api/shopping-lists/:id` 自体は Unit A 設計で
  LEFT JOIN + グルーピングの単一クエリと確認済み（shopping-list-core §性能）。
- 書き込み（チェック・手動追加・店舗再割当）はレスポンスの更新後 DTO（D-5・shopping-list-core）で
  ローカル state を部分更新するため、書き込みごとの追加 GET は発生しない（N+1 なし）。
- **価格比較 N+1 の性能メモ（S-6）**: ベースライン（案 A・推奨店舗バッジのみ）は追加取得なし。
  金額差表示（案 B）を採用すると、一意な `productId` 数だけ `GET /api/products/:id` が並列発生する。
  買い物リストの item 数は 1 リストあたり数十件（shopping-list-core §性能）であり、一意な productId 数
  はそれ以下だが、低速回線（roadmap の「電波が悪いスーパー」想定）ではゼロではない遅延要因になる。
  採用する場合はオンデマンド化（案 C）で影響を 1 リクエスト/タップに抑えることを推奨する。
- `window` の `'focus'` イベントによる自動 refetch（D-7）は 1 回のフォーカス復帰につき `GET /:id` を
  1 回発行するのみで、頻度は現実的な範囲に収まる。低速回線での refetch 失敗は既存表示を維持し、
  無視してよい（エラー表示までは行わない設計とする。ユーザー起点の「更新」ボタンとは異なり、
  背景で自動的に走る処理のため）。

## テスト方針

apps/web のテスト基盤（Vitest + RTL、Hono ルートテスト）は導入済み（2026-07-01 PR #21）。
詳細な試験計画は実装フェーズ開始時に test-designer が `docs/tests/shopping-list-screens.md` を
作成する。本設計から引き継ぐ観点:

- **RTL（Client / 純粋コンポーネント）**
  - `shopping-list-entry-client`: MealPlan null → 空状態 + `/meal-plans` リンク / draft → 「作る」ボタン
    / それ以外のステータス → 「開く」ボタン / 成功後 `router.push` / 失敗時 `errorMessage`
  - `shopping-list-client`: 初期表示のグルーピング表示（店舗未定が先頭・D-2）/ チェックでフォーム展開 /
    送信成功で該当 item のみ state 更新 / 失敗時 `errorMessage`（楽観値が破棄されること含む） /
    手動追加 / 店舗再割当（グループ移動を含む） / focus イベントでの refetch / 手動更新ボタン
  - `store-group` / `shopping-item-row` / `purchase-input-form` / `add-item-form`: 個別ユニット
    （bought 状態の表示、プレフィル、disable 条件、キャンセル等）
  - `meal-plan-client` への追記分: CTA ボタンの表示条件・ラベル出し分け・遷移が既存テストに追加される
    こと（既存テストの回帰がないこと）
- **ユーティリティ単体（`shopping-list-view.ts`）**: `groupItemsByStore`（店舗未定の先頭固定・
  複数店舗の集約・0 件店舗の除外・不明店舗の防御的フォールバック）、`buildStoreNameMap`、
  `formatShoppingDate`（通常日・年またぎ・曜日表記）
- **API ルートテスト**: 既存 `shopping-lists.test.ts` / `stores.test.ts` で担保済み（変更なし・追加不要）
- **PWA**: `runtimeCaching` は本番ビルド（`next build --webpack`）でのみ有効なため、Vitest では検証
  できない。手動確認（manual-browser-verify スキル。Chrome DevTools Application タブでのオフライン
  再現、`pnpm build && pnpm start` での実行）が必須である旨を試験計画に明記する
- **実画面確認**: manual-browser-verify スキルで確認（トークン適用・レスポンシブ・導線リンク・
  オフライン挙動）。Codex 委譲時は review-codex-implementation の Tailwind タイポ検査が必須
- **E2E smoke**: 既存 Playwright smoke への `/shopping-lists` 表示追加は test-designer 判断

## 移行とリリース

- DB スキーマ変更・マイグレーションなし。既存データへの影響なし。
- API・契約の変更なし（後方互換性の論点なし）。
- Vercel へのデプロイ + 本番ビルドでの Serwist 適用（既存 `next.config.ts` の制約どおり）のみで完結。

## リスク

| #   | リスク                                                                                              | 影響                                                 | 対策                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | S-1〜S-6 未確定のまま実装に着手すると手戻りが大きい（特に S-4 は画面の主要インタラクション）        | 実装計画・試験計画の前提が崩れる                     | フェーズ 2 着手前に S-1〜S-6 のユーザー確定を必須とする                                                                                                                                                                 |
| R-2 | `useOptimistic`（S-4）は本プロジェクト初使用で実装パターンが確立していない                          | 実装コスト・レビュー観点の見積もりがぶれる           | 対象をチェック操作のみに限定して着手し、他操作への展開は実装フェーズで個別判断                                                                                                                                          |
| R-3 | PWA `runtimeCaching` は本番ビルドのみ有効なため、開発中の動作確認が難しい                           | 実装中の検証漏れ・リリース後の不具合発覚             | `pnpm build && pnpm start` での手動確認を試験計画に明記（§テスト方針）                                                                                                                                                  |
| R-4 | 店舗未定グループを先頭固定（D-2）にした表示が実際の買い物動線と合わない可能性                       | UX 上の違和感                                        | 設計者裁量（D-x）のため実装後の実使用フィードバックで調整可能な範囲に留める                                                                                                                                             |
| R-5 | S-3（チェック解除なし）のまま運用すると誤タップの完全な取り消しができない                           | 「やっぱり買わなかった」を pending に戻せない        | S-11(a) の上書き訂正で大半のケースは救える旨を画面文言で示す。要否は Unit B 実使用後に再訪。**Superseded（2026-07-24）**: `docs/designs/shopping-list-item-check.md` によりチェック解除を実装したため本リスクは解消済み |
| R-6 | S-6 のベースライン（バッジのみ）は「A店の方が◯円安い」という roadmap の例示表現そのものは満たさない | roadmap の文言と実装のギャップとして指摘される可能性 | 本書 §S-6 の N+1 トレードオフを踏まえた意図的な判断であることを Orchestrator 経由で明示する                                                                                                                             |

## 未決事項

### ユーザー確定記録（2026-07-13・全件確定済み）

S-1〜S-6 全件をユーザーが推奨案どおり確定（フェーズ 2 進入の前提を満たした）:

- **S-1: 案 B** — `/meal-plans` に CTA + 独立 `/shopping-lists` エントリの両建て
- **S-2: 案 B** — 明示ボタン押下時のみ冪等 POST（閲覧での自動発火はしない）
- **S-3: 案 A** — チェック解除 UI は実装しない（訂正は上書きのみ。制約はユーザー受容済み）
  **Superseded（2026-07-24）**: `docs/designs/shopping-list-item-check.md` / ADR-0009 により
  チェック解除を実装したため、この確定は撤回された。
- **S-4: 案 B** — React 19 `useOptimistic`（新規依存なし → フェーズ 2 の security-reviewer 不要）
- **S-5: 案 A** — オフラインは読み取りキャッシュのみ（書き込みキューは実装しない）
- **S-6: 案 A** — 推奨店舗バッジのみ（金額差の定量表示は対象外 → 将来課題へ）

### implementation-planner への申し送り

- 実装順の推奨: `_utils/shopping-list-view.ts` → 純粋表示コンポーネント（`store-group` /
  `shopping-item-row`）→ 状態管理（`shopping-list-client`）→ 入力系（`purchase-input-form` /
  `add-item-form`）→ エントリ画面 → `meal-plan-client.tsx` 追記 → `sw.ts` 追記、の順（下位コンポーネント
  から積み上げる meal-plan-screens の実装順に準拠）。
- `sw.ts` の変更は他の変更と独立して検証可能なため、実装計画上は別ステップとして分離してよい。

### test-designer への申し送り

- §テスト方針の設計由来観点（特に S-4 の楽観的更新のロールバック・D-7 の refetch・D-2 の
  グルーピング順）を試験計画に反映すること。
- `docs/requirements/shopping-list-screens.md` §5 試験観点（N-01〜N-10 / E-01〜E-08 / B-01〜B-07 /
  O-01〜O-05）を土台とし、本書の S-x 確定結果に応じて該当ケースの扱い（採用/対象外）を確定すること。

### 将来課題（本ユニットでは扱わない）

- ~~チェック解除（bought→pending）UseCase・API の新規実装（S-3）。~~
  Superseded（2026-07-24）: `docs/designs/shopping-list-item-check.md` により実装済み。
- 価格比較の金額差定量表示（roadmap 例示「A 店の方が◯円安い」。S-6 案 C =
  タップ時オンデマンド取得が実装候補）。
- PWA オフライン書き込みキュー（Background Sync・S-5）。
- 価格比較の金額差表示（S-6 案 B/C）。バルク取得 API の新設は性能改善の代替案として検討の価値がある。
- recipes / products 一覧ヘッダーへの「買い物リスト」リンク追加（依頼スコープ外の気づき）。
