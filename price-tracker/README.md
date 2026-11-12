# Pricewatch — Amazon India & Flipkart price tracker

Track product prices across Amazon India and Flipkart, keep a full price history,
and get a Telegram, WhatsApp or SMS alert the moment a product reaches the price you
set, drops sharply, hits a new low or comes back in stock.

Built on the MERN stack with a real job pipeline: the API never performs a price
check, a scheduler decides what is due, and a pool of workers does the work
behind a marketplace-adapter interface.

---

## Contents

- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Deploying](#deploying)
- [How prices are collected](#how-prices-are-collected)
- [Marketplace sessions](#optional-marketplace-sessions)
- [Alerting rules](#alerting-rules)
- [Failure handling](#failure-handling)
- [Security](#security)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Scaling](#scaling)
- [Adding a marketplace](#adding-a-marketplace)
- [Environment variables](#environment-variables)

---

## Architecture

```
                    ┌──────────────┐
   Browser ────────▶│  React SPA   │  Vite · TypeScript · Tailwind · Recharts
                    └──────┬───────┘
                           │  cookies (HTTP-only) + CSRF header
                    ┌──────▼───────┐
                    │  Express API │  auth · CRUD · dashboard queries
                    └──┬────────┬──┘
                       │        │  enqueue only — never fetches a marketplace
              ┌────────▼──┐  ┌──▼──────────┐
              │  MongoDB  │  │    Redis    │  BullMQ · locks · rate budget · cache
              └────────▲──┘  └──┬───────┬──┘
                       │        │       │
                ┌──────┴────────▼─┐  ┌──▼──────────────┐
                │    Scheduler    │  │  Price worker   │  ×N replicas
                │ finds due items │  │                 │
                └─────────────────┘  └──┬──────────────┘
                                        │
                              ┌─────────▼──────────┐
                              │ MarketplaceAdapter │  interface
                              └───┬────────────┬───┘
                        AmazonAdapter      FlipkartAdapter
                                        │
                              ┌─────────▼──────────┐
                              │ NotificationService│──▶ Twilio (SMS / WhatsApp)
                              └────────────────────┘
```

Each box is a responsibility, and the boundaries are enforced:

| Component | Owns | Never does |
|---|---|---|
| **API server** | authentication, CRUD, dashboard queries, enqueueing | contact a marketplace, run a scheduled check |
| **Scheduler** | deciding which products are due | fetch prices, know what a marketplace is |
| **Worker** | running checks, updating state, raising alerts | know Amazon or Flipkart specifics |
| **Marketplace adapter** | obtaining and normalising product data | touch the database, send notifications |
| **Notification service** | delivering messages | decide *whether* an alert is warranted |
| **Frontend** | presentation | hold tokens, decide business rules |

Business logic lives in `server/src/services/`. Route handlers parse, delegate
and serialise; React components render.

---

## Quick start

### With Docker (recommended)

```bash
cp .env.example .env          # then edit the two secrets
docker compose up --build
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:4000>

Six services come up: `frontend`, `backend`, `worker`, `scheduler`, `mongodb`,
`redis`. The three server roles share one image and differ only in the process
they start.

### Without Docker

You need MongoDB and Redis running locally, plus Node 18+.

```bash
cp .env.example .env

cd server && npm install
npm run dev            # API on :4000

npm run dev:worker     # in a second terminal
npm run dev:scheduler  # in a third

cd ../client && npm install && npm run dev   # SPA on :5173
```

The Vite dev server proxies `/api` to the backend, so cookies stay first-party in
development exactly as they do in production.

### First run

1. Register at <http://localhost:5173/register> — add your mobile number in
   international format if you want alerts.
2. **Add product**, paste an Amazon India or Flipkart product URL, set a target
   price and a check frequency.
3. The first check is queued immediately; the card fills in within a minute.

---

## Deploying

One Linux server: PM2 runs the API, worker and scheduler (`ecosystem.config.js`),
nginx serves the built client and proxies `/api` (`deploy/nginx.conf`), and
certbot provides HTTPS — required, because production session cookies are
`Secure`. MongoDB and Redis run locally and listen on 127.0.0.1 only.

On the server, `.env` needs `NODE_ENV=production`, `FRONTEND_URL=https://<domain>`,
`APP_ACCESS_PASSWORD`, and fresh `JWT_SECRET` / `ENCRYPTION_KEY` values
(`openssl rand -hex 32`); the processes refuse to start with placeholders.

Every deploy, first or later, is one command. It pulls, builds both apps,
publishes the client to `/var/www/pricewatch`, builds database indexes
(production never builds them implicitly) and reloads PM2:

```bash
bash deploy/update.sh
```

---

## How prices are collected

Each adapter holds an ordered list of data sources and uses the first one that is
actually configured. `AMAZON_DATA_SOURCE` and `FLIPKART_DATA_SOURCE` choose the
mode:

| Mode | Source | When to use it |
|---|---|---|
| `official` | Amazon PA-API 5.0 / Flipkart Affiliate API | **Preferred.** Needs an approved partner account. |
| `provider` | A licensed third-party product-data provider | When you have a data contract but not a partner account. |
| `public` | The publicly reachable product page | Development, low volume, or where the marketplace permits it. Falls back to `official`/`provider` automatically when their credentials exist. |
| `disabled` | Nothing | Turns the adapter off. |

Moving from public pages to an official API is a change to `.env` — the worker,
the scheduler, the models and the UI are untouched.

### What the public source does, and does not, do

Every public request goes through one `HttpClient` that enforces:

- **robots.txt is honoured**, and cached for six hours. A disallowed path is not
  fetched. If robots.txt cannot be read at all, the request is not sent.
- **One honest User-Agent**: `PriceTrackerBot/1.0 (+<CRAWLER_CONTACT>)`. It is the
  same on every request and names a contact address.
- **A cluster-wide request budget** (`MARKETPLACE_RPM`, default 10/min for *all*
  workers combined), a **minimum gap** between requests and **random jitter**, all
  coordinated in Redis so extra worker replicas do not multiply the load.
- **Timeouts, capped retries and exponential backoff with full jitter**, honouring
  `Retry-After`.
- **A circuit breaker**: after repeated refusals the marketplace is left alone for
  a cooldown period, then probed once.
- **A short response cache**, so two users tracking one product, or a manual check
  right after a scheduled one, do not produce two requests.

There is deliberately **no** CAPTCHA solving, fingerprint or header spoofing,
proxy rotation, stealth browser, or any other anti-bot evasion. If a marketplace
responds with a verification challenge, the check is recorded as `blocked`, the
product backs off, and the user is told. Higher volume is a matter of configuring
an official API or a data provider, not of trying harder.

---

## Optional marketplace sessions

Some accounts see different prices when signed in. If you need that, the design
is strict about where the credentials live:

- **You sign in directly with Amazon or Flipkart, in your own browser.** This
  application has no marketplace login form and never imitates one.
- A user-controlled companion (a browser extension or local profile) may hand the
  backend a minimal session artefact afterwards.
- That artefact is screened for credential-shaped content and rejected outright if
  it contains anything resembling a password, OTP, CVV or card number. What is
  kept is encrypted with AES-256-GCM before it reaches the database, is never
  returned to any client and is never logged.
- **Disconnect** erases the stored artefact, not just a flag.

Everything in the product works without this.

---

## Alerting rules

An alert fires when `currentPrice <= targetPrice` **and** the listing is not out of
stock. Two modes, per account and overridable per product:

- **Notify me once** — one alert per drop. The trigger re-arms only after the price
  climbs back above the target, so a product sitting below target does not send an
  alert on every poll.
- **Notify me whenever it drops below target again** — repeats, throttled by a
  configurable minimum gap.

### Smart alerts

Three more triggers, each set as an account default in Settings and overridable
per product:

| Trigger | Fires when | Default |
|---|---|---|
| **Price drops by X%** | the price is X% or more below its baseline — the highest price since the last drop alert, so a slow slide counts once it adds up | off |
| **New lowest price ever** | the price beats the lowest price recorded before this check | off |
| **Back in stock** | a listing that was out of stock is available again | on |

Each one is edge-triggered and throttled by the same minimum gap as repeat target
alerts. When several fire on one check they arrive as a single message, headlined
by the most important one.

**Quiet hours** hold an alert until the window ends rather than dropping it. Alerts
are persisted first and delivered by a separate queue, so a messaging outage never
loses one, and delivery retries on its own schedule.

### Channels

- **Telegram** — create a bot with [@BotFather](https://t.me/BotFather), set
  `TELEGRAM_BOT_TOKEN`, restart, then *Settings → Telegram → Connect* and tap
  **Start** in Telegram. No webhook or public URL is needed. Connect up to 10
  accounts or groups; each gets every alert. To add someone else, use *Add another
  Telegram account* and share the link. For a group, add the bot and send it the
  `/start <code>` shown on the settings page.
- **WhatsApp, SMS, phone call** — via Twilio, to the mobile number on your profile.

Twilio and Telegram credentials live only in the backend environment. Without
Twilio the app runs normally and logs the message it would have sent.

---

## Failure handling

A single bad check never marks a product permanently broken. The retry ladder is
**1 min → 5 min → 15 min → 1 hour → 6 hours**, and the status reflects *why*:

| Kind | Meaning | Behaviour |
|---|---|---|
| `temporary_error` | network, timeout, 5xx | back off and retry |
| `blocked` | refused, rate limited, challenged | back off; circuit breaker may open |
| `unavailable` | listing exists but has no price | keep the normal schedule |
| `not_found` | page is gone | stop retrying, ask the user to check the URL |
| `parse_error` | price not readable | stop retrying, suggest an official source |

After six consecutive failures automatic retries stop, the product is marked
*needs attention*, and the UI shows a plain-language next step with a one-click
**Resume tracking**.

---

## Security

- **Argon2id** password hashing (`@node-rs/argon2`, 64 MB memory cost). Login runs a
  verification even for unknown accounts so timing does not reveal which emails exist.
- **HTTP-only cookies** for the access and refresh tokens, `Secure` in production,
  `SameSite=Lax`. No token is ever readable by JavaScript.
- **Single-use refresh tokens**: only a SHA-256 hash is stored, and every refresh
  revokes the token it was given.
- **Double-submit CSRF protection** on every state-changing request.
- **Zod validation** on every body, query and route parameter; unknown keys are
  stripped, so client input can never reach Mongo unexamined. A separate
  sanitiser removes `$`-prefixed and dotted keys as defence in depth.
- **Authorization by construction**: every product, history, alert and session query
  is scoped by `userId`. Another user's product returns `404`, not `403`.
- **Helmet**, an allow-list CORS policy, and Redis-backed rate limits — global, and
  tighter ones on login, registration, writes and manual checks.
- **AES-256-GCM** encryption for stored marketplace session artefacts.
- **Secrets only from the environment**, validated at boot; the process refuses to
  start in production with placeholder values.
- **Structured logs with redaction** — passwords, tokens, cookies, Twilio
  credentials and session artefacts are censored at the logger, not by convention.

## Testing

```bash
cd server
npm test                # 115 tests
npm run test:unit
npm run test:integration
```

Integration tests run against an in-memory MongoDB, so indexes, aggregations and
schema validation are genuinely exercised. Redis and BullMQ are replaced by
in-process doubles, and marketplace adapters are stubbed — no network access and
no external services.

Coverage includes URL normalisation and marketplace detection, Indian price-format
parsing, the alert decision matrix, the retry ladder, encryption, the circuit
breaker, the distributed lock, the auth and CSRF flows, IDOR protection on every
product route, the full check pipeline (history dedupe, alert raising, re-arming,
backoff) and a scheduler tick.

---

## Project layout

```
price-tracker/
├── docker-compose.yml
├── .env.example
├── docs/API.md
├── server/
│   └── src/
│       ├── adapters/          # marketplace access, behind one interface
│       │   ├── amazon/        #   PA-API, public page, URL rules
│       │   ├── flipkart/      #   affiliate API, public page, URL rules
│       │   ├── http/          #   rate limiter, circuit breaker, robots, cache
│       │   ├── providers/     #   licensed data provider
│       │   ├── BaseAdapter.ts
│       │   ├── factory.ts
│       │   └── types.ts
│       ├── config/            # env, db, redis, logger, constants
│       ├── controllers/       # thin: parse, delegate, serialise
│       ├── middleware/        # auth, csrf, validate, sanitize, rate limit, errors
│       ├── models/            # Mongoose schemas and indexes
│       ├── queues/            # BullMQ queues and job types
│       ├── routes/
│       ├── scheduler/
│       ├── services/          # business logic
│       │   └── notification/  # NotificationService interface + Twilio
│       ├── utils/
│       ├── workers/
│       ├── app.ts   server.ts   worker.ts   scheduler.ts
│       └── ...
└── client/
    └── src/
        ├── charts/    components/   hooks/
        ├── layouts/   pages/        services/
        ├── types/     utils/
        └── App.tsx    main.tsx
```

---

## Scaling

```bash
docker compose up --scale backend=2 --scale worker=3
```

No code changes. What makes that safe:

- **A per-product Redis lock** — the same product is never checked by two workers at
  once.
- **Idempotent job ids** — a scheduler tick that overlaps a manual check produces one
  job, not two.
- **A shared rate budget** — three workers are as polite to a marketplace as one.
- **Optimistic claiming** — the scheduler pushes `nextCheckAt` forward as it claims a
  product, so a queued job is not enqueued again on the next tick.

Keep the scheduler a singleton; the Redis tick lock makes a second one harmless.

---

## Adding a marketplace

To support Croma, Myntra, Reliance Digital or Tata Cliq:

1. Add `'croma'` to `MARKETPLACES` in `server/src/config/constants.ts`.
2. Create `server/src/adapters/croma/` with a URL normaliser, at least one
   provider, and a `CromaAdapter extends BaseAdapter`.
3. Register it in `server/src/adapters/factory.ts`.

Nothing else changes — not the worker, not the scheduler, not the API, not the UI.

---

## Environment variables

`.env.example` documents every variable with its default. The essentials:

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT` | runtime mode and API port |
| `MONGO_URI`, `REDIS_URL` | data stores |
| `FRONTEND_URL` | CORS allow-list entry |
| `JWT_SECRET` | signs access tokens — 32+ characters |
| `ENCRYPTION_KEY` | 32 bytes hex; encrypts session artefacts |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | messaging credentials, backend only |
| `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` | sender identities |
| `AMAZON_DATA_SOURCE`, `FLIPKART_DATA_SOURCE` | which data source each adapter uses |
| `MARKETPLACE_RPM`, `MARKETPLACE_MIN_GAP_MS` | cluster-wide politeness limits |
| `MIN_CHECK_INTERVAL_MIN` | floor on how often a product may be checked (15 min) |

The process validates all of it at boot and refuses to start in production with
placeholder secrets.

---

## API

See [docs/API.md](docs/API.md) for the full reference: every endpoint, request and
response shape, error codes and the money-unit convention.
