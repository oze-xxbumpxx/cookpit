import { describe, expect, it } from 'vitest';
import { MEAL_PLAN_STATUS_LABELS } from '../../../src/app/_utils/dashboard-view';

describe('MEAL_PLAN_STATUS_LABELS', () => {
  it('全ステータスに日本語ラベルがある', () => {
    expect(MEAL_PLAN_STATUS_LABELS.draft).toBe('献立作成中');
    expect(MEAL_PLAN_STATUS_LABELS.shopping).toBe('買い物中');
    expect(MEAL_PLAN_STATUS_LABELS.cooking).toBe('調理中');
    expect(MEAL_PLAN_STATUS_LABELS.consuming).toBe('消費中');
    expect(MEAL_PLAN_STATUS_LABELS.completed).toBe('完了');
  });
});
