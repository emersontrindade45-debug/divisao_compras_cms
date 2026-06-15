<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Stack: Next.js 16 (App Router, Turbopack) + React 19 + Postgres + Prisma 7. Package manager is **pnpm**. Standard scripts live in `package.json` (`dev`, `build`, `lint`, `typecheck`, `test`, `db:seed`, `db:migrate`). Run instructions are in `README.md`.

Non-obvious setup/run caveats:

- **Postgres is required and runs locally** (installed via apt in the snapshot; there is no Docker here even though `docker-compose.yml` exists). Start it each session with `sudo pg_ctlcluster 16 main start`. Connection used by `.env`: db `divisao_compras`, user/password `postgres`/`postgres` on `localhost:5432`.
- **`.env` is required** (gitignored). Copy `.env.example` and set at least `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL`.
- **`RESEND_API_KEY` must NOT be left as an empty string.** `src/lib/email/client.ts` only falls back to a placeholder when the var is `undefined` (`?? "re_placeholder"`); an empty string reaches `new Resend("")` and **crashes `pnpm build`** while collecting page data for `/api/jobs/lembretes`. Use a non-empty placeholder like `re_placeholder` (emails are simulated without a real key).
- **First-time DB setup:** `pnpm exec prisma migrate deploy` then `pnpm db:seed`. The data dir persists in the snapshot, so re-seeding is usually unnecessary.
- **Login note:** the seeded admin (`admin@cms.santos.sp.gov.br`) ships with a placeholder password hash, so login fails out of the box. To log in, set a real bcrypt hash, e.g. `UPDATE users SET "passwordHash"='<hash>' WHERE email='admin@cms.santos.sp.gov.br';` where `<hash>` comes from `node -e "console.log(require('bcryptjs').hashSync('admin123',10))"`.
- Dev server runs on port 3000 (`pnpm dev`). All routes except `/login` require an authenticated session (see `src/middleware.ts`).

Deploying to Vercel: requires a `VERCEL_TOKEN` secret (interactive `vercel login` is not possible here). The CLI is installed globally. A preview build also needs the runtime env vars set on Vercel (`DATABASE_URL` pointing at a publicly reachable Postgres, `AUTH_SECRET`, etc.).
