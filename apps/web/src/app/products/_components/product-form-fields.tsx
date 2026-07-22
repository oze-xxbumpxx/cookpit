'use client';

import { Input } from '@/components/ui/input';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { productCategorySchema, unitSchema, type CreateProductBody } from '@cookpit/api-contract';
import { useId } from 'react';

export type ProductCategory = CreateProductBody['category'];
export type ProductUnit = CreateProductBody['defaultUnit'];

export interface ProductFormValue {
  name: string;
  aliasesText: string;
  category: ProductCategory;
  defaultUnit: ProductUnit;
}

export interface ProductFieldErrors {
  name: string | null;
}

interface ProductFormBuildResult {
  input: CreateProductBody | null;
  errors: ProductFieldErrors;
}

interface Props {
  value: ProductFormValue;
  fieldErrors: ProductFieldErrors;
  onChange: (value: ProductFormValue) => void;
  /** 新規作成時に商品名へ自動フォーカスする（連続入力を速める）。 */
  autoFocusName?: boolean;
}

export const PRODUCT_CATEGORY_OPTIONS = productCategorySchema.options;
export const UNIT_OPTIONS = unitSchema.options;

const PRODUCT_CATEGORY_SELECT_OPTIONS: SelectFieldOption[] = PRODUCT_CATEGORY_OPTIONS.map(
  (category) => ({
    value: category,
    label: category,
  }),
);
const UNIT_SELECT_OPTIONS: SelectFieldOption[] = UNIT_OPTIONS.map((unit) => ({
  value: unit,
  label: unit,
}));

export function toProductCategory(value: string): ProductCategory {
  return PRODUCT_CATEGORY_OPTIONS.find((option) => option === value) ?? 'その他';
}

export function toProductUnit(value: string): ProductUnit {
  return UNIT_OPTIONS.find((option) => option === value) ?? '個';
}

export function emptyProductFieldErrors(): ProductFieldErrors {
  return {
    name: null,
  };
}

export function createInitialProductFormValue(): ProductFormValue {
  return {
    name: '',
    aliasesText: '',
    category: PRODUCT_CATEGORY_OPTIONS[0],
    defaultUnit: UNIT_OPTIONS[0],
  };
}

export function buildProductFormBody(value: ProductFormValue): ProductFormBuildResult {
  const errors = emptyProductFieldErrors();
  const name = value.name.trim();

  if (name === '') {
    errors.name = '商品名を入力してください。';
  }

  if (errors.name !== null) {
    return {
      input: null,
      errors,
    };
  }

  return {
    input: {
      name,
      aliases: value.aliasesText
        .split(',')
        .map((alias) => alias.trim())
        .filter((alias) => alias !== ''),
      category: value.category,
      defaultUnit: value.defaultUnit,
    },
    errors,
  };
}

export function ProductFormFields({ value, fieldErrors, onChange, autoFocusName = false }: Props) {
  const nameId = useId();
  const aliasesId = useId();
  const categoryId = useId();
  const defaultUnitId = useId();
  const nameErrorId = useId();

  function updateValue(next: Partial<ProductFormValue>): void {
    onChange({
      ...value,
      ...next,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium text-foreground">
          商品名 <span className="text-xs font-normal text-destructive">必須</span>
        </label>
        <Input
          id={nameId}
          value={value.name}
          onChange={(event) => updateValue({ name: event.currentTarget.value })}
          placeholder="例：玉ねぎ"
          autoFocus={autoFocusName}
          aria-invalid={fieldErrors.name !== null}
          aria-describedby={fieldErrors.name === null ? undefined : nameErrorId}
          className="h-11 rounded-xl bg-card"
        />
        {fieldErrors.name !== null && (
          <p id={nameErrorId} className="text-xs text-destructive">
            {fieldErrors.name}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor={aliasesId} className="text-sm font-medium text-foreground">
          別名 <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <Input
          id={aliasesId}
          value={value.aliasesText}
          onChange={(event) => updateValue({ aliasesText: event.currentTarget.value })}
          placeholder="例：玉葱, タマネギ"
          className="h-11 rounded-xl bg-card"
        />
        <p className="text-xs text-muted-foreground">複数ある場合はカンマで区切ります。</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={categoryId} className="text-sm font-medium text-foreground">
            カテゴリ
          </label>
          <SelectField
            id={categoryId}
            value={value.category}
            onValueChange={(nextValue) => updateValue({ category: toProductCategory(nextValue) })}
            options={PRODUCT_CATEGORY_SELECT_OPTIONS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={defaultUnitId} className="text-sm font-medium text-foreground">
            基本単位
          </label>
          <SelectField
            id={defaultUnitId}
            value={value.defaultUnit}
            onValueChange={(nextValue) => updateValue({ defaultUnit: toProductUnit(nextValue) })}
            options={UNIT_SELECT_OPTIONS}
          />
        </div>
      </section>
    </div>
  );
}
