import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'src/db/types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Fastify plugins and route registration are async by contract.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
