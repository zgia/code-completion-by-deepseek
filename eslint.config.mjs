import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from '@typescript-eslint/eslint-plugin';
import unusedImports from 'eslint-plugin-unused-imports';

const tsFiles = ['src/**/*.{ts,tsx}'];
const unusedVariables = { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' };

export default [
  { ignores: ['**/*.d.ts', 'out/**', 'dist/**', 'node_modules/**'] },
  ...tseslint.configs['flat/recommended'].map(config => ({ ...config, files: tsFiles })),
  {
    files: tsFiles,
    plugins: { 'unused-imports': unusedImports },
    rules: {
      // TypeScript checks global names using types and tsconfig's lib.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', unusedVariables],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      // Node's Web APIs used in tests; CommonJS mode supplies require/module.
      globals: {
        AbortController: 'readonly',
        fetch: 'readonly',
        ReadableStream: 'readonly',
        Response: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', unusedVariables],
    },
  },
  { files: ['eslint.config.mjs'], rules: js.configs.recommended.rules },
  {
    files: [...tsFiles, 'test/**/*.js', 'eslint.config.mjs'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
    },
  },
];
