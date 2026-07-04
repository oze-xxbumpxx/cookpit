# Sprint 1：Lint / Format 環境セットアップ 実装指針

実装後は必ず Claude Code でレビューを受けること。

---

## 事前確認

- `docs/07-dev-rules.md`（コーディング規約）
- `AGENTS.md`（基本姿勢）

---

## タスク概要

以下の2つを導入する。

1. **Prettier**：コードフォーマット統一（ルート共通設定）
2. **ESLint**：TypeScript の静的解析（共通設定を `packages/config/eslint/` に置き、各パッケージから参照）

現状、`apps/web` には ESLint が設定済み。今回は `packages/domain` など `packages/` 配下にも適用できる共通基盤を作る。

---

## 変更・作成ファイル一覧

```
cookpit/
├── .prettierrc                        # 新規作成
├── .prettierignore                    # 新規作成
├── packages/
│   └── config/
│       ├── package.json               # 更新（ESLint 設定のエクスポートを追加）
│       └── eslint/
│           └── base.mjs               # 新規作成（TypeScript 用共通 ESLint 設定）
└── packages/domain/
    ├── package.json                   # 更新（lint スクリプト・devDependencies 追加）
    └── eslint.config.mjs              # 新規作成
```

---

## 1. Prettier 設定

### `.prettierrc`（ルート直下に作成）

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

### `.prettierignore`（ルート直下に作成）

```
node_modules
.next
dist
.turbo
pnpm-lock.yaml
```

---

## 2. ESLint 共通設定

### `packages/config/eslint/base.mjs`（新規作成）

TypeScript プロジェクト向けの共通 ESLint フラット設定。

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});
```

### `packages/config/package.json`（更新）

`exports` に ESLint 設定のパスを追加する。

```json
{
  "name": "@cookpit/config",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./typescript/*": "./typescript/*.json",
    "./eslint/*": "./eslint/*.mjs"
  },
  "devDependencies": {
    "typescript-eslint": "^8.0.0"
  }
}
```

---

## 3. `packages/domain` への ESLint 適用

### `packages/domain/eslint.config.mjs`（新規作成）

```js
import baseConfig from '@cookpit/config/eslint/base.mjs';

export default baseConfig;
```

### `packages/domain/package.json`（更新）

`scripts` に `lint` を追加し、`devDependencies` に ESLint 関連パッケージを追加する。

```json
{
  "name": "@cookpit/domain",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@cookpit/config": "workspace:*",
    "eslint": "^9.0.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.0.0"
  }
}
```

---

## 4. 実装後の動作確認

ルートで以下を実行してエラーがないことを確認する。

```bash
# フォーマット確認（変更なければOK）
pnpm format --check

# Lint 確認（packages/domain）
pnpm --filter @cookpit/domain lint

# 型チェック（packages/domain）
pnpm --filter @cookpit/domain type-check
```

---

## 注意事項

- `apps/web` の `eslint.config.mjs` は既存のまま変更しない
- `turbo.json` の `lint` タスクはすでに定義済みのため変更不要
- `typescript-eslint` のバージョンは ESLint 9（フラット設定）対応の v8 系を使う
