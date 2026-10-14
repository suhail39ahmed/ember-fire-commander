module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'public/sw.js'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      // `declare global { var ... }` is the documented way to type the App Check debug flag.
      files: ['src/auth/firebase.ts'],
      rules: { 'no-var': 'off' },
    },
    {
      // AuthProvider exports its hook next to the provider.
      files: ['src/auth/AuthProvider.tsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
}
