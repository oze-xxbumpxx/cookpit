# 設計書: meal-plan-week-selection（献立の週選択）

- ステータス: 確定（ユーザー確定・2026-07-24。「週を選べる」方針）
- レベル: L2
- 関連: `docs/designs/meal-plan-core.md` / `meal-plan-screens.md`（週モデル・画面パターンの正典）、
  `packages/domain/src/shared/week-identifier.ts`（週 = 土曜開始の不変条件）、
  `.claude/rules/presentation-layer.md`、改善要望 項目2（`logs/2026-07-23.md` セッション2）
- 要件入力: ユーザー改善要望「買い物リスト・献立の期間指定」（項目2）。
  AskUserQuestion で「週を選べる（週単位の選択・スキーマ変更なし）」に確定（2026-07-24）。

---

## 背景

現状、献立画面（`/meal-plans`）は「今週」固定。作成ボタンは常に `currentWeekIdentifier` を送り
（`meal-plan-client.tsx:47`）、表示も `GetCurrentMealPlanUseCase`（現在週）のみ（`page.tsx:15`）。
来週分を先に計画する・過去週を見返す導線が無い。ドメイン（`CreateMealPlanUseCase`）は既に任意の
`weekIdentifier` を受け付けられるため、不足しているのは **UI の週選択導線**と**指定週の取得**だけ。

## 目的

献立画面で表示・作成対象の週を選べるようにする（前の週 / 次の週へのナビゲーション）。買い物リストは
従来どおり「選択中の週の献立」から生成する（生成ロジック変更なし）。

## 設計判断（D-x：先例準拠で確定）

| #   | 判断                                                                                                                                 | 理由                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 週モデル（`WeekIdentifier`・土曜開始）は変更しない。日付範囲モデル化はしない                                                         | ユーザー確定の「週を選べる」方針。スキーマ・ドメイン変更ゼロで実現可能                                                                                |
| D-2 | 選択中の週は URL クエリ `?week=YYYY-MM-DD` で表現し、Server Component が読む                                                         | 初期表示は A: Server Component 直呼び（presentation-layer.md）。共有・リロードで状態が保たれ、`?limit=` 履歴ページと同じ searchParams パターン        |
| D-3 | 指定週の取得は `GetMealPlanByWeekUseCase`（新設）。`findByWeek` を使う                                                               | `GetCurrentMealPlanUseCase(asOf)` の流用も可能だが名称が誤解を招くため専用 UseCase を新設（1 UseCase = 1 クラスの規約）                               |
| D-4 | 不正・未指定の `?week=` は現在週にフォールバック。任意日付は `WeekIdentifier` が土曜へスナップ                                       | 既存の `fromString` スナップ不変条件を活かし、壊れた入力で 500 にしない                                                                               |
| D-5 | 週ナビ UI は「前の週 ←／週ラベル／→ 次の週」。選択週が現在週なら「今週」表記                                                         | 最小の操作系。prev/next の週識別子は Server Component で `WeekIdentifier.previous()/next()` から算出し文字列で渡す（Client に Domain を持ち込まない） |
| D-6 | 作成・空状態の文言は選択週で出し分け（現在週=「今週の献立(を作る)」／他週=「この週の献立(を作る)」「{範囲}の献立はまだありません」） | 選択週が今週以外でも自然な文言にする                                                                                                                  |
| D-7 | `MealPlanClient` の新規 props（selected/previous/next WeekIdentifier）は任意。未指定時は現在週選択として従来どおり動く               | 既存テスト・呼び出しの後方互換。週ナビは prev/next が揃ったときのみ描画                                                                               |

## 対象範囲

- Application: `GetMealPlanByWeekUseCase` 新設（+ export・テスト）。
- Presentation: `meal-plans/page.tsx`（searchParams.week 解決・prev/next 算出・指定週取得）、
  `meal-plan-client.tsx`（週ナビ UI・選択週での作成・文言出し分け）。

## 対象外

- 週モデルの日付範囲化（L3・ユーザー非選択）。
- 買い物リスト生成ロジックの変更（選択週の献立からの生成は現状のまま）。
- 週をまたぐ買い物リストの集約（項目2 の別解釈・非採用）。
- DB スキーマ・API 契約（`meal-plan.schema.ts`）の変更（`CreateMealPlanUseCase` は既存の
  `weekIdentifier` 入力をそのまま使う）。

## バックエンド設計（Application）

`GetMealPlanByWeekUseCase.execute(weekIdentifier: string): Promise<MealPlanDto | null>`
= `WeekIdentifier.fromString(weekIdentifier)` → `findByWeek` → `toMealPlanDto`（無ければ null）。
`GetCurrentMealPlanUseCase` と同型。Domain / Infrastructure / 契約は変更なし。

## フロントエンド設計

### `meal-plans/page.tsx`

- `searchParams: Promise<{ week?: string }>` を受け、`week` を検証して選択週 `WeekIdentifier` を決定
  （形式不正・無効日付は `WeekIdentifier.current()`）。
- `selected/previous/next/current` の識別子文字列を算出。`GetMealPlanByWeekUseCase(selected)` で取得。
- `MealPlanClient` に `mealPlan / recipes / currentWeekIdentifier / selectedWeekIdentifier /
previousWeekIdentifier / nextWeekIdentifier` を渡す。

### `meal-plan-client.tsx`

- 新規任意 props（selected/previous/next）。`selectedWeekIdentifier` 未指定時は `currentWeekIdentifier`。
- ヘッダー: h1「献立」＋「履歴」リンク。その下に週ナビ（prev/next が揃うときのみ）:
  `Link href="/meal-plans?week={previous}"`（← 前の週）／ 週ラベル（今週 or `formatWeekRange`）／
  `Link href="/meal-plans?week={next}"`（次の週 →）。
- `handleCreate` は `selectedWeekIdentifier` を送る。空状態メッセージ・作成/作成中ボタン文言を
  現在週かどうかで出し分け（D-6）。

## テスト方針

- Application: `meal-plan-use-cases.test.ts` に `GetMealPlanByWeekUseCase`（該当週あり/なし）。
- Component: `meal-plan-client.test.tsx` に週ナビ（prev/next リンクの href・選択週での作成 POST・
  他週の空状態文言）を追加。既存テストは props 後方互換により原則そのまま緑。
- 実画面: `manual-browser-verify`（週送り・作成・買い物リスト生成の一連）。

## リスク

| #   | リスク                                            | 対策                                                                                          |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| R-1 | 既存 `meal-plan-client` テストの回帰              | 新 props を任意化し selected 未指定=現在週で従来挙動を保持。週ナビは prev/next 揃い時のみ描画 |
| R-2 | 不正な `?week=` で 500                            | D-4 のフォールバック（形式・日付妥当性チェック→現在週）                                       |
| R-3 | 週をまたいで作成した過去/未来週の献立が履歴と混在 | `findByWeek` は週一意（既存不変条件）。作成は既存の冪等（同週は既存を返す）で二重作成なし     |
