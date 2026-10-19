# e2e (Playwright)

Runs against a **throwaway Postgres in Docker**, never the database in `.env`.
`e2e/support/db.ts` refuses to run unless `DATABASE_URL` is exactly the test URL.

```
npm run e2e:db                      # once: start the container (127.0.0.1:15432)
$env:DATABASE_URL="postgresql://postgres:e2e@127.0.0.1:15432/gcode_e2e"
npx prisma migrate deploy; npx tsx prisma/seed-rbac.ts   # once
npm run test:e2e
```

Each test reseeds a fixed 5-level tree (see `ID` in `support/db.ts`) and signs in by
setting the `gcode_session` cookie for a seeded Admin / Project Manager session.
