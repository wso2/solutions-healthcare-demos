import antfu from "@antfu/eslint-config";

export default antfu(
  {
    react: true,
    typescript: true,
    stylistic: false,
    ignores: [".next", "next-env.d.ts", "src/components/ui/**"],
  },
  {
    rules: {
      "no-inline-comments": "error",
      "unicorn/prefer-type-error": "off",
    },
  },
);
