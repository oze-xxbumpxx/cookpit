import { cleanup, render, screen } from '@testing-library/react';
import { ChefHat } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('メッセージを表示する', () => {
    render(<EmptyState Icon={ChefHat} message="まだレシピがありません" />);

    expect(screen.getByText('まだレシピがありません')).toBeDefined();
  });
});
