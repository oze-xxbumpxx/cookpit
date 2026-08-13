# 試験計画: uow

- 前提となる設計書: docs/designs/uow.md
- レベル: L3

## 試験種別

- Domain: インターフェースのみ → 単体テストなし
- Infrastructure: PGlite 結合（COMMIT / ROLLBACK / 複数 Repository / ネスト）
- Application: 既存 UseCase テストを passthrough UoW で回帰。新規の振る舞いテストは Infrastructure に置く（モックでは ROLLBACK を検証できない）
- Presentation: 契約不変のため新規ルート試験なし。既存 Hono テストが組み立て変更で通ること

## 単体試験観点

| #   | 観点            | 前提               | 操作                               | 期待結果                      | 分類      |
| --- | --------------- | ------------------ | ---------------------------------- | ----------------------------- | --------- |
| U-1 | passthrough UoW | Application テスト | `execute(work)` が `work()` を呼ぶ | 既存 UseCase テストが全て通る | 正常/回帰 |
| U-2 | ネスト拒否      | UoW の execute 中  | 再度 execute                       | throw                         | 異常      |

Application 層に UoW のモック検証を足さない。包みは構造的で、原子性の証拠は PGlite 側。

## 結合試験観点

| #   | 観点                | 前提                     | 操作                                                                          | 期待結果                               | 分類 |
| --- | ------------------- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------- | ---- |
| I-1 | COMMIT              | PGlite + 2 Repository    | execute 内で ShoppingList と別テーブル（または同一リストの save）を成功させる | 両方残る                               | 正常 |
| I-2 | ROLLBACK 単一集約   | PGlite                   | execute 内で save 相当の複文の途中相当として、書き込み後に throw              | 書き込みが残らない                     | 異常 |
| I-3 | ROLLBACK 集約横断   | PGlite                   | ShoppingList.save の後、2 本目の前に throw（要件 E-1）                        | リストも残らない                       | 異常 |
| I-4 | execute 外の client | UoW を execute せず save | 通常の Repository.save                                                        | 現行どおり永続化される（自動コミット） | 境界 |
| I-5 | ネスト              | execute 内から execute   | —                                                                             | throw（E-4）                           | 異常 |
| I-6 | ドメイン例外        | execute 内で throw       | NotFound 相当の Error                                                         | ROLLBACK。例外は呼び出し元へ伝播       | 異常 |
| I-7 | 並行 execute        | 1 本目が未完了           | 同じ UoW で 2 本目を開始                                                      | throw（E-4。busy フラグ）              | 異常 |

配置: `packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts`

## 特性観点

- 権限: 対象外（認証なし）
- データ整合性: I-2 / I-3 が本ユニットの完了条件
- 冪等性: 既存 UseCase の冪等は回帰（U-1）。トランザクション導入で冪等分岐は変えない
- 障害系: 新規の外部 API なし。対象外（Web Push は本ユニットで包まない）
- フロントエンド: 対象外（画面変更なし）
- 防御性: Domain Entity 変更なし。対象外。UoW のネスト拒否は I-5

## メソッド網羅チェック表

| クラス             | メソッド         | 対応する試験観点 No                                                   |
| ------------------ | ---------------- | --------------------------------------------------------------------- |
| UnitOfWork（IF）   | execute          | I-1, I-2, I-3, I-5, U-2                                               |
| DrizzleUnitOfWork  | client（getter） | I-1, I-4                                                              |
| DrizzleUnitOfWork  | execute          | I-1〜I-7, U-2                                                         |
| createDb           | （factory）      | 型と既存 Repository テストの回帰。単独試験はしない（PGlite 経路が主） |
| createWriteContext | （factory）      | web の既存ルートテスト回帰                                            |

## 回帰試験範囲

- 全 Drizzle Repository テスト（コンストラクタ変更）
- 全書き込み UseCase の Application テスト（引数追加）
- 既存 Hono ルートテスト
- Get* UseCase（引数を変えないこと）

## 試験データ

PGlite の既存 DDL（`create-test-db.ts`）。ShoppingList 1 件 + 品目 1 件を最小フィクスチャにする。

## 完了条件

- I-1〜I-7 が PGlite で PASS
- 既存 application / infrastructure / web テストが PASS
- 要件 N/E/B のうちコードで担保するものが上表に対応している。N-5（読み取りが tx を開始しない）はコードレビュー（Get* に UoW を足していないこと）
- FR-7（SendExpiryAlerts を包まない）はコードレビュー

## 対象外（理由）

- 真の同時実行レース（2 プロセス）: 既存試験計画（shopping-list-core 等）と同じく対象外。2 名利用の低頻度
- 本番 Neon での transaction 実測: CI は PGlite。ドライバ API の差は型と公式ドキュメントで担保
- E2E: 契約不変。任意
