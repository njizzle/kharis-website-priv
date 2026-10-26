# Required live RLS inventory

Policies for most tables live in the **hosted Supabase project**, not yet in
`supabase/migrations/`. Use this checklist when auditing the dashboard (Authentication →
Providers, and Authentication / Table Editor → RLS). Export confirmed policies into SQL
migrations when you can so the repo matches production.

## Auth project settings

| Setting            | Expected                                              |
| ------------------ | ----------------------------------------------------- |
| Email signup       | Disabled or invite-only (no public self-serve signup) |
| Anonymous sign-ins | Disabled                                              |
| Service role key   | Server secrets only                                   |

Studio ACL today is “any signed-in Auth user” + RLS. There are no admin role claims in
the apps.

## Table policies

### Inbox / PII (deny anon)

| Table                    | Anon                           | Authenticated                                   | Notes                                                                                              |
| ------------------------ | ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `contact_messages`       | No SELECT/INSERT/UPDATE/DELETE | Editors only (or service role for site inserts) | Repo `001_contact_messages.sql` enables RLS and drops public access; site inserts use service role |
| `visitors`               | No access                      | Editors only                                    | Site inserts use service role                                                                      |
| `newsletter_subscribers` | No access                      | Editors only                                    | KP2 insert uses service role                                                                       |

### Testimonies

| Role          | Expected                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anon SELECT   | Only rows with `is_published = true` (safe columns). Prefer denying `phone` to anon                                                                                                                                                             |
| Anon INSERT   | **Prefer none.** If `"testimonies anon submit"` remains for KP2, `WITH CHECK` must force `is_published = false`, `is_featured = false`, `is_featured_giving = false`, and a fixed `workspace` (or reject client-supplied publish/feature flags) |
| Authenticated | Full review/publish for invite-only editors; avoid unrestricted `using (true)` if signup could ever open                                                                                                                                        |

Main site form inserts use the **service role** with a hardcoded unpublished payload.
KP2 still posts with the publishable key — direct `/rest/v1/testimonies` calls are the
attack surface unless RLS is tight.

### Public content reads

| Table                                      | Anon SELECT expectation                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branches` / `venues` / `services`         | Active / intended public location data only                                                                                                                |
| `media`                                    | Public gallery URLs only as needed                                                                                                                         |
| `events`                                   | Only rows meant for public sites (e.g. non-empty `sites` overlapping public targets). Do not leave drafts readable just because the app filters them in JS |
| `news`, `featured_videos`, `daily_entries` | Published / intended public rows; `daily_entries` repo policy currently allows anon SELECT all — confirm that is acceptable                                |
| `sermons`                                  | As intended for catalogue consumers                                                                                                                        |

### Storage

| Bucket                       | Expectation                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `content` (Supabase Storage) | Upload/delete for authenticated editors only; public read only if objects are meant to be public        |
| R2 `kharis-images`           | Public read for published `branch-images/…`; writes only via authenticated studio `/api/uploads/branch` |

## After changing live policies

1. Re-test main contact, visit, testimony forms.
2. Re-test KP2 contact, visit, newsletter, testimony forms.
3. Re-test studio sign-in and editing each workspace.
4. Attempt anon REST: `SELECT` on `contact_messages` / unpublished `testimonies` should fail;
   anon `INSERT` of a published testimony should fail.
5. Commit the SQL into `supabase/migrations/` so the next environment matches.
