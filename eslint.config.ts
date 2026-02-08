import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
    { files: [".vscode","config","data","src/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.node } },
    tseslint.configs.recommended,
    { files: [".vscode","config","data","src/*/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
    { files: [".vscode","config","data","src/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
    { files: [".vscode","config","data","src/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
    {
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars":
                ["error", {
                    "varsIgnorePattern": "^_",
                    "argsIgnorePattern": "^_",
                    "ignoreRestSiblings": true,
                    "ignoreUsingDeclarations": true
                }]
        }
    }
]);
