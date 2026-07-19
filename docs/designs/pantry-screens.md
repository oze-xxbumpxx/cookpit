# 設計書: pantry-screens

- ステータス: 確定（P-1〜P-6 全件、推奨案どおりユーザー確定・2026-07-19）
- レベル: L2
- スプリント: Sprint 5 Unit B（実装ルート: Codex 委譲。ユーザー確定・2026-07-19。IMP-2026-025 の効果実測対象）
- 関連: `docs/designs/pantry-core.md`（Unit A 確定設計・正典。DTO 形・S-1〜S-11/D-1〜D-8）、
  `docs/designs/pantry-core-contract.md`（Unit A 契約詳細・API/DB 確定形）、
  `docs/designs/shopping-list-screens.md`（Sprint 4 Unit B・L2 画面ユニットの直近先例。本書の構成・
  粒度・S-x/D-x 方式はこれに揃える）、`docs/designs/meal-plan-screens.md`（TanStack Query 不採用の
  先行判断）、`docs/05-roadmap.md` Sprint 5、`.claude/rules/presentation-layer.md`
- 要件定義書: なし（本ユニットは Orchestrator の作業指示メモを直接入力とする。要件分析フェーズを
  経ていないため、本書の「要件」節は Orchestrator 指示 + pantry-core 確定契約から要点を抽出する）

---

## 背景

Sprint 5 Unit A（`pantry-core`）で Pantry 集約のバックエンド一式（Domain / Infrastructure /
Application / API Contract / Presentation(API) 4 UseCase + 買い物完了 API 公開）が実装済み・
main マージ済み（PR #80、2026-07-19）。API・DTO・エラー処理・冪等性は確定済みであり、本ユニットは
それを使う画面（UI）のみを対象とする。roadmap 上、本スプリントのゴールは「買い物完了後、自動で
在庫が増える。手動で消費を記録できる」。

## 目的

- 在庫一覧画面（`/pantry`）を保存場所別グルーピングで提供し、各在庫アイテムに「使った」
  「捨てた」の操作を付ける。
- 買い物リスト詳細画面（`/shopping-lists/[id]`）に「買い物完了」操作を追加し、在庫画面への
  導線を提供する。
- Sprint 4 Unit B（`shopping-list-screens`）で確定した Presentation 層のパターン
  （Server Component 直呼び + Hono RPC、TanStack Query 不採用、`useOptimistic` 不使用の素の
  state 更新等）をそのまま踏襲し、独自の新しいパターンを導入しない。

## 要件

要点のみ。詳細な契約は `docs/designs/pantry-core.md` / `pantry-core-contract.md` を正典とする。

- 画面 A（在庫一覧）: `/pantry`。保存場所別グルーピング表示、各在庫に「使った」「捨てた」ボタン。
- 画面 B（買い物リスト詳細への追加）: `/shopping-lists/[id]` に「買い物完了」操作を追加し、
  完了後に在庫画面への導線を提供する。
- 使用する既存 API（すべて Unit A で実装済み・変更なし）:
  - `GET /api/pantry` → `PantryDto`（常に 200・空でも 200。S-1）
  - `POST /api/pantry/stocks/:stockId/consume`（`{ amount: { value, unit } }`）→ `PantryDto`
  - `POST /api/pantry/stocks/:stockId/discard`（ボディなし）→ `PantryDto`
  - `POST /api/shopping-lists/:id/complete`（ボディなし）→ `ShoppingListDto`（冪等・200固定）
- 新規 API・契約（Zod）・DB スキーマの変更は行わない。
- 認証なし・2 名利用という MVP1 の既存前提は変わらない（ADR-0003/0004 継続）。

## 設計判断サマリ

`shopping-list-screens` の方式に倣い、**P-x（ユーザー確定が必要。推奨案を示すのみで確定しない）**
と **D-x（設計者裁量・先例準拠で確定）** に整理する。

### P-x（全件ユーザー確定済み・2026-07-19。いずれも推奨案を採用）

| #   | 論点                                                                                                      | 推奨案                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | `/pantry` への恒久的なナビゲーション導線をどこに置くか（Orchestrator の 3 項目スコープに明記なし）        | `meal-plans/_components/meal-plan-client.tsx` のヘッダーに「在庫」リンクを追加（既存 レシピ/商品/履歴 リンクと同型）                                                        |
| P-2 | 「使った」ボタンの消費量入力方式                                                                          | 数量入力フォームを設けず、**残量全部を 1 タップで消費**（`amount = stock.amount` を送信）                                                                                   |
| P-3 | 保存場所別グルーピングの実効性（Unit A は `storedLocation` を常に `null` で登録する。S-4〈pantry-core〉） | グルーピング**機構**は実装するが、保存場所を設定する新規編集 API は追加しない（契約変更は本ユニット対象外）。結果として MVP1 では「保存場所未設定」の単一グループ表示になる |
| P-4 | 「買い物完了」ボタンの確認ダイアログの要否                                                                | 設けない（ワンタップ。pantry-core S-4 の「帰宅後にワンタップで完了」という UX 前提を踏襲）                                                                                  |
| P-5 | 「買い物完了」成功後の画面遷移方式                                                                        | 自動リダイレクトはせず、成功バナー + 「在庫を見る」リンクで手動遷移させる                                                                                                   |
| P-6 | 「捨てた」ボタンの確認ダイアログの要否                                                                    | 設けない（`markAsBought` 同様、単発ボタン。取り消しはできない旨は将来課題として申し送る）                                                                                   |

各論点の詳細な選択肢比較は §P-x 詳細 に記載する。

### D-x（設計者裁量で確定）

| #   | 判断                                                                                                                         | 準拠する先例・理由                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 画面構成は単一ルート `/pantry`（一覧のみ。詳細画面は作らない）                                                               | roadmap Sprint 5 タスク 4「在庫一覧（保存場所別）」の範囲に忠実。Stock に詳細画面が要る情報量がない（S-5〈pantry-core〉の `displayName` 保持で一覧のみで完結）                            |
| D-2 | 初期表示は Server Component から `GetPantryUseCase` を直呼び。書き込み（consume/discard）は Client から Hono RPC             | `.claude/rules/presentation-layer.md` の使い分け方針そのまま。shopping-list-core screens 先例と同型                                                                                       |
| D-3 | Repository の組み立ては **すべて `apps/web/src/server/repositories.ts` の共有ファクトリ経由**（Server Component も例外なし） | Orchestrator 指示（Task 5 の模範コード鮮度切れによる重複定義の再発防止）。既存 2 先例（`new Drizzle...Repository(getDb())` 直書き）とは意図的に異なる運用（下記「先例からの逸脱点」参照） |
| D-4 | TanStack Query は導入しない。素の Hono RPC 呼び出し + `useState` によるローカル state 更新                                   | `meal-plan-screens` S-6・`shopping-list-screens` S-4 の確定先例を継続。本プロジェクトに TanStack Query の依存は存在しない（`package.json` 確認済み）                                      |
| D-5 | consume/discard の成功時は **レスポンスの更新後 `PantryDto` で state を丸ごと置換**（`useOptimistic` は使わない）            | pantry-core D-3「更新後 PantryDto を返す」設計の素直な帰結。ConsumeStock は非冪等（申し送り済み）のため、楽観的パッチより確定値置換の方が二重送信時の表示不整合が起きにくい               |
| D-6 | 二重送信防止は「操作中の stockId のみ disable」（`submittingStockId` state）                                                 | `shopping-list-client.tsx` の `submittingItemId` パターンをそのまま踏襲                                                                                                                   |
| D-7 | 他端末との同期は「画面フォーカス時の自動 silent refetch」+「手動更新ボタン」                                                 | `shopping-list-screens` D-7 と同型。roadmap の「2人で～反映される」完了条件の最小実装方針を継続                                                                                           |
| D-8 | `ShoppingListNotFoundError`（初期表示）は `notFound()` に委譲（変更なし・既存のまま）                                        | 本ユニットでは `[id]/page.tsx` の該当ロジックに変更を加えない（既存のまま）                                                                                                               |

---

## 対象範囲

- `apps/web` の Presentation 層のみ（画面・Client/Server Component・Hono RPC 呼び出し）。
- 既存 4 API（`GET /api/pantry` / `POST /api/pantry/stocks/:stockId/consume` /
  `POST /api/pantry/stocks/:stockId/discard` / `POST /api/shopping-lists/:id/complete`）をそのまま使用。
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` への「買い物完了」導線追加。
- （P-1 confirmed 後のみ）`apps/web/src/app/meal-plans/_components/meal-plan-client.tsx` への
  「在庫」ナビゲーションリンク追加。

## 対象外

- バックエンド / Domain / Application / Infrastructure / API Contract（Zod）/ DB スキーマの変更
  （Unit A で確定済みのものをそのまま使う。追加が必要になった場合も本書では実装せず、将来課題として
  記録するのみ）。
- **賞味期限管理の完全対応**（Phase 2。`expiresAt` は Unit A の設計上 MVP1 では常に `null` で
  登録される（S-4〈pantry-core〉）ため、表示するとしても常に空欄になる。表示自体は「対象外」まで
  厳格化せず §フロントエンド設計 の任意表示に留める）。
- **在庫引き算連携**（`GenerateShoppingListUseCase` への Pantry 注入。Sprint 5 Unit C）。
- **保存場所（`storedLocation`）を設定・編集する新規 UI・新規 API**（P-3 の帰結。追加する場合は
  新規 UseCase・契約変更が必要になり L2 の前提を超える）。
- **消費量の部分入力 UI**（P-2 で全量ワンタップを推奨。数量入力フォームを採用する場合は別途 P-2 の
  確定に応じて設計を差し替える）。
- 消費・廃棄の取り消し（チェック解除相当の操作）。ConsumeStock/DiscardStock に取り消し API は
  存在しない（pantry-core の対象外・Phase 2 検討）。
- PWA オフライン強化（`sw.ts` の `runtimeCaching` 追記）。roadmap Sprint 5 のタスクに記載がなく、
  Orchestrator 指示にも含まれないため本書では扱わない（気づきとして将来課題に記録）。
- 認証・複数ユーザー対応（ADR-0003 / ADR-0004 継続）。
- implementation-planner / test-designer の成果物（詳細実装計画・試験計画はフェーズ 2）。

---

## P-x 詳細（選択肢比較）

### P-1: `/pantry` への恒久的なナビゲーション導線

| 案        | 内容                                                                                                     | 長所                                                                                                          | 短所                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | `meal-plan-client.tsx` のヘッダー（`flex justify-end` 側、既存「履歴」リンクの隣）に「在庫」リンクを追加 | 既存の レシピ/商品/履歴 リンクと同型の 1 行追加で完結。献立画面はアプリの実質的なハブ画面であり、発見性が高い | `meal-plan-client.tsx`（Unit A 完了済み・回帰リスクを避けたい既存ファイル）に触れる。Orchestrator の 3 項目スコープに明記のない追加ファイル |
| B         | 恒久リンクは設けず、「買い物完了」後のバナーリンク（P-5）のみを導線とする                                | 既存ファイルへの追加変更がゼロで済む                                                                          | 買い物を完了していない週やブラウザのブックマーク・PWA ホーム画面ショートカットからの再訪問時に `/pantry` への入口がなくなる                 |
| C         | `shopping-list-client.tsx` のヘッダーにも「在庫」リンクを追加する（A と併用）                            | 買い物中の画面からも在庫を確認できる                                                                          | 買い物中に在庫画面へ離脱する動線を作る必要性が薄く、変更ファイルが増える                                                                    |

**推奨: 案 A**。`shopping-list-screens` S-1（`/meal-plans` への CTA 追加）と同型の「ハブ画面へ
1 行追加」判断を踏襲する。案 C は必要になれば独立して追加できるため今は見送る。

### P-2: 「使った」ボタンの消費量入力方式

| 案        | 内容                                                                                                | 長所                                                                                                                                                                                                     | 短所                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | 「使った」ボタン 1 タップで残量全部を消費する（`consume` に `amount: stock.amount` をそのまま送信） | roadmap の文言どおり「使った」「捨てた」という**単発ボタン**として実装でき、新規フォームコンポーネントが不要。pantry-core の「ざっくり運用」思想（S-6/S-7）と整合。単位不一致（422）が原理的に発生しない | 「半分だけ使った」という部分消費を記録できない（在庫が実態よりゼロ寄りに倒れる）                                                |
| B         | `purchase-input-form.tsx` に類する数量入力フォームを展開し、部分消費を入力できるようにする          | 正確な残量管理ができ、Unit C（在庫引き算連携）が将来この残量を参照する際に精度が上がる                                                                                                                   | 新規フォームコンポーネントの追加が必要（展開パネル UI・バリデーション）。roadmap の「ボタン」という文言よりスコープが大きくなる |

**推奨: 案 A**。pantry-core の設計思想（消費は手動・ざっくり運用。S-7 のクランプ挙動もこの前提で
設計されている）と roadmap の文言（「使った」ボタン、フォームではない）に最も忠実。部分消費が
必要になった場合は、案 A のボタンはそのまま残しつつ「一部使った」の追加ボタン/フォームを後から
足せる（Consume API 自体は既に任意の量を受け付けられるため、後方互換で拡張可能）。

### P-3: 保存場所別グルーピングの実効性

| 案        | 内容                                                                                                                                                | 長所                                                                                                                                                                                   | 短所                                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A（推奨） | グルーピング**表示ロジック**（`fridge`/`freezer`/`pantry`/`未設定` の順に並べる）は実装するが、`storedLocation` を設定する編集 UI・API は追加しない | 契約変更なし・L2 の前提を超えない。将来 Phase 2 で `storedLocation` を設定する経路（例: 手動追加時の入力、Product デフォルト値）が生まれた時点で、このグルーピング UI がそのまま活きる | MVP1 では Unit A のデータが常に `storedLocation: null` のため、**実運用上は「保存場所未設定」という単一グループしか表示されない**。roadmap の「保存場所別」という文言を字面どおりには満たさない                    |
| B         | 在庫に保存場所を後付けで設定する簡易編集 UI（例: 各行に `SelectField`）+ 新規 `PATCH` 相当 API を本ユニットに追加する                               | roadmap の「保存場所別」を実データで満たせる                                                                                                                                           | 新規 UseCase・Zod スキーマ・Drizzle 更新（`stored_location` の UPDATE）が必要になり、L2（Presentation のみ）を超え Unit A 相当の追加契約設計が要る。Unit A は already confirmed/完了しており、追加は別ユニット相当 |
| C         | グルーピング UI 自体を実装しない（フラットな一覧のみ表示）                                                                                          | 実装が最も単純                                                                                                                                                                         | roadmap 文言（保存場所別グルーピング表示）に明確に反する。Phase 2 で `storedLocation` が使われ始めた時にグルーピング UI を作り直す必要がある                                                                       |

**推奨: 案 A**。グルーピングの「仕組み」は roadmap の要求どおり実装し、データが揃っていない現状の
限界（単一グループ表示になること）は正直に画面文言（例: 空状態や補足テキストは設けない。単に
「保存場所未設定」ヘッダーの 1 グループが出るだけで UI 上は自然に見える）で吸収する。案 B は
Unit A の契約に手を入れる必要があるため、本 Unit（L2・Codex 委譲・契約変更なしが前提）のスコープを
超える。**この論点はユーザー確認が必須**（roadmap の文言と実際の見え方にギャップがあるため）。

### P-4: 「買い物完了」ボタンの確認ダイアログの要否

| 案        | 内容                                                                                                          | 長所                                                                                                 | 短所                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | 確認ダイアログなし。ボタン 1 回のタップで即座に完了処理を実行                                                 | pantry-core の設計前提（「帰宅後にワンタップで完了」）に忠実。完了は冪等なので誤タップの実害が小さい | 未購入（pending）の品目が残っていても警告なしに完了できてしまう                                                       |
| B         | `recipes/[id]/_components/recipe-detail-client.tsx` の削除フローと同型の base-ui AlertDialog による確認を挟む | 誤操作の抑止になる                                                                                   | 冪等な操作にまで確認ダイアログを課すのは pantry-core の設計思想と不整合。新規 UI パターンではないが実装コストが増える |

**推奨: 案 A**。`ShoppingList.complete()` に「全品目が bought でなければならない」という不変条件は
ない（pantry-core §データフロー「bought 品目 0 件の場合はステップ 4・5 が空振り」を確認済み）ため、
未購入品目を残したまま完了することは正常系として許容されている。確認なしでも実害は小さい。

### P-5: 「買い物完了」成功後の画面遷移方式

| 案        | 内容                                                                                                                            | 長所                                                                                               | 短所                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A（推奨） | 成功後は `/shopping-lists/[id]` に留まり、成功バナー（例:「買い物を完了しました」）+「在庫を見る」リンク（`/pantry`）を表示する | 完了直後にどの品目が bought/pending だったかをその場で振り返れる。ユーザーの選択に遷移を委ねられる | `meal-plan-client.tsx` の `handleShoppingList`（生成直後に `router.push`）とは異なる遷移方式になる |
| B         | 成功後に `router.push('/pantry')` で自動遷移する                                                                                | 遷移が 1 ステップで完結し、`meal-plan-client.tsx` の生成直後遷移パターンと一貫する                 | 買い物リストの内容を振り返る間もなく画面が切り替わり、完了直後に何が起きたか把握しにくい           |

**推奨: 案 A**。`meal-plan-client.tsx` の遷移（新規作成した空のリストを開くだけ = 見るべき内容が
他にない）とは状況が異なり、完了直後の買い物リストには「何が bought/pending だったか」という
振り返る価値のある情報が残っている。自動遷移せず選択を残す方が丁寧な UX と判断する。

### P-6: 「捨てた」ボタンの確認ダイアログの要否

| 案        | 内容                                          | 長所                                                                                         | 短所                                                                   |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A（推奨） | 確認ダイアログなし（単発ボタン）              | `markAsBought` 同様の単発ボタンパターンに統一でき、実装が単純                                | 誤タップで在庫が消え、取り消し手段がない（discard に undo API はない） |
| B         | 削除相当として base-ui AlertDialog で確認する | 誤操作を抑止できる（`recipes/[id]/_components/recipe-detail-client.tsx` の削除フローと同型） | 「使った」（P-4 で確認なし）との操作感の非対称が生まれる               |

**推奨: 案 A**。「使った」（P-4）と操作感を揃えることを優先する。誤操作リスクは残るが、
2 名利用の個人開発アプリという MVP1 の性質上、致命的なデータ喪失には当たらないと判断する
（買った記録・価格履歴には影響しない。R-2 参照）。

---

## 現状構成

```
apps/web/src/app/
├── shopping-lists/
│   ├── [id]/page.tsx                            # Server Component（GetShoppingListUseCase 直呼び）
│   └── _components/shopping-list-client.tsx      # 「買い物完了」ボタンは未実装
├── meal-plans/
│   └── _components/meal-plan-client.tsx          # レシピ/商品/履歴リンクのみ。在庫リンクなし
└── pantry/                                       # ★ 存在しない（未着手）

apps/web/src/server/
├── routes/pantry.ts                              # GET / consume / discard 実装済み（変更しない）
├── routes/shopping-lists.ts                      # POST /:id/complete 実装済み（変更しない）
└── repositories.ts                                # pantryRepository() 含む共有ファクトリ（実装済み）

packages/api-contract/src/pantry.schema.ts         # 契約実装済み（変更しない）
packages/application/src/pantry/                   # DTO・UseCase 4 本 実装済み（変更しない）
```

確立済みの先例パターン（本設計はこれを踏襲する）:

- 一覧の初期表示: Server Component が UseCase を手動 DI で直呼び → Client Component に初期値を渡す
  （`meal-plans/page.tsx` / `shopping-lists/[id]/page.tsx`）。
- 書き込み: Client Component から素の Hono RPC（`client.api...`）→ 成功後にローカル state 更新 /
  `router.push()` / `router.refresh()`。TanStack Query は使わない（D-4）。
- 二重送信防止: 操作中の id のみ `disabled` にする（`submittingItemId` パターン）。
- 他端末同期: `window` の `'focus'` イベントで silent refetch + 手動「更新」ボタン（D-7 継承）。
- グルーピング表示: `groupItemsByStore`（`shopping-lists/_utils/shopping-list-view.ts`）と同型の
  ロジックを機能ローカルに用意する（他機能からの import はしない先例）。
- エラー表示: 赤枠バナー（`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700`）。

### 先例からの逸脱点（D-3・明示）

既存 2 画面（`shopping-lists/[id]/page.tsx` / `meal-plans/page.tsx`）は Server Component 内で
`new DrizzleXRepository(getDb())` を直接 `new` している。本ユニットは Orchestrator 指示により、
**Server Component であっても Repository の組み立ては `apps/web/src/server/repositories.ts` の
共有ファクトリ（`pantryRepository()` 等）を経由する**（新規 `new Drizzle...Repository(getDb())` を
画面側で書かない）。これは前回タスクで模範コード鮮度切れにより Repository 定義が重複した再発防止
であり、既存 2 画面を今回遡って直すことはしない（対象外。気づきとして将来課題に記録）。

## 変更後構成

### 新規作成ファイル

```
apps/web/src/app/pantry/
├── page.tsx                              # 新規: 在庫一覧（Server Component）
├── _components/
│   ├── pantry-client.tsx                 # 新規: 状態管理・全体統括（Client）
│   ├── pantry-client.test.tsx
│   ├── location-group.tsx                # 新規: 保存場所ごとのグループ（ヘッダー + stock 一覧）
│   ├── location-group.test.tsx
│   ├── stock-row.tsx                     # 新規: stock 1 行（表示 + 使った/捨てたボタン）
│   └── stock-row.test.tsx
└── _utils/
    ├── pantry-view.ts                    # 新規: groupStocksByLocation / formatPurchasedAt 等
    └── pantry-view.node.test.ts
```

### 既存ファイルへの追記・変更

| ファイル                                                                               | 変更内容                                                                                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`                 | 「買い物完了」ボタン + 成功バナー + 「在庫を見る」リンクを追加（P-4/P-5）。既存のチェック・手動追加・店舗再割当ロジックには触れない |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`（P-1 confirmed 時のみ） | ヘッダーに「在庫」リンクを 1 個追加（P-1）。既存の作成・追加・削除フローには触れない                                                |

既存の Recipe / Product / Store / MealPlan / ShoppingList / Pantry の Domain・Application・
Infrastructure・API Contract・Hono ルートには**一切変更を加えない**。

---

## データフロー

### 層責務（誰が何をするか）

| 層             | 責務                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation   | Server Component は初期表示の読み取りのみ（副作用なし・Repository は共有ファクトリ経由）。Client Component が Hono RPC 経由で書き込みを行い、ローカル state を更新する。ドメインロジックを書かない |
| Application    | 既存 UseCase（Unit A の 4 本 + CompleteShopping）をそのまま利用。変更なし                                                                                                                          |
| Domain         | 変更なし                                                                                                                                                                                           |
| Infrastructure | 変更なし                                                                                                                                                                                           |

### 初期表示（`/pantry`）

```
ブラウザ → /pantry
  → pantry/page.tsx (Server Component, force-dynamic)
      → new GetPantryUseCase(pantryRepository()).execute()   # D-3: 共有ファクトリ経由
      → 常に 200（S-1〈pantry-core〉。在庫 0 件でも { stocks: [] }）
  → <PantryClient pantry={dto} />
      → groupStocksByLocation(dto.stocks) で表示用グループへ変換（_utils/pantry-view.ts）
      → stocks.length === 0 → 「在庫がありません」空状態表示
```

### 「使った」（consume・P-2 案 A: 全量ワンタップ）

```
stock 行の「使った」ボタンタップ（submittingStockId === stock.id でない場合のみ受理）
  → setSubmittingStockId(stock.id) / errorMessage をクリア
  → client.api.pantry.stocks[':stockId'].consume.$post({
      param: { stockId: stock.id },
      json: { amount: { value: stock.amount.value, unit: stock.amount.unit } },   # 残量全部
    })
  → 200 → 応答の PantryDto で stocks state を丸ごと置換（D-5。全量消費のため当該 stock は
     応答配列から消える）
  → !response.ok（404/422/400）→ errorMessage 表示（§エラー処理）
  → catch → 「通信エラーが発生しました。」
  → finally: setSubmittingStockId(null)
```

### 「捨てた」（discard）

```
stock 行の「捨てた」ボタンタップ（submittingStockId === stock.id でない場合のみ受理）
  → setSubmittingStockId(stock.id) / errorMessage をクリア
  → client.api.pantry.stocks[':stockId'].discard.$post({ param: { stockId: stock.id } })
  → 200 → 応答の PantryDto で stocks state を丸ごと置換（当該 stock は残量に関わらず消える）
  → !response.ok（404）→ errorMessage 表示
  → catch → 「通信エラーが発生しました。」
  → finally: setSubmittingStockId(null)
```

### 「買い物完了」（`shopping-list-client.tsx` への追加。P-4/P-5）

```
list.status === 'active' のときのみ「買い物完了」ボタンを表示
  → タップ（completeSubmitting でない場合のみ受理）
  → setCompleteSubmitting(true) / completeErrorMessage をクリア
  → client.api['shopping-lists'][':id'].complete.$post({ param: { id: shoppingList.id } })
  → 200 → 応答の ShoppingListDto で status ローカル state を更新（'completed' になる）
     → completeSuccess フラグを true にし、成功バナー「買い物を完了しました」+
       「在庫を見る」リンク（Link href="/pantry"）を表示（P-5 案 A。自動遷移しない）
     → status !== 'active' の間は「買い物完了」ボタン・手動追加ボタンを非表示にする
       （チェック・店舗再割当は既存どおり残す。再送信しても complete は冪等なので実害はない）
  → !response.ok（404）→ completeErrorMessage「操作に失敗しました。」
  → catch → 「通信エラーが発生しました。」
  → finally: setCompleteSubmitting(false)
```

### 他端末との同期（refetch・D-7）

```
- 画面フォーカス復帰時（window の 'focus' イベント）に GET /api/pantry を自動再取得し
  stocks state を置換（silent。エラーは無視して表示を維持。shopping-list-screens D-7 と同型）
- ヘッダーの「更新」ボタンでも同じ refetch を実行（silent ではなく、失敗時は errorMessage 表示）
```

### オフライン時の挙動

対象外（§対象外「PWA オフライン強化」参照）。オフラインで書き込み操作を行うと fetch が失敗し、
既存の catch ブロックによる「通信エラーが発生しました。」表示に留まる（キュー機構なし）。

---

## API 設計

**変更なし。既存 API のみ使用する。** 新規 API・契約変更は行わない
（正本: `packages/api-contract/src/pantry.schema.ts` / `shopping-list.schema.ts`）。

| 用途                                | エンドポイント                             | 画面での使い方（Hono RPC）                                                                              |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 在庫一覧の取得（初期表示・refetch） | `GET /api/pantry`                          | Server Component: `GetPantryUseCase` 直呼び（`pantryRepository()`）。Client: `client.api.pantry.$get()` |
| 消費（「使った」）                  | `POST /api/pantry/stocks/:stockId/consume` | `client.api.pantry.stocks[':stockId'].consume.$post({ param: { stockId }, json: { amount } })`          |
| 廃棄（「捨てた」）                  | `POST /api/pantry/stocks/:stockId/discard` | `client.api.pantry.stocks[':stockId'].discard.$post({ param: { stockId } })`                            |
| 買い物完了                          | `POST /api/shopping-lists/:id/complete`    | `client.api['shopping-lists'][':id'].complete.$post({ param: { id } })`                                 |

いずれも `apps/web/src/lib/api-client.ts` の `client = hc<AppType>('/')`（`AppType` は
`apps/web/src/server/app.ts` から `import type` で取り込み済み）をそのまま使う。ルートが
未変更のため、本 Unit で `api-client.ts` に変更は不要。

## DB 設計

**対象外（変更なし）**。既存の `stocks` テーブルをそのまま使用する
（正本: `docs/designs/pantry-core.md` §DB 設計 / `pantry-core-contract.md` §2）。

## バックエンド設計

**対象外（変更なし）**。既存の Domain / Application / Infrastructure / Hono ルート
（`apps/web/src/server/routes/pantry.ts` / `shopping-lists.ts`）をそのまま使用する。
手動 DI の組み立ては Server Component（初期表示の読み取り専用 UseCase。**必ず
`apps/web/src/server/repositories.ts` の共有ファクトリ経由**。D-3）と既存 Hono ルート
（RPC 経由の書き込み。ルート側はすでに共有ファクトリを使用済み・変更不要）が担う。

---

## フロントエンド設計

### `pantry/page.tsx`（Server Component）

```typescript
import { GetPantryUseCase } from '@cookpit/application';
import { pantryRepository } from '@/server/repositories';
import { PantryClient } from './_components/pantry-client';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const pantry = await new GetPantryUseCase(pantryRepository()).execute();
  return <PantryClient pantry={pantry} />;
}
```

- try/catch はしない（`GetPantryUseCase` は例外を投げない。常に 200 相当の `PantryDto` を返す。
  S-1〈pantry-core〉）。DB 障害のみ Next.js のエラーバウンダリに委ねる（`meal-plans/page.tsx` 先例）。

### `_components/pantry-client.tsx`（Client Component・状態管理の中心）

- `'use client'`。Props: `{ pantry: PantryDto }`。
- ローカル state: `stocks: StockDto[]`（`pantry.stocks` で初期化）、`errorMessage: string | null`、
  `submittingStockId: string | null`（D-6）、`refreshing: boolean`（手動更新ボタン用）。
- `useEffect` で `window` の `'focus'` イベントに silent refetch ハンドラを登録（D-7）。
  アンマウント時に解除。
- `groupedStocks = groupStocksByLocation(stocks)`（`_utils/pantry-view.ts`。P-3）。
- ヘッダー: 「戻る」（`/meal-plans`）+ タイトル「在庫」+ 「更新」ボタン（手動 refetch。D-7。
  `shopping-list-client.tsx` のヘッダー構成と同型）。
- 本文: `groupedStocks.map(<LocationGroup>)`。`stocks.length === 0` は「在庫がありません」。
- 「使った」「捨てた」の実処理（consume/discard の fetch・state 更新）は `pantry-client.tsx` の
  ハンドラとして持ち、`<StockRow>` へ props で渡す（`shopping-list-client.tsx` が
  `handleMarkAsBought` 等を `<ShoppingItemRow>` に渡す構成と同型）。

### `_components/location-group.tsx`

- Props: `{ location: StorageLocation | null, stocks: StockDto[], submittingStockId, onConsume, onDiscard }`。
- ヘッダー: `LOCATION_LABELS`（`_utils/pantry-view.ts`）で `'fridge' → '冷蔵'`, `'freezer' → '冷凍'`,
  `'pantry' → '常温'`, `null → '保存場所未設定'` に変換して表示。
- `stocks.map(<StockRow>)`。

### `_components/stock-row.tsx`

- Props: `{ stock: StockDto, submitting: boolean, onConsume: (stockId: string) => void, onDiscard: (stockId: string) => void }`。
- `displayName` + `${stock.amount.value}${stock.amount.unit}`（`shopping-item-row.tsx` の
  数量表示と同型フォーマット）。
- `expiresAt !== null` のときのみ「〜{MM/DD}まで」を小さく併記（MVP1 では常に `null` のため
  通常は表示されない。§対象外「賞味期限管理の完全対応」参照。表示ロジック自体は将来のための
  後方互換的な実装として含める）。
- 右側に「使った」（`variant="outline"`）と「捨てた」（`variant="destructive"`）の 2 ボタン。
  両方とも `disabled={submitting}`。タップで `onConsume(stock.id)` / `onDiscard(stock.id)` を
  呼ぶ（確認ダイアログなし。P-4/P-6 の判断を stock-row にも適用）。

### `_utils/pantry-view.ts`

```typescript
import type { StockDto, StorageLocation } from '@cookpit/application';

const LOCATION_ORDER: Array<StorageLocation | null> = ['fridge', 'freezer', 'pantry', null];
const LOCATION_LABELS: Record<string, string> = {
  fridge: '冷蔵',
  freezer: '冷凍',
  pantry: '常温',
};
const UNSET_LOCATION_LABEL = '保存場所未設定';

export interface StockLocationGroup {
  location: StorageLocation | null;
  label: string;
  stocks: StockDto[];
}

// storedLocation でグルーピングし、fridge → freezer → pantry → 未設定 の固定順で並べる（P-3）。
// stocks が 0 件のグループは出さない。MVP1 では全件 storedLocation === null のため、実際には
// 「保存場所未設定」の単一グループのみが表示される（既知の制約。P-3 参照）。
export function groupStocksByLocation(stocks: StockDto[]): StockLocationGroup[];

// purchasedAt "2026-07-11T01:00:00.000Z" → 表示用の任意フォーマット（採用する場合のみ）。
// expiresAt "2026-08-01" → 「8/1まで」。
export function formatExpiresAt(expiresAt: string): string;
```

### 導線の追加

- `shopping-list-client.tsx`: ヘッダーの下（既存の `errorMessage` バナーの下）に、
  `shoppingList.status === 'active'` のときのみ「買い物完了」ボタンを表示。完了成功後は
  成功バナー + 「在庫を見る」リンク（`Link href="/pantry"`）に切り替える（P-4/P-5）。
- `meal-plan-client.tsx`（P-1 confirmed 時のみ）: ヘッダーの `flex justify-end` 側、既存
  「履歴」リンクの隣に「在庫」リンク（`Link href="/pantry"`）を追加する。

### ビジュアル

- 既存のセマンティックトークン（`bg-background` / `text-foreground` / `text-muted-foreground` /
  `border` / `primary` / `secondary` / `destructive` 系）のみ使用。新規トークン追加はしない。
- shadcn/ui 由来の既存コンポーネント（`Button`）を流用。新規 UI 基盤（新規パッケージ・新規
  プリミティブラッパー）は導入しない。

---

## エラー処理

外部 I/O は DB（既存接続）+ 既存 API のみのため、リトライ・タイムアウト等は既存機能と同一方針
（pantry-core §エラー処理を継承・対象外）。画面のエラーハンドリングは以下のとおり。

| エラー種別                                      | 発生箇所                              | 処理                                                                                                 |
| ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `StockNotFoundError`（404）                     | consume / discard                     | `errorMessage`「操作に失敗しました。」+ 手動「更新」ボタンでの再同期を促す（別端末で先に廃棄済み等） |
| `InvalidStockOperationError`（422・単位不一致） | consume                               | 同上（P-2 案 A では stock 自身の unit を送るため通常到達しない。型として存在するため防御的に処理）   |
| Zod バリデーション失敗（400）                   | consume（`amount.value` が 0 以下等） | P-2 案 A では常に正の残量を送るため通常発生しない。到達した場合は `errorMessage` にそのまま反映      |
| `ShoppingListNotFoundError`（404）              | 買い物完了                            | `errorMessage`「操作に失敗しました。」                                                               |
| ネットワークエラー（fetch 失敗）                | Client（catch）                       | `errorMessage`「通信エラーが発生しました。」                                                         |
| DB 障害（初期表示）                             | Server Component                      | try/catch せず Next.js エラーバウンダリへ                                                            |

冪等性: 買い物完了は既存どおり冪等（S-3・pantry-core）のためボタンの二重送信は実害がない。
consume/discard は非冪等（二重送信で二重消費・二重廃棄に相当する挙動になり得るが、discard は
2 回目が 404 になるだけで実害は増えない。consume の 2 回目は既に 0 の stock に対する消費で
`amount.value <= 0` の送信になり 400 で弾かれる可能性が高い）ため、`submittingStockId` による
UI 上のガード（D-6）で二重送信自体を防ぐ。

## ログと監視

対象外（MVP1 方針どおり）。サーバー側エラーは既存の `app.onError` の `console.error` に委ねる。

## セキュリティ

- 認証なしは MVP1 の既存前提と同じ（本機能で状況は変わらない）。
- 書き込み入力はすべて既存の Zod 契約（`pantry.schema.ts` / `shopping-list.schema.ts`）で
  サーバー側検証される。P-2 案 A では消費量はクライアントが `stock.amount` をそのまま転記する
  だけであり、ユーザー入力を新たに受け付けない（入力面の攻撃対象が増えない）。
- 表示文字列（`displayName` 等）は React の標準エスケープに委ねる。`dangerouslySetInnerHTML` は
  使用しない。

## 性能

- 初期表示は `GetPantryUseCase` 単体（`Promise.all` での並列化対象なし。参照する Store/Product
  マスタがない）。`GET /api/pantry` 自体は単一テーブル全件 SELECT（pantry-core §性能で確認済み・
  数十〜百件規模）。
- 書き込み（consume/discard）はレスポンスの更新後 `PantryDto`（D-3・D-5）でローカル state を
  丸ごと置換するため、書き込みごとの追加 GET は発生しない。
- `window` の `'focus'` イベントによる自動 refetch（D-7）は 1 回のフォーカス復帰につき
  `GET /api/pantry` を 1 回発行するのみで、頻度は現実的な範囲に収まる。失敗時は既存表示を維持し
  無視する（`shopping-list-screens` 性能節と同じ扱い）。

## テスト方針

apps/web のテスト基盤（Vitest + RTL、Hono ルートテスト）は導入済み。詳細な試験計画は実装フェーズ
開始時に test-designer が `docs/tests/pantry-screens.md` を作成する。本設計から引き継ぐ観点:

- **RTL（Client / 純粋コンポーネント）**
  - `pantry-client`: 在庫 0 件 → 空状態表示 / グルーピング表示（保存場所順・複数グループ・単一
    〈未設定〉グループの両方） / 「使った」タップで stock が一覧から消える（残量全部消費） /
    「捨てた」タップで stock が消える / 失敗時 `errorMessage` / focus イベントでの silent
    refetch / 手動更新ボタン / 二重送信防止（`submittingStockId` 中は対象行のボタンが disabled）
  - `location-group` / `stock-row`: 個別ユニット（ラベル出し分け、`expiresAt` 非 null 時の表示、
    ボタン disable 条件）
  - `shopping-list-client` への追記分: `status === 'active'` のときのみ「買い物完了」ボタン表示 /
    成功で成功バナー + 在庫リンク表示 / 失敗時 `errorMessage` / 完了後の手動追加ボタン非表示
    （既存テストの回帰がないこと）
  - （P-1 confirmed 時のみ）`meal-plan-client` への追記分: 「在庫」リンクの表示・遷移先
- **ユーティリティ単体（`pantry-view.ts`）**: `groupStocksByLocation`（固定順・0 件グループの
  除外・全件 `null` のケース） / `formatExpiresAt`（非 null ケースのみ。null は呼び出し側でガード）
- **API ルートテスト**: 既存 `pantry.test.ts` / `shopping-lists.test.ts` で担保済み（変更なし・
  追加不要）
- **実画面確認**: manual-browser-verify スキルで確認（トークン適用・レスポンシブ・導線リンク）。
  Codex 委譲時は review-codex-implementation の Tailwind タイポ検査が必須
- **E2E smoke**: 既存 Playwright smoke への `/pantry` 表示追加は test-designer 判断

## 移行とリリース

- DB スキーマ変更・マイグレーションなし。既存データへの影響なし。
- API・契約の変更なし（後方互換性の論点なし）。
- Vercel へのデプロイのみで完結。

## リスク

| #   | リスク                                                                                                                                                                                                     | 影響                                                 | 対策                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R-1 | P-1〜P-6 未確定のまま実装に着手すると手戻りが大きい（特に P-2/P-3 は主要な画面挙動・見え方に直結）                                                                                                         | 実装計画・試験計画の前提が崩れる                     | フェーズ 2 着手前に P-1〜P-6 のユーザー確定を必須とする                                                                   |
| R-2 | 「捨てた」に確認ダイアログがない（P-6 案 A）ため誤操作で在庫が消える。取り消し API がない                                                                                                                  | 誤って正常な在庫を廃棄記録してしまう可能性           | 実害は「在庫一覧上の記録が減る」のみで価格履歴・買い物履歴には影響しない。再発防止は Phase 2 の undo/履歴機能に申し送り   |
| R-3 | 保存場所別グルーピング（P-3）が MVP1 では実質「単一グループ」にしかならず、roadmap の文言と実装の見え方にギャップがある                                                                                    | roadmap の文言と実装のギャップとして指摘される可能性 | 本書 §P-3 の判断根拠を Orchestrator 経由でユーザーに明示し、確定を得る                                                    |
| R-4 | consume の二重送信時、2 回目が「0 以下の消費」で 400 になる想定だが、`submittingStockId` の disable 解除タイミングとの競合で理論上は連続送信が成立し得る（D-6 の UI ガードのみで完全に防げるわけではない） | ごく稀に連続タップで消費量の意味が崩れる可能性       | サーバー側の Zod 検証（`z.number().positive()`）が最終防衛線。実害は「2 回目が 400 で失敗するだけ」で在庫データは壊れない |
| R-5 | `meal-plan-client.tsx` / `shopping-list-client.tsx` という Unit A 完了済みの既存ファイルに手を入れる（P-1・買い物完了導線）                                                                                | 既存テストの回帰リスク                               | 追記は既存ロジックと独立した分岐（新規 state・新規ハンドラ）に限定し、既存フローの変更は行わない                          |

## 未決事項

### ユーザー確認が必要な事項 → **全件確定済み（2026-07-19）**

P-1〜P-6 はすべて推奨案どおりユーザー確定（2026-07-19・AskUserQuestion による確認）:

- **P-1**: `meal-plan-client.tsx` ヘッダーに「在庫」リンクを追加（案 A）。
- **P-2**: 残量全部を 1 タップで消費。フォームは設けない（案 A）。
- **P-3**: グルーピング機構のみ実装。編集 UI/API は追加せず、MVP1 では「保存場所未設定」の
  単一グループ表示になることを許容（案 A）。
- **P-4**: 「買い物完了」の確認ダイアログなし（案 A）。
- **P-5**: 完了成功後は自動遷移せず、成功バナー + 「在庫を見る」リンク（案 A）。
- **P-6**: 「捨てた」の確認ダイアログなし（案 A）。

D-1〜D-8（設計者裁量）は先例準拠のため確定として記録する。異論があれば実装計画フェーズ前に
指摘すること。

### implementation-planner への申し送り

- 実装順の推奨: `_utils/pantry-view.ts` → 純粋表示コンポーネント（`location-group` /
  `stock-row`）→ 状態管理（`pantry-client`）→ `pantry/page.tsx` → `shopping-list-client.tsx`
  追記 → （P-1 confirmed 時のみ）`meal-plan-client.tsx` 追記、の順
  （下位コンポーネントから積み上げる `shopping-list-screens` の実装順に準拠）。
- Server Component の Repository 組み立ては**必ず `apps/web/src/server/repositories.ts` の
  共有ファクトリを import する**こと（D-3。`new DrizzlePantryRepository(getDb())` を画面側で
  直接書かない）。Codex への指示書には本制約を明記すること。
- `.claude/state/current-feature` は設定済み（変更不要）。

### test-designer への申し送り

- §テスト方針の設計由来観点（特に P-2 の全量消費挙動・P-3 のグルーピング固定順・D-6/D-7 の
  二重送信防止と refetch）を試験計画に反映すること。

### 将来課題（本ユニットでは扱わない）

- 保存場所（`storedLocation`）の設定・編集 UI と対応 API の新設（P-3 案 B。Unit A 相当の追加契約
  設計が必要）。
- 消費量の部分入力 UI（P-2 案 B。Consume API 自体は後方互換で対応可能）。
- 消費・廃棄の取り消し（undo）・履歴機能（Phase 2。R-2 の申し送り）。
- PWA オフライン強化（`sw.ts` への `/pantry` エントリ追加。roadmap Sprint 5 のタスクに記載なし）。
- Unit C（在庫引き算連携）: `GenerateShoppingListUseCase` への Pantry 注入。本ユニットの画面は
  Unit C の実装に影響しない（読み取り専用の一覧・単純な消費/廃棄のみ）。
