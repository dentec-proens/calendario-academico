import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const functions = {
  selector: [
    'FunctionDeclaration',
    'ExportNamedDeclaration[declaration.type="FunctionDeclaration"]',
    'ExportDefaultDeclaration[declaration.type="FunctionDeclaration"]',
    'VariableDeclaration:has(> VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression))',
    'ExportNamedDeclaration:has(> VariableDeclaration > VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression))',
  ].join(', '),
};

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'data/**',
    'uploads/**',
    'coverage/**',
    '.vercel/**',
    'supabase/.temp/**',
    'backup-*/**',
  ]),
  {
    files: ['**/*.{js,mjs,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@stylistic': stylistic },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: '*', next: functions },
        { blankLine: 'always', prev: functions, next: '*' },
      ],
    },
  },
  {
    files: ['server.mjs', '*.config.mjs', 'src/**/*.mjs', 'scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{js,mjs,jsx}', 'test/**/*browser*.test.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['web/portal/**/*.{js,jsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]);
