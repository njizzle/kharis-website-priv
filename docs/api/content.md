# Content studio API (`apps/content`)

Base URL: `https://content.kharis.org` (local: `http://localhost:3002`)

Most studio data access is **not** these HTTP routes. After sign-in, the browser
talks to Supabase directly with the user’s JWT (branches, events, testimonies,
messages, etc.). The routes below cover helpers that need a server: AI chat,
maps, R2 uploads, and sermon catalogue search.

Auth header (where required):

```http
Authorization: Bearer <supabase_access_token>
```

---

## `POST /api/chat`

Studio navigation helper (“Grace”).

**Auth:** required  
**Body:** `{ "messages": […], "page?": "…" }` (same turn limits as KP2 chat)

**Success:** `{ "ok": true, "reply": "…" }`  
**Errors:** `401` · `400` · `503` no Gemini key · `502`

**Supabase:** validates the JWT only. **External:** Gemini.

---

## `GET /api/sermons/search`

Search or hydrate sermons from the public messages catalogue on R2.

**Auth:** required  
**Query**

| Param | Notes                                          |
| ----- | ---------------------------------------------- |
| `q`   | Search string, max 80 chars (returns up to 12) |
| `ids` | Comma-separated ids, max 40                    |

Provide `q` **or** `ids`.

**Success:** `{ "sermons": [{ "id", "title", "speaker", "date", "scripture", "series" }] }`  
**Errors:** `401` · `502`

**Supabase:** auth only. **External:** R2 JSON catalogue
`https://pub-1cfba9da59dd4e03b1f867b35e26a1a4.r2.dev/messages.json`.

---

## `POST /api/uploads/branch`

Branch image folder ops against Cloudflare R2 (`kharis-images`).

**Auth:** required

### Mode A — upload file (multipart)

Form fields:

| Field      | Required | Notes                                      |
| ---------- | -------- | ------------------------------------------ |
| `branchId` | Yes      | Existing branch UUID                       |
| `category` | Yes      | `hero` \| `gallery` \| `venue` \| `pastor` |
| `file`     | Yes      | JPEG/PNG/WebP/GIF/AVIF, ≤ 8MB              |

**Success:** `{ "key", "publicUrl", "contentType" }`

### Mode B — ensure folder (JSON)

```json
{ "branchId": "<uuid>", "ensureFolder": true }
```

**Success:** `{ "key": "…" }`

### Mode C — prune unused objects (JSON)

```json
{ "branchId": "<uuid>", "prune": true }
```

or `"deleteFolder": true` for a fuller wipe. Uses Supabase `media` rows to
decide what is still referenced.

**Success:** `{ "removed": <number> }`

**Errors:** `401` · `400` · `404` unknown branch · `500` · `503` R2 not configured · `502` storage errors

**Supabase:** `SELECT` on `branches` (and `media` when pruning). Files land in R2, not Supabase Storage.

---

## `GET /api/geocode`

Address / reverse geocode for venue pins.

**Auth:** required — Bearer Supabase JWT (studio session). Also protect the Maps key with HTTP referrer / API restrictions.

**Query modes**

| Mode          | Params                         |
| ------------- | ------------------------------ |
| Reverse       | `lat` + `lng`                  |
| Exact address | `address=…`                    |
| Text search   | `q` or `address` (2–200 chars) |

**Success:** `{ "results": [{ "label", "address", "postcode", "city", "latitude", "longitude" }] }` (max 5)  
**Errors:** `401` · `400` · `503` missing `GOOGLE_MAPS_API_KEY` · `502`

**External:** Google Geocoding + Places Text Search. **Supabase:** JWT validation only.

---

## `GET /api/media/[...key]`

Proxies a branch image from R2 when the key starts with `browser-safe`
`branch-images/…` (path traversal rejected).

**Auth:** none (path-gated)  
**Success:** image bytes, `Cache-Control: public, max-age=86400`  
**Errors:** `404` · `502`

**No Supabase** — reads Cloudflare R2.

---

## Studio data that is _not_ Next API routes

Signed-in clients use Supabase JS against tables such as:

- `branches`, `venues`, `services`, `media`
- `events`, `news`, `testimonies`, `visitors`, `contact_messages`
- `newsletter_subscribers`, `sermons`, `daily_entries`, `daily_messages`
- `featured_videos`, `app_config`

Workspace switcher (`?workspace=general|app|kharis|kp2`) filters which rows the
studio shows. See [supabase.md](./supabase.md).

---

## Env checklist (API-related)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GOOGLE_MAPS_API_KEY=
GEMINI_API_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=kharis-images
R2_ENDPOINT=
R2_PUBLIC_URL=https://images.kharis.org
```
