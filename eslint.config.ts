import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        ignores: [
            "node_modules/**/*",
            "dist/**/*"
        ]
    },
    tseslint.configs.recommended,
    { 
        files: [
            ".vscode/**/*.{js,mjs,cjs,ts,mts,cts}",
            "config/**/*.{js,mjs,cjs,ts,mts,cts}",
            "data/**/*.{js,mjs,cjs,ts,mts,cts}",
            "src/**/*.{js,mjs,cjs,ts,mts,cts}"
        ],
        plugins: { js }, 
        extends: ["js/recommended"], 
        languageOptions: { globals: globals.node } },
    {
        files: [
            ".vscode/**/*.json",
            "config/**/*.json",
            "data/**/*.json",
            "src/**/*.json"
        ],
        plugins: { json }, 
        language: "json/json", 
        extends: ["json/recommended"] },
    { 
        files: [
            ".vscode/**/*.jsonc",
            "config/**/*.jsonc",
            "data/**/*.jsonc",
            "src/**/*.jsonc"
        ], 
        plugins: { json }, 
        language: "json/jsonc", 
        extends: ["json/recommended"] },
    { 
        files: [
            ".vscode/**/*.json5",
            "config/**/*.json5",
            "data/**/*.json5",
            "src/**/*.json5"
        ],
        plugins: { json }, 
        language: "json/json5", 
        extends: ["json/recommended"] },
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
