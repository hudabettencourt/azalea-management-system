<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Next.js 16 + TypeScript + Supabase ERP ("Azalea"). Package manager is **npm** (`package-lock.json`). Dependencies are installed by the startup update script (`npm install`); no extra setup needed.

### Services / commands
- Dev server: `npm run dev` (Next.js + Turbopack on port 3000). This is the only service; there is no local backend or local Supabase stack.
- Lint: `npm run lint`. The codebase currently has many pre-existing lint errors/warnings — treat existing failures as baseline, not environment breakage.
- No test framework or `test` script exists.
- Avoid `next build` for verification: build runs ESLint and fails on the pre-existing lint errors. Use dev mode instead.

### Supabase (remote, no local stack) — IMPORTANT
- The app talks to a **remote, hosted Supabase project** (`Azalea Core`, ref `ryjqpsgzmzqqixlgfsrd`). There is no `supabase/config.toml` and no local DB; only one migration is in-repo.
- Required env vars live in `.env.local` (gitignored, **not committed**, and not recreated by the update script — so it must be re-provided each fresh VM, e.g. via repo Secrets):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + auth (enough for the dashboard and login).
  - `SUPABASE_SERVICE_ROLE_KEY` — only needed by server API routes (`app/api/**`, Shopee, Cloudinary upload).
- **The configured database is the live PRODUCTION DB with real business data.** Do not create/mutate real records when testing; prefer read-only flows or clean up anything you write.

### Auth / how to view logged-in pages
- Middleware (`app/middleware.ts`) redirects unauthenticated requests to `/login` and gates pages by `profiles.role` (`owner`/`super_admin` can access everything). So to test any page beyond `/login` you need a logged-in user whose `profiles.role` is recognized.
- A temporary test login can be created via the Supabase MCP: insert into `auth.users` with an `encrypted_password` built from `crypt('<pw>', gen_salt('bf'))` (the `handle_new_user` trigger auto-creates the `profiles` row), then `UPDATE public.profiles SET role='owner'` for that user. Delete the user from `public.profiles` and `auth.users` when done so no known-password account is left in production.
