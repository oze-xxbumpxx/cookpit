import { describe, expect, it } from 'vitest';
import { ProductId } from '../../src/product/product-id';
import { Quantity } from '../../src/shared/quantity';
import { StoreId } from '../../src/shared/store';
import { RecipeIngredient } from '../../src/recipe/recipe-ingredient';

describe('RecipeIngredient.create', () => {
  it('amount のみで生成できる (I1)', () => {
    const ingredient = RecipeIngredient.create({
      productRef: null,
      displayName: '玉ねぎ',
      amount: Quantity.of(100, 'g'),
      amountNote: null,
    });
    expect(ingredient.displayName).toBe('玉ねぎ');
    expect(ingredient.amount?.value).toBe(100);
    expect(ingredient.amountNote).toBeNull();
  });

  it('amountNote のみで生成できる (I2)', () => {
    const ingredient = RecipeIngredient.create({
      productRef: null,
      displayName: '塩',
      amount: null,
      amountNote: '適量',
    });
    expect(ingredient.amount).toBeNull();
    expect(ingredient.amountNote).toBe('適量');
  });

  it('displayName が空白なら拒否する (I3)', () => {
    expect(() =>
      RecipeIngredient.create({
        productRef: null,
        displayName: '  ',
        amount: Quantity.of(1, 'g'),
        amountNote: null,
      }),
    ).toThrow('Display name is required');
  });

  it('amount も amountNote も無ければ拒否する (I4)', () => {
    expect(() =>
      RecipeIngredient.create({
        productRef: null,
        displayName: '砂糖',
        amount: null,
        amountNote: null,
      }),
    ).toThrow('Either amount or amountNote is required');
  });

  it('amount と amountNote の両方設定は拒否する (I5)', () => {
    expect(() =>
      RecipeIngredient.create({
        productRef: null,
        displayName: '砂糖',
        amount: Quantity.of(10, 'g'),
        amountNote: '適量',
      }),
    ).toThrow('amount and amountNote cannot both be set');
  });

  it('amountNote が空白のみは未設定扱いで拒否する (I6)', () => {
    expect(() =>
      RecipeIngredient.create({
        productRef: null,
        displayName: '砂糖',
        amount: null,
        amountNote: '  ',
      }),
    ).toThrow('Either amount or amountNote is required');
  });

  it('amountNote が空文字は未設定扱いで拒否する (I-GAP-2)', () => {
    expect(() =>
      RecipeIngredient.create({
        productRef: null,
        displayName: '砂糖',
        amount: null,
        amountNote: '',
      }),
    ).toThrow('Either amount or amountNote is required');
  });

  it('productRef が非 null のとき値を保持する (I-GAP-3)', () => {
    const ingredient = RecipeIngredient.create({
      productRef: ProductId.fromString('prod-1'),
      displayName: '玉ねぎ',
      amount: Quantity.of(100, 'g'),
      amountNote: null,
    });
    expect(ingredient.productRef?.value).toBe('prod-1');
  });

  // 型の回帰テスト。@ts-expect-error は「エラーが出ないこと」を型チェックの失敗として
  // 検出するため、productRef が構造的型へ戻ると pnpm type-check が落ちる。
  it('別集約の ID は productRef に渡せない (I-GAP-4)', () => {
    const ingredient = RecipeIngredient.create({
      // @ts-expect-error StoreId は ProductId ではない（集約をまたぐ ID の混同を型で防ぐ）
      productRef: StoreId.generate(),
      displayName: '玉ねぎ',
      amount: Quantity.of(100, 'g'),
      amountNote: null,
    });
    expect(ingredient.displayName).toBe('玉ねぎ');
  });
});

describe('RecipeIngredient.scale', () => {
  it('amount があればスケールし amountNote を null 化する (I7)', () => {
    const scaled = RecipeIngredient.create({
      productRef: null,
      displayName: '玉ねぎ',
      amount: Quantity.of(100, 'g'),
      amountNote: null,
    }).scale(2);
    expect(scaled.amount?.value).toBe(200);
    expect(scaled.amountNote).toBeNull();
  });

  it('amount が null なら自身を返す (I8)', () => {
    const original = RecipeIngredient.create({
      productRef: null,
      displayName: '塩',
      amount: null,
      amountNote: '適量',
    });
    const scaled = original.scale(2);
    expect(scaled).toBe(original);
    expect(scaled.amountNote).toBe('適量');
  });

  it('scale 後も productRef が引き継がれる (I-GAP-1)', () => {
    const ingredient = RecipeIngredient.create({
      productRef: ProductId.fromString('prod-1'),
      displayName: '玉ねぎ',
      amount: Quantity.of(100, 'g'),
      amountNote: null,
    });
    const scaled = ingredient.scale(3);
    expect(scaled.productRef?.value).toBe('prod-1');
    expect(scaled.displayName).toBe('玉ねぎ');
    expect(scaled.amount?.value).toBe(300);
  });
});
