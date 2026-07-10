# Codex Implementation Tasks — product-master

Sprint 2 の product-master 機能を Codex に委譲するための実装指示書。
機能単位で分割しており、**番号順に実行する**（依存順）。

## タスク一覧

| #   | ファイル                                       | 対象層             | 概要                                                                 |
| --- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| 1   | [01-domain.md](./01-domain.md)                 | Domain             | Money / Store / Product / PriceRecord / UnitPriceCalculator + テスト |
| 2   | [02-infrastructure.md](./02-infrastructure.md) | Infrastructure     | DB スキーマ / Drizzle Repository / マイグレーション / シード         |
| 3   | [03-application.md](./03-application.md)       | Application        | DTO / Mapper / Error / UseCase 8本 + テスト                          |
| 4   | [04-api.md](./04-api.md)                       | Presentation (API) | Zod スキーマ / Hono ルート / app.ts 統合                             |
| 5   | [05-frontend.md](./05-frontend.md)             | Presentation (UI)  | 商品一覧・作成・詳細・編集の4画面                                    |

## 未決事項（設計推奨案で確定済み）

以下は実装計画の推奨案を**確定値**として扱う。

| ID  | 確定内容                                                        |
| --- | --------------------------------------------------------------- |
| U1  | unitPrice 丸め: 小数点以下1桁 + `Math.round` + `numeric(10, 1)` |
| U7  | price_records は独立テーブル（案B）、Repository が JOIN 復元    |
| U3  | DeleteProduct: 存在しなければ `ProductNotFoundError` を throw   |
| U5  | 価格記録の重複許可。最新 = 最大 `observedAt`。UUID PK           |
| C1  | RecordPrice 成功レスポンス: 200 空ボディ                        |
| C2  | cheapest-store の null 表現: `{ "data": null }`                 |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（Domain + Application 新規テスト含む）
```

## 参照ドキュメント

- 設計書: `docs/designs/product-master.md`
- API 契約: `docs/designs/product-master-contract.md`
- 実装計画: `docs/implementation-plans/product-master.md`
- 試験計画: `docs/tests/product-master.md`
- 要件定義: `docs/requirements/product-master.md`
