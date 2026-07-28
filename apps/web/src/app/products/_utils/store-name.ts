/**
 * 店舗の登録上限（ADR-0013）。サーバー側の権威は `@cookpit/application` の `STORE_LIMIT`。
 *
 * UI 側に複製がある理由: `@cookpit/application` / `@cookpit/domain` は `StoreId.generate()` が
 * `node:crypto` の `randomUUID` を使うため、クライアントコンポーネントから値として import すると
 * `node:crypto` がブラウザバンドルへ混入する。`store-name.node.test.ts` が本ファイルと
 * サーバー側実装の一致を機械的に固定しているので、片方だけ変えるとテストが落ちる。
 */
export const STORE_LIMIT = 3;

/**
 * 店舗名の比較用正規化（前後空白除去 + NFKC）。同名の事前警告にだけ使う。
 * 権威は Domain の `normalizeStoreName`（複製の理由は `STORE_LIMIT` と同じ）。
 *
 * この関数はあくまで UI のヒントであり、登録の可否を決めるのはサーバーである。
 */
export function normalizeStoreName(name: string): string {
  return name.trim().normalize('NFKC');
}

/** 入力名が既存店舗（表記ゆれを含む）と衝突するかを返す。 */
export function isDuplicateStoreName(name: string, existingNames: string[]): boolean {
  const normalized = normalizeStoreName(name);
  if (normalized === '') {
    return false;
  }
  return existingNames.some((existing) => normalizeStoreName(existing) === normalized);
}
