# Google authentication final review fixes

## Status

Implemented both final review findings on `codex/google-auth-impl`.

## Changes

- Moved the Next middleware entrypoint from the repository root to `src/middleware.ts`.
- Preserved the Supabase session refresh delegation and the existing route matcher.
- Added a focused middleware entrypoint test and a production-build manifest assertion. The build now fails if Next does not discover `src/middleware`, emit its bundle, or load the expected matcher.
- Disabled the analysis retry action while authentication is pending and exposed that pending state with `aria-busy`; the initial analysis action now exposes the same semantic.
- Added a focused retry-pending regression test.
- Made Playwright's local Next server self-contained by supplying non-secret fallback public Supabase configuration, while respecting real environment values when supplied.

## Verification

- Focused Vitest: 60 tests passed.
- `pnpm test`: 379 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test:e2e`: 28 tests passed.
- `pnpm build`: passed; emitted `ƒ Middleware` and verified `src/middleware` in `.next/server/middleware-manifest.json`.

## Concerns

- Next.js continues to warn that this worktree has an additional lockfile and that future dev-server versions will require an explicit `allowedDevOrigins` setting. Neither warning fails validation or is introduced by this fix.
