import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    // any 型の使用禁止（docs/07-dev-rules.md）
    '@typescript-eslint/no-explicit-any': 'error',

    // import type の強制（型だけのインポートは import type にする）
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

    // 未使用変数をエラーにする（_ プレフィックスは除外）
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // === / !== の強制（== / != は禁止）（docs/07-dev-rules.md）
    eqeqeq: ['error', 'always'],

    // Non-null assertion（!）の使用を警告（ドメイン層では原則使わない）
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // console.log の残置を警告（開発中は許容するが気づけるようにする）
    'no-console': 'warn',
  },
});
