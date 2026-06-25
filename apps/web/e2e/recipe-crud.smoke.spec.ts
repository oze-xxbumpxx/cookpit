import { test, expect } from '@playwright/test';

// レシピ CRUD のハッピーパス・スモーク（一覧 → 作成 → 詳細 → 編集 → 削除）。
// アプリ + DB が必要なため、原則ローカル（`pnpm e2e`）で実行する。
// セレクタは実 UI（recipe-form/detail/list/edit クライアント）に合わせている。
// 名前は実行ごとに一意化し、並列・再実行での衝突を避ける。
test('レシピを作成・編集・削除できる', async ({ page }) => {
  const name = `E2Eスモーク-${Date.now()}`;
  const editedName = `${name}-改`;

  // 一覧
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'レシピ' })).toBeVisible();

  // 作成画面へ
  await page.getByRole('link', { name: '追加' }).click();
  await expect(page.getByRole('heading', { name: 'レシピを追加' })).toBeVisible();

  // 入力して保存（保存後は一覧へ戻る）
  await page.getByPlaceholder('例：鶏むね肉の塩こうじ漬け').fill(name);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL(/\/recipes$/);

  // 一覧に表示された新規レシピを開く
  const card = page.getByRole('link', { name: `${name}の詳細を見る` });
  await expect(card).toBeVisible();
  await card.click();

  // 詳細（見出しがレシピ名）
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // 編集画面へ
  await page.getByRole('button', { name: '編集' }).click();
  await expect(page.getByRole('heading', { name: 'レシピを編集' })).toBeVisible();

  // 名前を変更して保存（保存後は詳細へ戻る）
  await page.getByPlaceholder('例：鶏むね肉の塩こうじ漬け').fill(editedName);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('heading', { name: editedName })).toBeVisible();

  // 削除（2段階の確認ダイアログ）
  await page.getByRole('button', { name: 'このレシピを削除' }).click();
  await expect(page.getByText('このレシピを削除しますか？')).toBeVisible();
  await page.getByRole('button', { name: '削除する' }).click();

  // 一覧へ戻り、削除済みレシピが消えている
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('link', { name: `${editedName}の詳細を見る` })).toHaveCount(0);
});
