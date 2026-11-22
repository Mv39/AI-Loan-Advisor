import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['error'] }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**', 'evals/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
  prettier,
);
