# Main site API (`apps/main`)

Base URL: `https://kharis.org` (local: `http://localhost:3000`)

All routes below are **public** (no auth). Writes that touch Supabase use
`SUPABASE_SERVICE_ROLE_KEY` on the server.

---

## `POST /api/contact`

Saves a contact form message into `contact_messages`.

**Body (JSON)**

| Field                          | Required | Notes                                                                                          |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `name` **or** `first` / `last` | Yes      | Name max 120 chars                                                                             |
| `email`                        | Yes      | Valid email, max 254                                                                           |
| `phone`                        | No       | Max 40                                                                                         |
| `topic`                        | Yes      | One of: `Sunday visit`, `Prayer`, `Giving`, `Pastoral`, `General`, `Chat follow-up`, `Baptism` |
| `branch`                       | No       | Branch name (max 120)                                                                          |
| `branchId`                     | No       | UUID; preferred when the form knows the id                                                     |
| `message`                      | Yes      | Min 8, max 12000 chars                                                                         |
| `chatTicket`                   | No       | Grace handoff id (max 64)                                                                      |
| `chatTranscript`               | No       | Max 6000 chars                                                                                 |

**Success:** `{ "ok": true, "id": "<uuid>" }`  
In local dev without Supabase credentials: also `"storage": "local-development"`.

**Errors:** `400` validation · `500` config / insert failure

**Supabase:** reads `branches` to resolve the branch and workspace; inserts into
`contact_messages`. If the branch is a KP2 location, `workspace` is set to
`kp2`; otherwise `kharis`. A `From: Main site` line is prepended to the message.

---

## `POST /api/visit`

Plan-a-visit submissions → `visitors`.

**Body (JSON)**

| Field       | Required | Notes          |
| ----------- | -------- | -------------- |
| `name`      | Yes      | Max 120        |
| `email`     | Yes      | Max 254        |
| `phone`     | No       | Max 40         |
| `branch`    | No       | Max 120        |
| `gathering` | No       | Max 160        |
| `children`  | No       | Boolean        |
| `consent`   | Yes      | Must be `true` |

**Success:** `{ "ok": true }`  
**Errors:** `400` · `500`

**Supabase:** service-role insert into `visitors`. Site tagged as Main site in the stored message.

---

## `POST /api/testimonies`

Testimony form → unpublished row in `testimonies` (`workspace: "kharis"`).

**Body (JSON)**

| Field           | Required | Notes                                                                                                                                                                                             |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstName`     | Yes      | Max 80                                                                                                                                                                                            |
| `lastName`      | Yes      | Max 80                                                                                                                                                                                            |
| `category`      | Yes      | Fixed set (same as KP2): Deliverance, Education, Family/Marriage, Finances/Miracle Money, Health/Healing, Housing/Mortgage, Job/Career, Safe Passage/Protection, Salvation, Unusual Favour, Other |
| `details`       | Yes      | Full story, max 8000                                                                                                                                                                              |
| `preferredName` | No       | Used as display name when set (max 80)                                                                                                                                                            |
| `mobile`        | No       | Stored as `phone` (max 40)                                                                                                                                                                        |
| `anonymous`     | No       | `"Yes"` marks `is_anonymous`                                                                                                                                                                      |

**Success:** `201` `{ "success": true, "id": "<uuid>" }`  
**Errors:** `400` missing fields · `500`

New rows are always `is_published: false` until reviewed in the studio.

---

## `POST /api/chat`

Grace chatbot for the main site (Life / messages context).

**Body (JSON)**

```json
{ "messages": [{ "role": "user" | "assistant", "content": "…" }] }
```

- Max 16 messages; each content ≤ 2000 characters
- Last message must be `user`

**Success (with `GEMINI_API_KEY`):** Server-Sent Events (`text/event-stream`)

- `{ "type": "chunk", "text": "…" }`
- `{ "type": "done", "reply": "…", "cards": [{ "id", "title", "url", "thumbnail" }] }`
- `{ "type": "error", "error": "…" }` on stream failure

**Success (no Gemini key):** JSON `{ "ok": true, "reply": "…", "cards": […] }` using offline heuristics.

**Errors:** `400` · `502` (before stream starts)

**External:** Google Gemini; YouTube for pastor message cards. **No Supabase writes.**

---

## `GET /api/events`

Public event list for the site calendar UI.

**Success:** `{ "events": [ { "id", "title", "date", "time", "timezone", "city", "location", "address", "description", "image", "category", "featured?" } ] }`

**Source:** WordPress REST (`ajde_events`), cached about 1 hour — **not** the Supabase `events` table. (Page data elsewhere can still read Supabase events via `lib/events.ts`.)

---

## `GET /api/department-videos/[id]`

Streams a known department video by Google Drive file id.

- Forwards `Range` (supports `206` partial content)
- Unknown ids → `404`
- Upstream failure → `502`

**No Supabase.**

---

## `GET /api/department-videos/[id]/poster`

Poster/thumbnail image for a known department video. Cached ~1 hour.

**No Supabase.**

---

## Env checklist (API-related)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=          # /api/chat
YOUTUBE_API_KEY=         # richer chat / messages library
```
