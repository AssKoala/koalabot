# AGENTS.md — Repo Coding Methodology (TypeScript/Node, ESM, Strict)

This file is the single source of truth for how an AI coding agent should work in this repository.

Goals (in priority order):
1. **Write extremely good code**
2. **Match the existing code style and architecture**
3. **Use industry best practices where the repo has no standard**
4. **Minimize bugs**
5. **Leave the codebase better than you found it (within scope)**

---

## 0) Prime directives

- **Be explicit over clever.** Favor readability, maintainability, and predictable control-flow.
- **Minimize scope.** Keep diffs small and reviewable. Avoid refactors “because we’re here.”
- **Match local conventions first.** When editing a file, mirror its patterns unless they are clearly unsafe.
- **Improve safely.** If you touch code that’s actively harmful (e.g., `@ts-ignore`, `any` in public APIs), prefer **surgical fixes** over rewrites.
- **No drive-by formatting.** There is **no Prettier/Biome**; keep formatting consistent with nearby code.
- **Never apply global linting, formatting, or line-ending changes.** Do not run formatters, linters with `--fix`, or line-ending converters (e.g., CRLF↔LF) across the repo. A past incident converted every file to CRLF in a single commit, producing a 37k-line diff that buried the real 600-line feature. If formatting fixes are needed, limit them to the files you are already modifying for functional reasons.

---

## 1) Repo context (assumptions the agent must respect)

### Languages
- **TypeScript (primary)** — `strict: true`, targeting **ES2022**, **ESM** (`"type": "module"`).
- **JavaScript is allowed** (`allowJs: true`) for helper scripts in `scripts/`.
- **Python** exists only for a small utility script (`scripts/reddit_reader.py`).
- **JSON / JSONC / JSON5** for configs.

### Architecture / organization
The repo uses a Manager/Service pattern (not strict MVC):
- `src/api/` — bot system, commands, interactions (“controller” layer)
- `src/commands/` — individual command implementations
- `src/listeners/` — event-driven message listeners
- `src/helpers/`, `src/llm/` — LLM provider abstractions
- `src/app/` — application features (e.g., stenographer, user settings)
- `src/sys/` — low-level filesystem/utility
- `src/platform/discord/` — Discord-specific platform layer

Command / listener orchestration is done via `CommandManager` / `ListenerManager` (plugin/command style).

### Enforcements
- **ESLint 9** (flat config) + `@eslint/js`, `typescript-eslint`, `@eslint/json`.
- **Unused vars are errors**, but `_prefix` may be exempted.
- **TypeScript strictness** includes: `strict`, `noImplicitOverride`, `forceConsistentCasingInFileNames`, `isolatedModules`.
- **Vitest** for unit tests.
- **No formatter configured**; follow existing whitespace/line wrapping.

---

## 2) Working process (how the agent should operate)

### A. Understand and plan
Before coding:
- Identify the **entry points** (commands, listeners, API routes) and the **managers** involved.
- List dependencies and touchpoints:
  - internal modules you’ll import/modify
  - config keys used/added
  - external APIs called (Discord, LLM providers, filesystem)
  - tests to add/update
- If ambiguous, present **2–3 concrete approaches** with trade-offs and recommend one.

### B. Implement with “diffability”
- Prefer **small helpers** over big rewrites.
- Keep functions small (≈ **< 40 lines** when possible).
- Use early returns to reduce nesting.
- Delete dead code instead of leaving it commented out.
- Avoid bulk renames and mass formatting.

### C. Verify
For any change that affects behavior:
- Add/extend tests (Vitest) or provide a reproducible manual test plan.
- Run the repo’s checks (as available in `package.json`):
  - lint
  - typecheck/build
  - unit tests
- If you can’t run commands, still ensure changes are:
  - type-safe under strict mode
  - ESLint-clean
  - covered by tests or clearly documented test steps

---

## 3) Style rules (match existing code first)

### When editing existing files
- **Follow the file’s dominant style** (class-heavy OOP, managers, manual getters/setters) to keep the code cohesive.
- You may modernize locally *only when it’s clearly beneficial* (e.g., replacing `any` with a precise type).
- Keep exports/import patterns consistent with the module.

### When adding new code
- Prefer the repo’s established structure:
  - new command → `src/commands/…`
  - new listener → `src/listeners/…`
  - new shared domain logic → appropriate manager/helper folder
- Choose the simplest abstraction that fits:
  - If surrounding code uses classes/managers, add another class (don’t introduce a functional micro-framework).
  - If a module is already functional, keep it functional.

### Formatting
- Don’t reflow the whole file.
- Keep line lengths reasonable.
- Use consistent indentation and brace placement with adjacent code.

---

## 4) TypeScript best practices (strict mode, minimal bugs)

### A. Types are part of the design
- Avoid `any` on public interfaces; prefer:
  - generics
  - discriminated unions
  - `unknown` + narrowing
- Prefer `readonly` for inputs and immutable data where appropriate.
- Favor explicit return types for exported functions and public class methods.
- When passing around config/model identifiers, prefer enums or union types over raw strings.

### B. Eliminate `@ts-ignore` as a rule
- **Default: do not add new `@ts-ignore`.**
- If you find an existing one:
  - try to remove it by typing the source correctly
  - if removal is too risky, scope it:
    - use `@ts-expect-error` with a clear comment explaining why, and reference a ticket/issue if possible
    - narrow the ignored line to the minimum possible surface area

### C. Prefer predictable module boundaries
- This repo is **ESM**:
  - use `import … from …`
  - avoid `require()` unless already used in a `scripts/` JS file and necessary
- Keep side-effects out of module top-level where possible (especially network calls and filesystem writes).

### D. Favor correctness in async code
- Always `await` promises you depend on.
- Use `Promise.all` for parallel work only when the operations are independent.
- Ensure timeouts/cancellation where user-facing latency matters (LLM calls, Discord interactions).

### E. Errors and results
- Don’t swallow errors.
- Prefer typed errors (custom `Error` subclasses) for domain failures.
- If a function can fail in an expected way, prefer returning a typed result:
  - e.g., `{ ok: true, value } | { ok: false, error }` (or a repo-standard equivalent)

---

## 5) “Non-idiomatic TS” realities (how to improve safely)

The codebase leans OOP/Java-like. The agent must *not* fight the repo, but should avoid making it worse.

### Allowed improvements (safe, incremental)
- Replace `Promise<any>` with `Promise<SpecificType>` (or a generic).
- Add missing types to constructor params and method signatures.
- Introduce small, typed helper functions instead of repeated string parsing.
- Replace brittle string-prefix dispatch with a small registry map *if localized* and testable.
- Separate concerns when a class mixes responsibilities (e.g., keep registry logic separate) **only if the change is small**.

### Avoid unless explicitly requested
- Large refactors from classes → modules/functions across many files.
- Introducing a DI container/framework.
- Repo-wide config schema migrations.
- Converting all getters/setters to fields.
- Changing existing naming conventions en masse.

---

## 6) Config, parsing, and validation

- Treat config as **untrusted input**.
- Prefer centralizing parsing/validation:
  - read once, validate once, export typed values
- If the repo doesn’t have a config schema, you may introduce a lightweight validator (e.g., `zod`) **only if**:
  - it’s scoped (one domain), and
  - it reduces runtime crashes, and
  - it does not force a repo-wide migration

If config values are currently comma-delimited strings:
- Prefer a helper like `parseCsvList(value: string): string[]` with trimming and empty filtering.
- Add tests for parsing edge cases.

---

## 7) Logging and observability

- Use the repo’s logger interface/pattern (don’t add ad-hoc `console.log` in production paths).
- Log **context**, not noise:
  - include request IDs, command names, model/provider, timing, and user-visible correlation IDs when available
- Avoid logging secrets:
  - API keys, tokens, prompt contents with user secrets, personal data

---

## 8) Testing (Vitest)

- Add tests for:
  - new helpers (pure functions)
  - parsing/validation
  - dispatch/registry selection
  - error behavior (expected failures)
- Keep tests deterministic:
  - mock time (`vi.useFakeTimers`) when needed
  - mock network/LLM calls
- Prefer small unit tests over slow integration tests unless required.

---

## 9) Performance and safety

- Do not optimize prematurely.
- When performance matters:
  - measure (timing/logging)
  - optimize the smallest hotspot
- Watch for:
  - unbounded concurrency (rate limits for Discord/LLMs)
  - memory growth (caches without eviction)
  - user input injection (file paths, command strings)

---

## 10) Change limits and PR hygiene

- Keep changes to a few files; aim for **≤ 5 files modified** unless explicitly approved.
- One feature/fix per PR.
- Update docs/comments when behavior changes.
- Summarize:
  - what changed
  - why
  - how it’s tested
  - any follow-ups or known risks

---

## 11) Quick checklist (before you say “done”)

- [ ] Types are strict-safe; no new `any` on public APIs.
- [ ] No new `@ts-ignore`; minimized/justified any legacy ignores touched.
- [ ] ESLint clean; unused vars addressed (use `_` prefix where needed).
- [ ] Tests added/updated or manual test steps documented.
- [ ] No drive-by formatting or mass refactors.
- [ ] Change improves code quality within scope (typing, clarity, safety).

---

## Appendix: Scripts (JS/Python)

### `scripts/*.js`
- Keep scripts small and self-contained.
- Prefer `node:` built-ins and ESM syntax (match repo config).
- Validate inputs and exit with non-zero on failure.

### `scripts/reddit_reader.py`
- Keep changes minimal; follow the project’s Python guidelines if you touch it.
- Prefer explicit types and clear error handling.
