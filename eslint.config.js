import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    vue: false,
    react: false,
    formatters: true,
  },
  {
    rules: {
      'no-console': 'warn',
    },
  },
)