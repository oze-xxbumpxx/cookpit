'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  id: string;
  value: string;
  options: SelectFieldOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

export function SelectField({
  id,
  value,
  options,
  onValueChange,
  placeholder = '選択してください',
  disabled = false,
  invalid = false,
  describedBy,
  className,
}: SelectFieldProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;

  return (
    <Select.Root
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue ?? '')}
      disabled={disabled}
    >
      <Select.Trigger
        type="button"
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-sm text-foreground outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          className,
        )}
      >
        <Select.Value className={cn('min-w-0 truncate', value === '' && 'text-muted-foreground')}>
          {selectedLabel}
        </Select.Value>
        <Select.Icon className="flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-transform data-[open]:rotate-180">
          <ChevronDown className="size-4" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} align="start" collisionPadding={8} className="z-50">
          <Select.Popup className="max-h-[min(var(--available-height),16rem)] w-[var(--anchor-width)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-card p-1 text-sm text-card-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  label={option.label}
                  className={cn(
                    'grid min-h-10 cursor-default grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors',
                    'data-[highlighted]:bg-muted data-[selected]:bg-accent data-[selected]:text-accent-foreground',
                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  )}
                >
                  <Select.ItemIndicator
                    keepMounted
                    className="flex size-4 items-center justify-center text-transparent data-[selected]:text-primary"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="truncate">{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
