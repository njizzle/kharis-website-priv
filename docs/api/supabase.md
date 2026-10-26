# How the apps integrate with Supabase

All three workspaces (`apps/main`, `apps/kp2`, `apps/content`) point at the
**same** Supabase project. That project is the content database and auth
provider. Migrations that live in this repo sit under `supabase/migrations/`;
most tables already exist in the hosted project and are reflected in app TypeScript
rather than full SQL dumps here.

## Roles of each app

| App                | Role toward Supabase                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Content studio** | Authenticated CMS. Editors sign in with Supabase Auth, then read/write almost every content table with the **publishable** key (gated by RLS for signed-in users). Branch photos go to Cloudflare R2; some media also use the Supabase Storage bucket `content`. |
| **Main site**      | Public reader of branches, events, testimonies, etc. Form POSTs use the **service role** key only inside Next.js route handlers.                                                                                                                                 |
| **KP2 site**       | Same pattern as main, scoped to KP2/`general`. Contact, visit, and newsletter inserts use the **service role**. Testimony inserts use the **publishable** key plus an RLS policy that forces `is_published = false`.                                             |

## Keys and environment variables

| Variable                               | Where                    | Purpose                                                                   |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | All apps                 | Project URL                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All apps                 | Anon/publishable key for reads (and studio writes / KP2 testimony submit) |
| `SUPABASE_SERVICE_ROLE_KEY`            | Main + KP2 (server only) | Bypasses RLS for contact, visit, newsletter (KP2), testimonies (main)     |

Never expose the service role key to the browser or put it in `NEXT_PUBLIC_*`.

### Client helpers

- **Main** — `apps/main/src/lib/supabase.ts`: `@supabase/supabase-js` with the publishable key. API routes create a **separate** service-role client when inserting.
- **KP2** — `apps/kp2/lib/supabase.ts`: thin REST helpers (`supabaseSelect` / `supabaseInsert`) over `fetch`, no JS SDK dependency.
- **Content** — `apps/content/lib/supabase.ts`: browser/client singleton with session persistence. Server upload routes validate `Authorization: Bearer <access_token>` via `studio-auth.ts`.

## Workspace discriminator

Canonical IDs live in `apps/content/lib/workspaces.ts`:

| Workspace | Meaning             | Typical consumers                                  |
| --------- | ------------------- | -------------------------------------------------- |
| `general` | Shared base content | Included by main and KP2 where filters allow       |
| `app`     | Mobile app content  | Studio “Mobile App” mode (not the public websites) |
| `kharis`  | Main website        | `apps/main`                                        |
| `kp2`     | KP2 website         | `apps/kp2`                                         |

### How scoping shows up in practice

1. **Tables with a `workspace` column** — e.g. testimonies, news, contact messages, branches, featured videos, daily entries.
2. **Events** also have a `sites[]` array (`kharis` | `kp2` | `app` | `general`). Empty `sites` means unpublished. A site that includes `general` is visible on every public site that queries for it.
3. **`general` is inclusive** — main testimonies query `workspace in (kharis, general)`; KP2 uses `kp2` + `general`.
4. **Contact from the main site** can still land in the KP2 inbox: if the chosen branch is a KP2 location, the message’s `workspace` becomes `kp2`.
5. **Visitors** are not workspace-scoped in the schema; the submitting site is written into the message text (`From: Main site` / `From: KP2`).
6. **Newsletter** uses a `source` field (e.g. `kp2`), not `workspace`.

## Tables the apps use

| Table                                                                                 | Main                         | KP2                  | Content studio        |
| ------------------------------------------------------------------------------------- | ---------------------------- | -------------------- | --------------------- |
| `branches` (+ `venues`, `services`)                                                   | Read                         | Read (KP2 locations) | Full CRUD             |
| `media`                                                                               | Read (gallery URLs)          | Read                 | CRUD; prune on upload |
| `events`                                                                              | Read (by `sites`)            | Read                 | CRUD                  |
| `testimonies`                                                                         | Read + POST submit           | Read + POST submit   | Review / publish      |
| `visitors`                                                                            | POST submit                  | POST submit          | Inbox                 |
| `contact_messages`                                                                    | POST submit                  | POST submit          | Inbox                 |
| `newsletter_subscribers`                                                              | —                            | POST subscribe       | Inbox                 |
| `news`, `featured_videos`, `daily_entries`, `daily_messages`, `sermons`, `app_config` | Varies / mostly studio + app | Varies               | CRUD by workspace     |

Repo migrations:

- `001_contact_messages.sql` — contact inbox table; RLS on, no public policies (service role writes).
- `002_daily_entries.sql` — daily reading/prayer; public read, authenticated write.

Other tables live in the hosted project; treat app repos/types as the living schema reference until more SQL is checked in.

## Auth

Only the **content studio** uses Supabase Auth (email/password). Public sites have no end-user login. Studio API routes that must be private check:

```http
Authorization: Bearer <supabase_access_token>
```

The server calls `auth.getUser(token)` with the publishable key. No service role is used in the content app.

## Storage split

| Asset                                         | Store                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Branch hero / gallery / venue / pastor photos | Cloudflare R2 bucket `kharis-images` → `https://images.kharis.org/…` |
| Generic studio media uploads                  | Supabase Storage bucket `content`                                    |
| Department videos (main)                      | Proxied from Google Drive via `/api/department-videos`               |

Published photo URLs on the websites should use the R2/custom domain, not local paths. See `AGENTS.md` and `docs/performance/picture-migration.md`.

## Data flow (forms)

```
Browser form
  → POST /api/contact|visit|testimonies|newsletter  (same origin as the site)
    → validate + tidy payload
    → Supabase insert (service role, or publishable+RLS for KP2 testimonies)
      → row appears in Content Studio inbox / review queue
```

Public pages that **display** content (locations, events, published testimonies) query Supabase directly from server components/libs with the publishable key — they do not go through these form APIs.

## Security checklist

Treat the **publishable key as public**. Anyone can call PostgREST with it. App-layer filters
(`.eq("is_published", true)`, empty `sites[]`, etc.) are **not** a security boundary — RLS is.

### Auth & keys

- [ ] Supabase Auth signup is **invite-only / disabled** for the public. Studio has no
      role claims; any Auth user who can sign in can use whatever authenticated RLS allows.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists only in server env / Worker secrets — never
      `NEXT_PUBLIC_*`, never in the browser.
- [ ] Google Maps and Gemini keys are server-only; Maps key is referrer/IP restricted.

### RLS (live project)

Repo migrations only cover a thin slice. Confirm the live dashboard matches
[rls-checklist.md](./rls-checklist.md), then export policies into `supabase/migrations/`
when you can.

Minimum expectations:

- Anon **cannot** `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `contact_messages`, `visitors`,
  or `newsletter_subscribers` (service-role form APIs only).
- Anon **cannot** `SELECT` unpublished testimonies (or rows with phones) unless you
  intentionally allow it; public reads should require `is_published = true`.
- If KP2 keeps anon testimony insert, the policy must force `is_published = false` and
  lock `workspace` / featured flags (or prefer service-role insert like main).
- Authenticated write policies on inbox / publish tables should not be blanket
  `using (true)` for every Auth user unless the project is invite-only editors only.

### Public form APIs

- [ ] Rate-limit `POST /api/contact`, `/api/visit`, `/api/testimonies`, and
      `/kp2/api/newsletter` at Cloudflare (or add Turnstile). Service-role inserts bypass RLS,
      so the route is the only spam backstop.
- [ ] Never return submitted PII in success JSON (keep `ok` + `id`).
- [ ] Prefer service-role inserts with a fixed server payload over anon insert for forms.

### App filters (defence in depth)

- Main and KP2 testimony reads must require `is_published = true` (main does this in
  `apps/main/src/lib/testimonies.ts`; KP2 already did).
- Events: prefer RLS so drafts with empty `sites` are not anon-readable; do not rely only
  on filtering in JS after a broad fetch.
