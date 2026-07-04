export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 件名は日本語 + ID 引用（IMP-2026-013 等）が慣例のため大文字小文字は強制しない
    'subject-case': [0],
  },
};
