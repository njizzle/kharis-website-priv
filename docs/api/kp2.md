# KP2 site API (`apps/kp2`)

Base URL: `https://kharis.org/kp2` (local: `http://localhost:3000/kp2`)

Next.js `basePath` is `/kp2`, so every route is served under that prefix.
All routes are **public**.

Workspace constant: `SITE_WORKSPACE = "kp2"` (`lib/site.ts`). Public reads also
include `general`.

---

## `POST /kp2/api/contact`

Contact form → `contact_messages` with `workspace: "kp2"`.

**Body (JSON)**

| Field     | Required | Notes                                                                |
| --------- | -------- | -------------------------------------------------------------------- |
| `name`    | Yes      | Split into first/last                                                |
| `email`   | Yes      |                                                                      |
| `phone`   | No       |                                                                      |
| `topic`   | Yes      | `Sunday visit`, `Prayer`, `Pastoral`, `Baptism`, `Giving`, `General` |
| `branch`  | No       | Matched against `branches.name` when possible                        |
| `message` | Yes      | Min 8 chars; `From: KP2` line prepended                              |

**Success:** `{ "ok": true }`  
**Errors:** `400` · `503` missing service role / URL · `500` insert failure

**Supabase:** publishable `SELECT` on `branches`; **service role** `INSERT` into
`contact_messages` (`branch_id` / `branch_name` when matched).

---

## `POST /kp2/api/visit`

Plan-a-visit → `visitors` (site tagged KP2).

**Body:** same shape as main (`name`, `email`, `phone?`, `branch?`, `gathering?`,
`children?`, `consent: true`).

**Success:** `{ "ok": true }`  
**Errors:** `400` · `503` · `500`

**Supabase:** service-role insert.

---

## `POST /kp2/api/newsletter`

Email subscribe → `newsletter_subscribers`.

**Body:** `{ "email": "…" }` (lowercased, max 254)

**Success:** `{ "ok": true }` — also treated as success when the email already exists (`409` from Supabase).

**Errors:** `400` · `503` · `500`

**Supabase:** insert `{ email, source: "kp2" }` with service role.

---

## `POST /kp2/api/testimonies`

Testimony form → unpublished `testimonies` row with `workspace: "kp2"`.

Unlike main, this route uses the **publishable** key and relies on the live RLS
policy `"testimonies anon submit"` (forces unpublished).

**Body (JSON)**

| Field                                           | Required | Notes                                                                                                                                                                               |
| ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstName`, `lastName`, `details`, `anonymous` | Yes      |                                                                                                                                                                                     |
| `category`                                      | Yes      | Fixed set: Deliverance, Education, Family/Marriage, Finances/Miracle Money, Health/Healing, Housing/Mortgage, Job/Career, Safe Passage/Protection, Salvation, Unusual Favour, Other |
| `preferredName`, `mobile`                       | No       |                                                                                                                                                                                     |

**Success:** `201` `{ "success": true, "id": "…" }`  
**Errors:** `400` · `500`

---

## `POST /kp2/api/chat`

Grace chatbot for KP2 (JSON response, not SSE).

**Body:** `{ "messages": […], "page?": "/kp2/…" }`  
Max 12 turns; content ≤ 1500 chars.

**Success:** `{ "ok": true, "reply": "…" }`  
**Errors:** `400` · `503` missing `GEMINI_API_KEY` · `502` Gemini failure

Uses site knowledge helpers; **no direct Supabase table writes**.

---

## Env checklist (API-related)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # contact, visit, newsletter
GEMINI_API_KEY=              # /kp2/api/chat
```

> Note: older comments in `.env.example` said KP2 needed no service role. That is
> only true for testimony submit. Contact, visit, and newsletter require
> `SUPABASE_SERVICE_ROLE_KEY`.
