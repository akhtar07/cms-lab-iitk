import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This is a client-only SPA: loading data inside useEffect and setting
      // state from the response is the intended pattern here.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "supabase/**", "next-env.d.ts"]),
]);

export default eslintConfig;
