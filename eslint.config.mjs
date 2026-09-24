import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Фикстуры Playwright передают значение через use(): это не хук React.
  {
    files: ["steps/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сборка для e2e и тесты, сгенерированные из сценариев.
    ".next-e2e/**",
    ".features-gen/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
