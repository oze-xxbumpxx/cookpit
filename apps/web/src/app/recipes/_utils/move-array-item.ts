/**
 * `from` の要素を `to` の位置へ移動した新しい配列を返す。元の配列は変更しない。
 *
 * 範囲外の index や `from === to` のときは、元と同じ内容の新しい配列を返す（呼び出し側で
 * 境界をガードしなくても安全に呼べる）。
 */
export function moveArrayItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
}
