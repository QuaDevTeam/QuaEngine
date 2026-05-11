import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'packages/build/vscode-quascript/server/**',
    ],
    typescript: true,
    vue: false,
    react: false,
    formatters: true,
  },
  {
    rules: {
      'e18e/prefer-object-has-own': 'off',
      'node/prefer-global/buffer': 'off',
      'node/prefer-global/process': 'off',
      'no-console': 'warn',
    },
  },
)
