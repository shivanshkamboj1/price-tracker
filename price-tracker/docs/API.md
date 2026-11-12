# API reference

Base URL: `/api`. All requests and responses are JSON.

## Conventions

### Response envelope

Every response uses one of two shapes.

```jsonc
// success
{ "success": true, "data": { }, "meta": { } }   // meta only on list endpoints

// failure
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ ] },
  "requestId": "0f1c…"
}
```

`requestId` also comes back in the `x-request-id` response header and appears in
the server logs, so a user-reported failure can be traced to one log line.

### Error codes

| Code | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed or contradictory input |
| `VALIDATION_ERROR` | 422 | Schema validation failed; `details` lists `{ path, message }` |
| `UNAUTHORIZED` | 401 | Missing, expired or invalid session |
| `FORBIDDEN` | 403 | Authenticated but not permitted (includes CSRF failures) |
| `NOT_FOUND` | 404 | No such resource *for this user* |
| `CONFLICT` | 409 | Duplicate email, duplicate tracker, per-user limit reached |
| `RATE_LIMITED` | 429 | Rate limit or manual-check budget exhausted |
| `UNSUPPORTED_MARKETPLACE` | 400 | The URL is not a supported marketplace product link |
| `UPSTREAM_UNAVAILABLE` | 502/503 | A marketplace or data provider could not be reached |
| `INTERNAL_ERROR` | 500 | Unexpected failure; the message is generic in production |

A resource belonging to another user returns **404**, never 403 — existence is not
disclosed.

### Money

Requests and responses use **major units** (rupees) as numbers: `19999`, `1299.50`.
Storage is integer minor units (paise); the conversion happens at the API edge.

### Authentication

Three cookies are set on register, login and refresh:

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `pt_access` | yes | short-lived access token (15 min) |
| `pt_refresh` | yes | single-use refresh token, scoped to `/api/auth` |
| `pt_csrf` | **no** | read by the SPA and echoed in `x-csrf-token` |

Send `credentials: 'include'` (axios `withCredentials: true`), and on every
`POST`/`PATCH`/`DELETE` include the header:

```
x-csrf-token: <value of the pt_csrf cookie>
```

Missing or mismatched: `403 FORBIDDEN`.

When a request returns 401, `POST /api/auth/refresh` once and retry. The bundled
axios client does this transparently.

### Rate limits

| Scope | Limit |
|---|---|
| All API requests | 300 / minute |
| Login, refresh, change password | 10 / 15 minutes per IP |
| Registration | 5 / hour per IP |
| Writes (create, update, delete) | 60 / minute per user |
| Manual checks | 20 / hour per user (also enforced as a Redis budget) |

---

## Authentication

### `POST /api/auth/register`

```jsonc
{
  "email": "you@example.com",
  "password": "at least twelve characters",
  "name": "Your Name",
  "phone": "+919876543210",     // optional, E.164, needed for alerts
  "timezone": "Asia/Kolkata"    // optional, IANA name
}
```

`201` → `{ "user": { … }, "csrfToken": "…" }`. Sets the three cookies.

### `POST /api/auth/login`

```jsonc
{ "email": "you@example.com", "password": "…" }
```

`200` → `{ "user": { … }, "csrfToken": "…" }`.
A wrong password and an unknown account return the identical `401` body.

### `POST /api/auth/refresh`

No body. Requires the `pt_refresh` cookie and the CSRF header. Rotates the refresh
token — the presented one is revoked, so a stolen token stops working as soon as
either party uses it.

### `POST /api/auth/logout`

Revokes the refresh token and clears the cookies. `200`.

### `GET /api/auth/me`

`200` → `{ "user": { … } }`.

### `POST /api/auth/change-password`

```jsonc
{ "currentPassword": "…", "newPassword": "at least twelve characters" }
```

Invalidates every session, including the caller's. `200` →
`{ "passwordChanged": true, "reauthenticationRequired": true }`.

### `POST /api/auth/sign-out-everywhere`

Revokes all refresh tokens and bumps the token version. `200`.

---

## Products

All product routes require authentication and are scoped to the caller.

### `POST /api/products`

```jsonc
{
  "productUrl": "https://www.amazon.in/dp/B0CHWRXH8B",
  "targetPrice": 19999,
  "checkInterval": 360,               // minutes: 15 30 60 180 360 720 1440
  "nickname": "AirPods for Dad",      // optional
  "notificationChannel": "telegram",  // optional: telegram | whatsapp | sms | call | none
  "alertMode": "once",                // optional: once | always
  "alertRules": {                     // optional; each key overrides the account default
    "dropPercent": 10,                //   0 = off, 1–90
    "allTimeLow": true,
    "backInStock": true
  },
  "comparisonGroup": "airpods-pro",   // optional
  "marketplace": "amazon_in"          // optional, cross-checked only
}
```

`ProductDto.alertRules` returns the overrides, with `null` for "use the account
default".

The marketplace is **derived from the URL host**. A `marketplace` value that
disagrees is rejected with `400`; it is never trusted as the source of truth. The
URL is canonicalised — affiliate tags, session ids and referrer parameters are
stripped — so the same product added from two different links is recognised as one.

`201` → `{ "product": ProductDto, "message": "…" }`

No marketplace request happens during this call. The product is created in a
pending state and a high-priority check job is enqueued; the card fills in once the
worker completes it.

Errors: `400 UNSUPPORTED_MARKETPLACE`, `409 CONFLICT` (already tracking, or the
per-user limit), `422 VALIDATION_ERROR`.

### `POST /api/products/preview`

```jsonc
{ "productUrl": "https://www.flipkart.com/…/p/itm…?pid=…" }
```

Parses and canonicalises a URL **without contacting the marketplace**, so the Add
Product form can validate as the user types.

`200` → `{ "marketplace", "marketplaceLabel", "externalProductId", "canonicalUrl", "dataSource" }`

### `GET /api/products`

Query: `page`, `limit` (≤100), `status`, `marketplace`, `search`,
`sort` (`newest` | `priceAsc` | `priceDesc` | `closestToTarget`).

`search` is escaped before it reaches Mongo, so it can never act as a regex.

`200` → `{ "data": ProductDto[], "meta": { "total", "page", "limit", "pages" } }`

### `GET /api/products/:id`

`200` → `{ "product": ProductDto, "stats": PriceStats }` (all-time statistics).

### `PATCH /api/products/:id`

Any subset of:

```jsonc
{
  "targetPrice": 17500,
  "checkInterval": 720,
  "nickname": "New name",        // null clears it
  "notificationChannel": "sms",
  "alertMode": "always",
  "alertRules": { "dropPercent": null, "backInStock": false }, // null = account default
  "comparisonGroup": null,
  "status": "paused"             // active | paused only
}
```

Changing `targetPrice` re-arms alerts. Setting `status: "active"` clears the
failure counter and schedules a prompt check. `200` → `{ "product": ProductDto }`.

### `PATCH /api/products/:id/settings`

Same as above, restricted to `checkInterval`, `notificationChannel`, `alertMode`,
`alertRules` and `comparisonGroup`.

### `DELETE /api/products/:id`

Deletes the product together with its price history and alerts. `204`.

### `POST /api/products/:id/check`

Queues an immediate check, bypassing the response cache. Never performs the check
inline.

`202` → `{ "queued": true, "jobId": "…", "remainingThisHour": 19 }`

`429` when the hourly budget is spent; scheduled checks continue regardless.

### `GET /api/products/:id/history`

Query: `range` = `24h` | `7d` | `30d` | `3m` | `all` (default `30d`).

```jsonc
{
  "range": "30d",
  "targetPrice": 19999,
  "currency": "INR",
  "points": [
    { "price": 24999, "currency": "INR", "availability": "in_stock",
      "checkedAt": "2026-08-04T09:12:33.921Z", "source": "public_page" }
  ],
  "stats": { "points": 42, "lowest": 19999, "highest": 26900,
             "average": 23140, "first": 26900, "last": 21499,
             "firstAt": "…", "lastAt": "…" }
}
```

A point is written on every successful check, including when the price is
unchanged, so the chart is continuous. Setting `HISTORY_DEDUPE_WINDOW_MIN` above
0 thins unchanged readings to at most one per window.

When a range holds more than 1,500 points, it is split into equal time buckets
and each bucket returns its lowest, highest and latest reading. Dips and spikes
are kept, and the last point is always the most recent check. `stats` is always
computed over every stored point in the range.

### `GET /api/products/compare`

Query: `ids` (comma separated, ≤6) **or** `group`.

Comparison is always explicit — by id or by a comparison group the user created.
Two listings are never treated as the same product because their titles look alike.

`200` → array of comparison rows.

### `GET /api/products/comparison-groups`

`200` → `[{ "group": "airpods-pro", "count": 2 }]`

---

## Notifications

### `GET /api/notifications`

Query: `page`, `limit`, `state` (`triggered` | `acknowledged` | `reset`),
`unreadOnly=true`.

`200` → `{ "data": Alert[], "meta": { "total", "unread", "page", "limit" } }`

Each alert has `type` (the headline trigger) and `reasons` (every trigger that
fired on that check, in priority order: `target_reached`, `all_time_low`,
`price_drop`, `back_in_stock`). `dropFromPrice` and `previousLowestPrice` are set
for drop and lowest-ever alerts.

### `PATCH /api/notifications/:id`

```jsonc
{ "state": "acknowledged", "read": true }
```

`state: "reset"` also re-arms the product so the next breach notifies again.

### `PATCH /api/notifications/read-all`

`200` → `{ "markedRead": 7 }`

---

## User

### `GET /api/user`

`200` → `{ "user": { … } }`

### `PATCH /api/user`

```jsonc
{ "name": "New Name", "phone": "+919876543210", "timezone": "Asia/Kolkata" }
```

`phone: null` removes the number. A changed number resets `phoneVerified`.

### `POST /api/user/notification-settings`

```jsonc
{
  "channel": "telegram",          // telegram | whatsapp | sms | call | none
  "alertMode": "once",            // once | always
  "minIntervalMinutes": 360,
  "quietHours": { "enabled": true, "startHour": 22, "endHour": 8 },
  "alertRules": { "dropPercent": 10, "allTimeLow": true, "backInStock": true } // any subset
}
```

`200` → `{ "notificationPrefs": { … } }`

### Telegram

An account can link up to 10 chats (people, groups or both). Every linked chat
receives every Telegram alert.

| Method | Path | |
|---|---|---|
| `GET` | `/api/user/telegram` | `{ configured, connected, botUsername, chats: [{ chatId, chatTitle, linkedAt }], maxChats }` |
| `POST` | `/api/user/telegram/link` | `{ botUsername, code, url, expiresAt }` — `url` is `https://t.me/<bot>?start=<code>`, valid 15 minutes, adds one chat |
| `DELETE` | `/api/user/telegram/link` | abandons an open link so its code stops working |
| `POST` | `/api/user/telegram/verify` | `{ connected, chat }` — poll until `connected` |
| `POST` | `/api/user/telegram/test` | body `{ chatId? }`; tests one chat, or all of them. `{ sent, failed: [{ chatId, reason }] }` |
| `DELETE` | `/api/user/telegram/chats/:chatId` | removes one chat; `{ chats }` |

Linking needs no webhook: `verify` reads the bot's pending updates with
`getUpdates` and adds the chat that sent `/start <code>`. To add another person,
share the link with them. A chat that links twice is refreshed, not duplicated. A
bot that already has a webhook set returns `400` with instructions to remove it.

Delivery is tracked per chat on the alert (`deliveries`). An alert is `sent` once
any chat has it, and a retry only messages the chats that failed.

### `GET /api/user/marketplace-sessions`

`200` → array of sessions. The encrypted artefact is **never** returned.

### `POST /api/user/marketplace-sessions`

```jsonc
{
  "marketplace": "amazon_in",
  "payload": "<opaque session artefact from the user's own browser>",
  "label": "Chrome on Windows",
  "expiresInDays": 14
}
```

The payload is screened and rejected with `400` if it contains anything resembling
a password, OTP, CVV or card number. What is stored is encrypted with AES-256-GCM.
The user signs in directly with the marketplace — this API never receives
marketplace credentials and the application never presents a marketplace login form.

### `DELETE /api/user/marketplace-sessions/:marketplace`

Erases the stored artefact. `200`.

---

## Dashboard

### `GET /api/dashboard/stats`

```jsonc
{
  "trackedProducts": 12, "activeProducts": 10, "pausedProducts": 1,
  "erroredProducts": 1, "priceDrops": 23, "alertsTriggered": 4,
  "unreadAlerts": 1, "belowTarget": 2,
  "bestSaving":      { "amount": 5900, "currency": "INR", "productId": "…", "title": "…" },
  "lowestPriceFound":{ "price": 18499, "currency": "INR", "productId": "…", "title": "…" },
  "byMarketplace": [ { "marketplace": "amazon_in", "count": 8 } ],
  "nextCheckAt": "2026-09-05T11:20:00.000Z"
}
```

`priceDrops` counts recorded decreases in the last 30 days, computed with a window
function in the database.

### `GET /api/dashboard/highlights`

The six products closest to (or furthest below) their target.

### `GET /api/dashboard/failures`

The caller's twenty most recent failed checks.

---

## System

### `GET /api/system/health` — administrators only

Queue depth, 24-hour check outcomes and average duration, failures by kind,
per-marketplace adapter and circuit-breaker state, and notification delivery
counts. Aggregate figures only — no user data.

### `GET /healthz` — unauthenticated

Liveness probe: `{ "status": "ok", "uptime": 1204 }`.

---

## ProductDto

```jsonc
{
  "id": "66f…", "marketplace": "amazon_in",
  "productUrl": "https://www.amazon.in/dp/B0CHWRXH8B",
  "externalProductId": "B0CHWRXH8B",
  "title": "Apple AirPods Pro (2nd generation)",
  "nickname": null, "imageUrl": "https://…",

  "currentPrice": 21499, "previousPrice": 22900, "targetPrice": 19999,
  "lowestPrice": 19999, "highestPrice": 26900, "currency": "INR",
  "differenceFromTarget": 1500, "percentFromTarget": 7.5, "isBelowTarget": false,

  "availability": "in_stock",      // in_stock | out_of_stock | unknown
  "status": "active",              // active | paused | unavailable | error | deleted
  "checkInterval": 360,
  "nextCheckAt": "…", "lastCheckedAt": "…", "lastPriceChangedAt": "…",

  "notificationChannel": null, "alertMode": null,
  "alertArmed": false, "alertCount": 2,

  "consecutiveFailures": 0, "errorKind": null, "errorMessage": null,
  "guidance": null,                // plain-language next step when checks fail

  "comparisonGroup": null,
  "createdAt": "…", "updatedAt": "…"
}
```

`currentPrice` is `null` until the first check completes.
