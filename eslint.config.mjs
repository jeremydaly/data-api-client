import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['coverage/**', 'node_modules/**', 'test/**', 'dist/**', '**/*.test.js', '**/*.test.ts', 'vitest.config.mjs']
  },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        expect: 'readonly',
        it: 'readonly'
      }
    },
    rules: {
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single', { allowTemplateLiterals: true }],
      semi: ['error', 'never']
    }
  },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({ ...config, files: ['**/*.ts'] })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json'
      }
    },
    rules: {
      ...prettier.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
]
