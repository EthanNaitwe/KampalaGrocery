# Commercial Mobile App Implementation Plan

## 1. Purpose and recommended direction

Turn the existing Kampala grocery storefront into a dependable, secure Android and iOS shopping app that can accept real orders and payments, support delivery operations, and be maintained after launch.

**Recommendation:** Build a native-feeling cross-platform app with **Expo and React Native (TypeScript)**, while retaining the existing React/Vite site as the web storefront and the Express API as the first backend. Reuse business rules, API contracts, and validated data types where practical; do not try to reuse browser-only UI components as native screens.

This is the best fit if the goal is a professional app-store product with secure device storage, push notifications, camera/location options, and room to grow. If the immediate priority is a lower-cost pilot with maximum web UI reuse, evaluate Capacitor before implementation; treat it as an explicit product/technical decision rather than mixing both approaches.

## 2. Current baseline

The repository already provides useful starting points:

- React, Vite, Tailwind, Wouter, and TanStack Query power the web client. Current customer features include product/category browsing, search, cart, and OTP sign-in. See [client/src](./client/src).
- An Express API provides authentication, products, categories, cart, and orders, plus basic admin order-status operations. See [server/routes.ts](./server/routes.ts).
- Shared Drizzle/PostgreSQL table definitions exist in [shared/schema.ts](./shared/schema.ts), and a Neon database connector exists in [server/db.ts](./server/db.ts).
- The active storage adapter still uses Google Sheets with an in-memory fallback ([server/storage.ts](./server/storage.ts), [server/googleSheetsDb.ts](./server/googleSheetsDb.ts), [server/fallbackStorage.ts](./server/fallbackStorage.ts)). Memory fallback is not durable or safe for commercial order data.
- Authentication supports phone/email OTP, but currently uses Express `MemoryStore`, a development fallback session secret, and development OTP logging ([server/smsAuth.ts](./server/smsAuth.ts)). A mobile app needs a deliberate token/session design.
- Checkout currently submits placeholder customer and delivery details from the UI; there is no payment integration or delivery-slot/fee selection ([client/src/components/shopping-cart.tsx](./client/src/components/shopping-cart.tsx)).
- The web app is configured for Vercel/serverless deployment ([vercel.json](./vercel.json)); mobile builds and the long-running/background tasks needed for reliable order processing require a deployment plan.
- Current `npm run check` reports a TypeScript error in `server/replitAuth.ts` because it passes an `email` field that is not in the user schema. Establish a clean validation baseline before expanding the codebase.

## 3. Product decisions to make before implementation

Record and approve these decisions during discovery:

1. **Launch market and service area:** initial Kampala neighborhoods, delivery hours, minimum order, delivery fee, and out-of-area behavior.
2. **Customer promise:** assortment, substitutions, freshness policy, delivery-time expectations, cancellation/refund rules, and customer-support hours.
3. **Platforms:** Android and iOS at launch, or Android-first pilot followed by iOS.
4. **Payments:** select providers that currently support the business, currency, settlement needs, and target market. Evaluate MTN Mobile Money and Airtel Money, cash on delivery, and optional cards; confirm commercial availability and fees directly with providers.
5. **Operations and inventory:** who owns catalog updates, stock counts, substitutions, order acceptance, picking, dispatch, and delivery completion.
6. **Brand and policy:** app name, logo, support contacts, privacy policy, terms, returns/refunds, and data-retention rules.

Do not begin payment implementation until the provider, settlement flow, and operational handling of failed, pending, reversed, and refunded transactions are agreed.

## 4. Target architecture

- **Mobile:** Expo + React Native + TypeScript, Expo Router for navigation, TanStack Query for server state, and secure device storage for refresh credentials. Use native-safe components and a small shared design system.
- **Backend:** retain Express initially, expose a documented and versioned API for mobile, and keep authorization and all business-critical calculations on the server. Configure separate development, staging, and production API URLs.
- **Database:** migrate operational data to managed PostgreSQL using the existing Drizzle schema as a starting point. Use migrations, backups, constraints, indexes, and transaction-safe order/payment operations. Google Sheets may remain an export/reporting tool, not the source of truth.
- **Identity:** keep phone OTP as the primary sign-in option if product discovery confirms it; design mobile access/refresh tokens with rotation, expiry, revocation, and secure device storage. Do not rely on browser cookies or process-memory sessions for mobile authentication.
- **Operations:** keep or improve the web admin experience as a separate, role-protected operations console. Avoid putting administrative workflows into the customer app unless a specific need is approved.
- **Media and notifications:** put product images in managed object storage/CDN; use a push-notification provider and store device-token registration server-side.

## 5. Phased implementation

### Phase 0 — Discovery, launch scope, and delivery readiness

**Work**
- Confirm the decisions in Section 3 and name a product owner for each operational process.
- Map the customer journey from product discovery through delivery, including failure paths and customer support.
- Define the MVP, success measures, delivery coverage, launch assortment, and launch budget.
- Confirm payment provider onboarding requirements, credentials, test environments, settlement reconciliation, and refund support.
- Choose Expo/React Native or approve a Capacitor alternative; document the decision and minimum OS versions.

**Exit criteria**
- Signed-off MVP backlog, operational service area, delivery and payment rules, support plan, app architecture decision, and release owner.

### Phase 1 — Codebase and production foundation

**Work**
- Fix the existing TypeScript baseline error and add CI checks for type-check, lint, tests, and production builds.
- Create an Expo mobile app workspace in the repository with environment-specific configuration and reproducible EAS builds.
- Define API contracts (OpenAPI or equivalent), consistent error shapes, request validation, pagination, and API versioning.
- Configure managed PostgreSQL for local, staging, and production environments; add migrations and seed data.
- Inventory Google Sheets data, clean and back it up, map it to relational tables, run a test migration, and reconcile row counts and totals before cutover.
- Replace silent Google Sheets-to-memory fallbacks for critical records with explicit operational errors and monitoring. Never report a successful order unless its durable write succeeds.
- Choose a backend host that supports reliable API execution, health checks, database connections, secrets, logs, and background/webhook work. Validate whether the existing Vercel arrangement is suitable or split API hosting from static web hosting.

**Exit criteria**
- CI is green; staging API and PostgreSQL are usable; schema migrations and repeatable data migration are tested; a staging mobile build can call the API.

### Phase 2 — Secure identity and customer account

**Work**
- Define phone/email identity rules, account recovery, account deletion, and duplicate-account handling.
- Harden OTP: cryptographically secure code generation, short expiry, attempt limits, per-number/IP rate limits, resend throttling, abuse monitoring, and generic responses that do not leak account existence.
- Remove OTP/session secrets from logs and remove development-only OTP behavior from production paths.
- Replace hard-coded fallback session secrets and the in-memory session store. Implement revocable, rotating mobile refresh tokens stored using iOS Keychain/Android Keystore-backed secure storage; keep short-lived access tokens out of persistent logs.
- Add authorization tests for customer and admin roles, including direct API calls that bypass the app UI.
- Build mobile onboarding, OTP entry, loading/error states, sign-out, session expiry, and account settings.

**Exit criteria**
- OTP abuse and expiry cases are tested; sessions survive app restarts safely and can be revoked; customer and admin authorization is enforced by the API.

### Phase 3 — Mobile foundation and shopping experience

**Work**
- Build navigation and reusable mobile design components: safe-area layouts, typography, buttons, form controls, loading/empty/error states, and accessibility labels.
- Add catalog browsing, categories, search, product detail, image loading/fallbacks, stock status, and pull-to-refresh.
- Add a persistent server-backed cart, quantity validation, remove/update actions, and a clear sign-in requirement or guest-cart merge policy.
- Implement API caching and retry behavior that distinguishes offline, authentication, validation, and server errors. Avoid retrying non-idempotent order requests automatically.
- Replace remote placeholder imagery with owned/approved product images and responsive image sizes.

**Exit criteria**
- A user can browse and search the launch catalog, understand availability and price, and maintain a cart across app restarts and devices after signing in.

### Phase 4 — Checkout, delivery, payments, and order lifecycle

**Work**
- Replace placeholder checkout values with validated customer contact details, saved addresses, delivery instructions, service-area validation, delivery fee, and available time slots.
- Make the server authoritative for product prices, stock, discounts, delivery fees, tax where applicable, and order totals. The client must never submit a trusted total.
- Add transactional order creation, inventory reservation/release, immutable order-line price snapshots, idempotency keys, and protection against duplicate taps/retries.
- Implement selected payment flows through the provider’s supported SDK/API. Verify payment status via signed server-side webhooks; safely process duplicate/out-of-order callbacks; support pending, failed, reversed, refunded, and paid states.
- Keep cash-on-delivery as an explicit payment method only if operations approve it.
- Add order history, order details, clear status progression, cancellation rules, and receipts/confirmations.

**Exit criteria**
- End-to-end staging orders work for each approved payment method; duplicate requests cannot create duplicate charges/orders; reconciliation and refund procedures are documented and tested.

### Phase 5 — Delivery operations, admin, and customer communications

**Work**
- Improve the admin console for catalog/stock edits, order acceptance, picking, substitutions, assignment, status transitions, cancellation, and refund tracking.
- Add explicit status-transition rules and an audit trail recording who changed an order and when.
- Send transactional SMS/email/push updates for OTP, order confirmation, payment outcome, dispatch, delivery, and cancellation, with user notification preferences where appropriate.
- Add customer support contact, issue reporting, and a manual operational fallback for notification/payment provider outages.
- Define operational dashboards for orders awaiting action, low stock, failed payments, and delivery exceptions.

**Exit criteria**
- Staff can fulfill an order from payment/acceptance through delivery and resolve common exceptions without editing production data directly.

### Phase 6 — Quality, security, privacy, and performance

**Work**
- Add unit tests for pricing, inventory, order state transitions, and validation; integration tests for auth, cart, checkout, payments, and webhooks; and end-to-end tests for primary customer journeys.
- Test on representative Android and iOS devices, slow/intermittent networks, small screens, app background/resume, and expired sessions.
- Perform a security review of authentication, admin authorization, secrets, rate limits, API input validation, dependency health, and payment webhook verification.
- Add structured logs, request IDs, crash reporting, API health/latency monitoring, database backup/restore drills, and alert ownership. Exclude OTPs, tokens, and unnecessary personal data from logs.
- Complete privacy disclosures, consent flows, retention/deletion procedures, terms, and app-store privacy forms. Verify applicable Ugandan data-protection obligations with qualified counsel.
- Set measurable launch targets for crash-free sessions, checkout success, OTP delivery, API latency, and order/payment reconciliation.

**Exit criteria**
- No open launch-blocking defects or high-severity security findings; critical flows pass on both target platforms; backups, monitoring, privacy materials, and incident ownership are in place.

### Phase 7 — Store release and controlled launch

**Work**
- Configure signing, application identifiers, versioning, icons, splash screens, permissions, privacy labels, support URL, and store listing assets.
- Produce signed internal builds; run staff testing, then a limited customer pilot in the approved delivery area.
- Reconcile every pilot order and payment manually against provider records; review support cases and delivery performance daily.
- Fix pilot issues, prepare rollback/disable mechanisms for payment or app features, and gradually expand availability.

**Exit criteria**
- App Store and Google Play approval, trained operations/support staff, documented rollback/incident procedures, and an approved pilot-to-public rollout decision.

### Phase 8 — Post-launch improvement

**Work**
- Review funnel conversion, search failures, cart abandonment, payment outcomes, delivery punctuality, refunds, and support tickets weekly.
- Prioritize product availability accuracy, substitutions, saved favorites/reorder, promotions, and improved delivery tracking based on measured customer need.
- Schedule dependency/security updates, OS compatibility checks, backup restore tests, and regular access reviews.

**Exit criteria**
- A named owner and recurring review cadence exist for product metrics, operational quality, security maintenance, and customer feedback.

## 6. Suggested MVP scope

**Include in first commercial release**
- Phone OTP sign-in; optional email only if support and verification are ready.
- Product and category browsing, search, stock indication, and product details.
- Cart, address/contact capture, service-area and delivery-fee checks, delivery instructions, and order confirmation.
- One fully operational payment method plus an explicitly approved fallback (for example cash on delivery).
- Customer order history/status; staff web console for catalog and order fulfillment.
- Transactional OTP/order messages, support contact, analytics, crash reporting, and privacy/account-deletion flows.

**Defer until the core service is reliable**
- Loyalty points, referrals, complex promotions, subscriptions, multi-merchant support, live courier maps, advanced personalization, and a driver app.

## 7. Data model additions to plan for

Extend the existing schema only after requirements are confirmed. Likely additions include customer addresses, product SKU/units/variants, inventory movements or reservations, delivery zones and slots, payment attempts and provider references, idempotency records, refresh-token/session records, notification preferences/device tokens, and audit events. Keep order-line prices and delivery/payment details as historical snapshots so later catalog changes do not rewrite past receipts.

## 8. Commercial release checklist

- [ ] Product scope, delivery coverage, fees, hours, and customer-support ownership approved.
- [ ] Payment provider account, settlement, webhook, reversal, and refund flows verified in staging.
- [ ] PostgreSQL is the durable source of truth; migrations, backups, and restore are tested.
- [ ] No production OTPs, tokens, or secrets appear in logs; secrets are environment-managed and rotated.
- [ ] Customer/admin authorization and order/payment state transitions have automated tests.
- [ ] Android and iOS builds pass device testing, accessibility review, and store policy checks.
- [ ] Privacy policy, terms, support links, retention/deletion process, and store disclosures are published.
- [ ] Monitoring, alerting, support playbooks, incident response, and rollout/rollback plan are owned.
- [ ] Pilot orders reconcile across app, database, payment provider, and delivery operations.

## 9. Recommended implementation order

Proceed in this order to avoid building a polished client on unreliable commerce foundations:

1. Discovery and operating-model decisions.
2. Type-check/CI baseline, PostgreSQL migration, API contracts, and staging.
3. Authentication and authorization hardening.
4. Mobile shell and catalog/cart.
5. Checkout, delivery rules, payment integration, and order lifecycle.
6. Operations console, notifications, and support workflows.
7. Security/quality gates, store submission, and controlled pilot.

The mobile app is ready for commercial rollout only when durable order/payment processing and fulfillment are proven end to end; a successful app-store build alone is not a launch gate.
