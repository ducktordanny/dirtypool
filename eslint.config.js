import js from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.angular/**'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, ...tseslint.configs.stylistic],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'signature',
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-static-method',
            'protected-static-method',
            'private-static-method',
            'public-field',
            'protected-field',
            'private-field',
            'constructor',
            'public-method',
            'protected-method',
            'private-method',
          ],
        },
      ],
    },
  },
  {
    files: ['apps/ui/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'dp', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'dp', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['apps/ui/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
