# Kharis Website

npm-workspaces monorepo holding the Kharis sites and the content studio. They share a Supabase
project and nothing else — **no shared components, tokens, fonts or CSS.** Each
app owns its own design system and deploys independently.

| App            | Workspace         | Served at            | Worker           | Design system                                 |
| -------------- | ----------------- | -------------------- | ---------------- | --------------------------------------------- |
| `apps/main`    | `@kharis/main`    | `kharis.org`         | `kharis-main`    | Hand-rolled tokens (`--bg`/`--fg`/`--purple`) |
| `apps/kp2`     | `@kharis/kp2`     | `kharis.org/kp2`     | `kharis-kp2`     | Material Design 3 tokens + `tw-animate-css`   |
| `apps/content` | `@kharis/content` | `content.kharis.org` | `kharis-content` | Slate tokens, Maven Pro + DM Sans             |

## Why they are separate

The sites follow different brand identities and are built by different
sub-teams. The content studio is a third worker on its own subdomain so it
does not take a path on kharis.org the way KP2 does. Keeping them as separate
workspaces with separate Workers means either team can change design,
dependencies or deploy cadence without coordinating with the other.

Do not add a shared UI or token package. If something genuinely needs sharing,
it belongs in `packages/` and must be data or types, never presentation.

## Run

```bash
npm install          # once, from the repo root — installs every workspace

npm run dev:main     # kharis.org              → localhost:3000
npm run dev:kp2      # kharis.org/kp2          → localhost:3000/kp2
npm run dev:content  # content.kharis.org      → localhost:3002
```

Each app has its own `.env.example`. Copy it to `.env.local` for builds, and
fill `.dev.vars` for the Workers runtime (`npm run preview -w @kharis/<app>`).

## Deploy

Each app deploys to Cloudflare Workers via OpenNext:

```bash
npm run deploy:main
npm run deploy:kp2
npm run deploy:content
```

Routes are **commented out** in each `wrangler.jsonc` until cutover. Until you
uncomment them, deploys publish to `*.workers.dev` and leave production alone.

`apps/kp2` sets `basePath: "/kp2"`. On the Cloudflare side the more specific
route (`kharis.org/kp2*`) takes precedence over `kharis.org/*`, so those two
Workers can share the apex host.

`apps/content` has no `basePath`. Its route is the subdomain
`content.kharis.org/*` on the same zone, so studio URLs stay at the root of
that host (`/branches`, `/events`) instead of under a path.

## Shared

- `supabase/` — migrations for the Supabase project the apps share.
  Testimonies and other rows are scoped by a `workspace` discriminator
  (`general` | `app` | `kharis` | `kp2`). The content studio edits those rows.

## Docs

- [API & Supabase overview](docs/api/README.md) — how the apps share one
  Supabase project, plus endpoint reference for main, KP2, and the content studio.
