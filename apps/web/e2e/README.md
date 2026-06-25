# E2E スモークテスト（Playwright）

レシピ CRUD のハッピーパス（一覧 → 作成 → 詳細 → 編集 → 削除）を1本だけ自動化した
**critical-path スモーク**。回帰の「アプリが丸ごと壊れた」を安く検知するための型。

## 方針（なぜ薄いか）

- 個人開発・2人利用のため、E2E は網羅せず**ハッピーパス1本**に絞る。維持コストを最小化する。
- ビジネスロジックは domain / application の Vitest 単体テストで担保済み。E2E は
  Presentation の配線（フォーム・Hono RPC・Server Component）が通ることだけを見る。
- 追加観点が必要になったら（Sprint 3〜4 で画面が増える頃）ここに足す。

## 実行（ローカル）

アプリ起動 + DB が必要なため、**手元の開発環境で**実行する。

```bash
# 前提: apps/web/.env に DATABASE_URL（Neon）が設定済み
pnpm --filter @cookpit/web e2e        # ヘッドレス実行
pnpm --filter @cookpit/web e2e:ui     # UI モード（デバッグ向け）
```

- `playwright.config.ts` の `webServer` が未起動なら `pnpm dev` を自動起動する
  （既に `pnpm dev` 起動済みならそれを再利用）。
- 別ポートや起動済みアプリに当てる場合は `E2E_BASE_URL` で上書き：
  `E2E_BASE_URL=http://localhost:3001 pnpm --filter @cookpit/web e2e`

## ブラウザのプリインストール環境（CI / リモート）

Chromium がプリインストールされた環境では `playwright install` は不要。実体パスを
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` で渡すと、その実体を使う：

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm --filter @cookpit/web e2e
```

未設定ならローカルの Playwright が自前で用意したブラウザを使う（通常はこちら）。

## 注意

- このリポジトリのリモート実行環境では DB（Neon）へ到達できないため、CRUD スモークの
  **緑判定はローカル限定**。ツール（Playwright + Chromium）自体は環境にプリインストール
  済みで動作する。
- セレクタは実 UI（`recipe-form-client` / `recipe-detail-client` / `recipe-list-client` /
  `recipe-edit-form-client`）に合わせている。UI のラベル・aria を変えたら追従させる。
