# APaPSI — Figma Make to Lovable migration

## What the uploaded file actually contained

Not screenshots: the complete working source of APaPSI (79 files, ~8,500 lines). This is a real
full-stack application, not a mock-up. The original student spreadsheets were also recovered.

Recovered material:

| Item | Detail |
| --- | --- |
| Pages | Login, Dashboard, Mahasiswa, Penilaian, Penilaian detail, Nilai Akhir, Rubrik, Pengaturan, AI workspace, AI review |
| Design | DM Sans + DM Serif Display, navy `#193449` sidebar, teal accent, own component library (no generic template) |
| Backend | Express + PostgreSQL, 22 endpoints, session cookies + CSRF, audit log, optimistic concurrency |
| Rubric engine | A1, A2, B1–B7, C, D1, D2 — full criteria, ranges and descriptions, total exactly 100 |
| Real data | 4 rombel sheets with the actual 2024 student roster (NPM, name, study case) and a Rombel 2 legacy score sheet |
| AI | Intent-classifier architecture with human-confirmed plans, privacy redaction, audit trail — required Gemini/Claude/OpenAI keys |

Nothing in the original was fake: no mock arrays, no hardcoded final scores, no localStorage
persistence. So this is a platform migration, not a functionalisation job.

## Migration report

| # | Area | Finding | Action |
| --- | --- | --- | --- |
| 1 | Routes | `/login`, `/dashboard`, `/mahasiswa`, `/penilaian`, `/penilaian/:rombel/:npm`, `/nilai-akhir`, `/rubrik`, `/pengaturan` | Kept identical |
| 2 | Design | Own component set and palette | Ported verbatim into the Lovable design system |
| 3 | Database | 11 tables in plain PostgreSQL, no RLS | Recreated in Lovable Cloud with row-level security and grants |
| 4 | Auth | Username + password, hand-rolled sessions, CSRF tokens, forced first password change | Replaced by Lovable Cloud auth (see decision 1) |
| 5 | API | Express routes at `/api/*` | Replaced by server functions, same inputs, outputs and validation |
| 6 | Calculation | One central `calculate()` function | Ported byte-for-byte, no formula duplication |
| 7 | Excel | Import preview/commit and export, with a zip-bomb guard | Kept |
| 8 | Sessions/CSRF tables | Hand-rolled auth storage | Dropped; Cloud auth owns sessions |
| 9 | AI | Needed the user's own paid API key | See decision 2 |
| 10 | Risk | None of the original database rows can be reached (that database is gone) | Rebuilt from the recovered spreadsheets |

## Decisions I need from you

**1. How you sign in.** Cloud sign-in is email-based, so plain `admin` / `admin` cannot be kept
as-is. My plan: your account is `admin@apapsi.app` with a password you set on first use, and the
page still shows "APaPSI" branding exactly as before. Say the word if you want a different address
or your real email.

**2. The AI assistant.** The original needed your own paid Gemini/Claude/OpenAI key. Lovable has
built-in AI that needs no key, so I will rebuild the assistant on that — same safety model (it only
proposes a change, you confirm it, every action is logged). The provider picker in Pengaturan
becomes unnecessary and goes away.

**3. Student data.** I will load the real roster from your spreadsheet (about 72 students across
Rombel 1–4 with their study cases) plus the Rombel 2 scores already recorded, flagged as legacy
exactly as the original did. If you would rather start empty, tell me.

## Build plan

### Phase 1 — Foundations
Design system (done), rubric/calculation module (done), database schema, real roster and legacy
scores loaded as seed data, Cloud auth with your admin account, four rombel rows.

### Phase 2 — Server layer
Server functions replacing all 22 endpoints: students CRUD with soft delete, assessment save with
revision checks and per-component audit logging, dashboard aggregates, rubric config draft/publish
versioning, audit log reads, Excel import preview/commit and export.

### Phase 3 — Interface
Ported verbatim: component library, shell with sidebar/header/footer, Login, Dashboard, Mahasiswa,
Penilaian list and detail, Nilai Akhir, Rubrik, Pengaturan. Route guard so an unauthenticated
visitor always lands on sign-in, never the dashboard.

### Phase 4 — AI assistant
Command box and workspace on Lovable's built-in AI, with the plan/confirm/audit flow preserved.

### Phase 5 — Verification
Sign in and out, protected routes, student create/edit/delete persisting across refresh, scoring
every component A1 through D2, final totals recalculating, rubric publish, Excel round-trip, all
four rombel, desktop/tablet/mobile.

## Technical notes

- TanStack Start routes under `src/routes`, `_authenticated` layout for the gate; `/` serves Login.
- `src/lib/domain.ts` is the original `shared/domain.ts` unchanged — single source for `calculate`,
  `validateConfig`, `validateAssessment`, `initialConfig`.
- JSONB columns (`assessment_versions.config`, `assessments.data`) keep the original shapes, so the
  rubric engine and all validation run unmodified.
- RLS: every table readable and writable only by authenticated users; a `user_roles` table with a
  security-definer `has_role` function carries the assistant/admin role. No service-role key in the
  browser; all writes go through server functions that re-validate.
- Dropped as obsolete: `sessions`, hand-rolled scrypt hashing, CSRF plumbing, origin allow-list,
  embedded-Postgres dev harness, the unused legacy Supabase edge function and its committed anon key.

## Scope note

This is a large migration and I will work through it phase by phase in order rather than in one
step, verifying as I go.
