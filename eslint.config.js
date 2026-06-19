import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// 共用的「禁止語法」規則：禁用 any / unknown 型別。
const restrictedSyntaxBase = [
  {
    selector: 'TSAnyKeyword',
    message: '禁止使用 any 型別，請給出明確型別。',
  },
  {
    selector: 'TSUnknownKeyword',
    message: '禁止使用 unknown 型別，請給出明確型別。',
  },
];

// private static method 視為 code smell，應抽成物件的 instance method 透過實例呼叫。
const noPrivateStaticMethod = {
  selector: 'MethodDefinition[static=true][accessibility="private"]',
  message: '嚴禁 private static method；請抽成對應物件的 instance method，透過實例呼叫。',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '**/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // 禁止「先宣告後賦值」：變數必須在宣告當下即賦值。
      'init-declarations': 'off',
      '@typescript-eslint/init-declarations': ['error', 'always'],
      'no-restricted-syntax': ['error', ...restrictedSyntaxBase, noPrivateStaticMethod],
    },
  },
  {
    // 單元測試：放寬 private static method 限制（規範明定測試除外）。
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntaxBase],
    },
  },
  prettier,
);
