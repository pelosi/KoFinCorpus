// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error"
    }
  }
);