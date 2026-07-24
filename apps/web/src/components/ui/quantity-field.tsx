'use client';

import { Input } from '@/components/ui/input';

interface QuantityFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * 数量と単位を 1 欄にまとめた入力欄（要望2）。「3個」「300g」のように入力し、
 * 送信時に `parseQuantity` で数値と単位へ分解する。分けての入力の手間を無くす狙い。
 */
export function QuantityField({
  id,
  value,
  onValueChange,
  placeholder = '例：3個 / 300g',
  className = 'h-11 rounded-xl bg-background',
  invalid = false,
  describedBy,
}: QuantityFieldProps) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      placeholder={placeholder}
      inputMode="text"
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={className}
    />
  );
}
