# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15 mobile PWA written in TypeScript. Routes, layouts, and global styles live in `src/app/`; API handlers are under `src/app/api/`. Keep outfit-analysis logic in `src/features/outfit/`, with UI components in `src/features/outfit/components/`. Shared utilities belong in `src/lib/`. Static PWA assets are in `public/`.

Tests mirror their purpose rather than source paths: unit and component tests are in `tests/unit/`, browser flows are in `tests/e2e/`, safety evaluation cases are in `tests/evals/`, and safe image fixtures are in `tests/fixtures/`.

## Build, Test, and Development Commands

- `pnpm dev` — start the local Next.js development server.
- `pnpm test` — run Vitest unit, component, and safety tests.
- `pnpm test:e2e` — run Playwright browser tests; it starts the dev server automatically.
- `pnpm lint` — run ESLint with Next.js Core Web Vitals rules.
- `pnpm typecheck` — validate strict TypeScript without emitting files.
- `pnpm build` — create a production build; run before submitting significant changes.

Use Node 24 and pnpm 11.9.0. Install Chromium with `pnpm exec playwright install chromium`.

## Coding Style & Naming Conventions

Use strict TypeScript and the `@/` alias for imports from `src/`. Follow the surrounding two-space indentation, semicolons, and double quotes. Name React components in PascalCase (for example, `PhotoStep.tsx`), hooks with `use` prefixes (for example, `useOutfitFlow.ts`), and non-component modules in kebab-case (for example, `output-safety.ts`). Keep server-only logic out of client components and validate untrusted API input at route boundaries.

## Testing Guidelines

Add or update focused tests with every behavior change. Use `*.test.ts` for logic and `*.test.tsx` for rendered components; use `*.spec.ts` for Playwright scenarios. Keep tests deterministic: mock network/model calls and use only the provided non-personal image fixture. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`; also run `pnpm test:e2e` for user-flow changes.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style messages seen in history: `feat: add result navigation actions`, `fix: escape untrusted prompt delimiters`, or `test: cover flow`. Keep each commit scoped. Pull requests should explain the change, list verification commands, link the relevant issue when available, and include screenshots for UI changes. Call out privacy, prompt, or API-contract changes explicitly.

## Security & Configuration

Copy `.env.example` to `.env.local`; never commit it or expose server secrets in client code. Treat photos, model output, telemetry, and rate limiting as sensitive boundaries. Preserve existing fail-closed output validation and privacy constraints when modifying analysis or telemetry code.

## ECPay API Skill

讀取 `.ecpay-skill/<入口文件>` 作為 ECPay 整合知識庫入口。
完整指南位於 `.ecpay-skill/guides/`（29 份），即時 API 規格索引位於 `.ecpay-skill/references/`。
