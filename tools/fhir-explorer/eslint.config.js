import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";

export default defineConfig(
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Matches the pre-existing main config; underscore-prefixed args are common in tests.
      "@typescript-eslint/no-unused-vars": "off",
      // React Compiler advisories — pre-existing patterns, tracked but not blocking.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  eslintPluginPrettier,
  globalIgnores([".next/**", "dist/**", "node_modules/**"]),
);
