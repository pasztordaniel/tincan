// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/.angular/',
      '**/coverage/',
      'e2e/playwright-report/',
      'e2e/test-results/',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // A leading underscore marks a parameter that must exist for its position or arity
      // (e.g. Express recognises error handlers by their four parameters).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'e2e/**/*.ts', '*.js', 'client/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Type-aware rules: each file is checked against the tsconfig of its own workspace.
    files: ['{client,server,shared,e2e}/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // An un-awaited promise in socket or crypto code silently drops errors and reorders frames.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['client/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { globals: globals.browser },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },
  {
    files: ['client/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
);
