# candidates/archive

対応済み（accepted / 採否反映済み）の改善候補を移す場所。
正典の移動基準は [../../memory-policy.md](../../memory-policy.md) §candidate のアーカイブ。

## 移してよい条件（すべて満たす）

1. 紐づく IMP が `accepted` または `rejected` で決着している
2. backlog の当該行ステータスが candidate のまま残っていない（更新済み）
3. 未解決の再発監視事項が candidate 本文に残っていない（残すなら Memory 留めを backlog へ）

## 移さないもの

- 採否待ち・提案止まりの候補
- 進行中 feature の振り返り候補
