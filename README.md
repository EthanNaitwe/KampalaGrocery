# FreshMart

Grocery delivery for Kampala. Customers shop and order in the **mobile app**; staff run fulfilment
from the **web console**. Both talk to one Express API backed by PostgreSQL.

| Part | Path | Stack |
| --- | --- | --- |
| API | [server/](server) | Express, TypeScript, Drizzle ORM, PostgreSQL (Neon) |
| Shared contracts | [shared/](shared) | Zod request schemas, response types, order rules |
| Staff console | [client/](client) | React, Vite, Tailwind, shadcn/ui, TanStack Query |
| Mobile app | [mobile/](mobile) | Expo, React Native, Expo Router ([setup](mobile/README.md)) |
| Tests | [tests/](tests) | Vitest + Supertest integration tests against a real database |

## What it does

- **Sign-in**: 6-digit SMS (or email) codes, hashed, single-use, attempt-limited and throttled.
  Mobile uses rotating refresh tokens in secure device storage; the console uses a cookie session.
- **Catalog and cart**: categories, search, a cart stored on the server, and stock counts.
  Products marked "not counted" sell without a limit.
- **Checkout**: saved addresses, delivery areas with fees and minimum orders, daily slots with
  capacity and cutoff, cash on delivery. The server computes every total. Order placement is one
  transaction that won't oversell stock or slots, and an `Idempotency-Key` makes retries safe.
- **Fulfilment**: fixed status steps (New → Confirmed → Packing → Out for delivery → Delivered, or
  Cancelled), an audit trail, rider assignment, and a stock ledger.
- **Customer texts**: an SMS at each key step. Every attempt is recorded and staff can resend
  failures, so an SMS outage never blocks an order.
- **Support**: customers report problems on an order; staff resolve them in the console.
- **Account deletion**: erases personal data and keeps anonymised order records.

## Local development

```bash
npm install
cp .env.example .env      # set DATABASE_URL at minimum; see the comments in the file
npm run db:migrate        # apply migrations in ./migrations
npm run dev               # API + staff console on http://localhost:5000
```

With `DEV_LOG_OTP=true` (development only) and no SMS provider, sign-in codes print to the server log.

To make a user staff, sign in once and then set `users.is_admin = true` for that user in the database.

## Checks

```bash
npm run check             # type-check server, console and shared code
npm run build             # console bundle + dist/server.js
TEST_DATABASE_URL=... npm test   # integration tests: use a Neon branch, never production data
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the type-check and builds for the
server, console and mobile app. It runs the tests when a `TEST_DATABASE_URL` secret is set.

## Database changes

Edit [shared/schema.ts](shared/schema.ts), then:

```bash
npm run db:generate       # writes a new SQL migration to ./migrations (review it)
npm run db:migrate        # applies pending migrations
```

Run `db:migrate` against production **before** deploying code that depends on a migration.
Deploys don't apply migrations automatically.

## Deployment

- **Vercel** (current): `api/index.ts` serves the API as a serverless function, and the console is
  served as static files. Set every variable from `.env.example` in the Vercel project. In
  production the server refuses to start without `SESSION_SECRET`, `JWT_SECRET` and `OTP_SECRET`.
- **Long-running host** (needed later for payment webhooks): `npm run build && npm start`.

## API

Versioned under `/api/v1` (the mobile app and the console). `/api` is a legacy alias used by the
console's sign-in. Request and response shapes are in [shared/api.ts](shared/api.ts). Errors always
look like `{ message, error: { code, message, details? } }`.
