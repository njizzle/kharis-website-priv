# API & Supabase documentation

Plain-language reference for how the three apps talk to each other and to the
shared Supabase project.

| Doc | What it covers |
| --- | --- |
| [Supabase integration](./supabase.md) | Shared database, workspaces, keys, who reads/writes what |
| [Main site APIs](./main.md) | `kharis.org` — `/api/*` |
| [KP2 site APIs](./kp2.md) | `kharis.org/kp2` — `/kp2/api/*` |
| [Content studio APIs](./content.md) | `content.kharis.org` — `/api/*` |

## Big picture

```
Content Studio (signed-in editors)
        │  Supabase Auth + publishable key
        │  CRUD on shared tables
        ▼
   One Supabase project
   (branches, events, testimonies, messages, …)
        │
   ┌────┴────┐
   ▼         ▼
 Main site   KP2 site
 (public)    (public)
 read with publishable key
 write via Next.js /api routes
```

- The three apps **share one Supabase project**. They do **not** share UI,
  tokens, or CSS.
- Rows are scoped with a **`workspace`** field: `general` | `app` | `kharis` | `kp2`.
- Public sites mostly **read** content that the studio publishes. Form
  submissions (contact, visit, testimony, newsletter) go through each site’s
  `/api` routes so secrets never sit in the browser.

## Quick endpoint map

| App | Base URL | Auth on `/api` |
| --- | --- | --- |
| Main | `https://kharis.org` | None (all public) |
| KP2 | `https://kharis.org/kp2` | None (all public) |
| Content | `https://content.kharis.org` | Bearer JWT on chat, sermon search, uploads |

Local ports: main and KP2 on `localhost:3000` (KP2 under `/kp2`); content on
`localhost:3002`.
