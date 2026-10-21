import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // react-bits vendor effects; ref access during render is upstream code.
    "src/components/Dither.jsx",
    "src/components/FaultyTerminal.jsx",
    "src/components/GradientASCII.jsx",
    ".claude/**",
  ]),
]);

export default eslintConfig;
