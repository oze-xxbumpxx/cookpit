import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MoreMenu } from '../../../../src/app/more/_components/more-menu';

describe('MoreMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('MM-01: レシピへのリンクを表示する', () => {
    render(<MoreMenu />);

    expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
  });

  it('MM-02: 商品へのリンクを表示する', () => {
    render(<MoreMenu />);

    expect(screen.getByRole('link', { name: '商品' }).getAttribute('href')).toBe('/products');
  });

  it('MM-03: リンクはちょうど 2 件（過不足なし）', () => {
    render(<MoreMenu />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
