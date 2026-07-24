'use client';

import { Input } from '@/components/ui/input';
import { UNIT_PRESETS } from '@cookpit/api-contract';

interface UnitFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 単位の入力欄。自由記述を許容しつつ、プリセット単位を datalist の候補として提示する（項目3）。
 * datalist の id は入力 id ごとに一意にし、同一画面に複数配置しても衝突しないようにする。
 */
export function UnitField({
  id,
  value,
  onValueChange,
  placeholder = '例：個',
  className = 'h-11 rounded-xl bg-background',
}: UnitFieldProps) {
  const listId = `${id}-unit-presets`;
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {UNIT_PRESETS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </>
  );
}
