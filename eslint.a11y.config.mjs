// Accessibility-only lint. Deliberately narrow: this repo has no general
// ESLint setup, and the point of this file is a single CI gate for WCAG
// structure problems in JSX (missing labels, invalid ARIA, click handlers on
// non-interactive elements, missing keyboard handlers). Run with
// `npm run lint:a11y`.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['client/src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    // react-hooks is registered only so existing `eslint-disable` comments
    // that name its rules parse; none of its rules run here.
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // Every autoFocus in this app is on a field the user just opened (a
      // dialog, an inline rename, a composer). Moving focus there is the
      // WAI-ARIA dialog behaviour; the rule targets autofocus on page load,
      // which disorients screen-reader users and which we do not do.
      'jsx-a11y/no-autofocus': 'off',
    },
  },
];
