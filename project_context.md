# Quiz System Project Context

## Goal

Build a standalone quiz system for teachers who only need quiz creation, delivery, printing, online public links, participant submissions, and teacher-owned results without the rest of CampusOne.

## Source Review

Reviewed the CampusOne quiz system before creating this folder:

- Backend quiz controller, attempt controller, AI generation service, quiz lifecycle service, Excel importer, validation helper, quiz routes, Prisma quiz models, and quiz migrations.
- Teacher quiz UI for create/edit, AI generation, Excel import, print view, online/offline mode, roster, and offline marks.
- Student quiz UI for pre-start confirmation, timed attempt, autosave, anti-cheat events, submission, and result review.

## Implemented In This Standalone Folder

- Next.js App Router scaffold.
- Supabase Auth teacher login/sign-up flow.
- Supabase Postgres schema in `supabase/schema.sql`.
- Teacher-owned quiz model with draft/published/closed states.
- Online/offline delivery modes.
- Public share-token quiz URLs.
- Public participant identity: name, roll number, and class.
- Stable per-attempt question order with optional shuffle.
- Autosave, submit, timeout finalization, and violation logging endpoints.
- Automatic final grading for MCQ and true/false questions.
- Offline quiz print support and offline mark recording.
- Excel/CSV question import and downloadable sample workbook.
- OpenAI-backed AI question generation with difficulty, type mix, and duplicate-avoidance context.

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` for AI generation
- `OPENAI_QUIZ_MODEL` optional, defaults to `gpt-5.4-mini`

## Verification

- Static scaffold created only under `Quiz-system`.
- Existing CampusOne files and root `Project_context.md` were intentionally not modified.
- `package.json` and `tsconfig.json` parse successfully as JSON.
- `npm install --package-lock-only --ignore-scripts` was attempted, but npm hung without output for roughly 90 seconds and was stopped; no partial lockfile was created.
- Build was not run because dependencies are not installed in this new standalone folder yet.

## Next Tasks

- Run `npm install` after moving/copying the folder to its final location.
- Apply `supabase/schema.sql` to a Supabase project.
- Run `npm run build` after environment variables are configured.
- Decide whether public quiz takers should be allowed to resume attempts after browser refresh by storing attempt tokens client-side.
