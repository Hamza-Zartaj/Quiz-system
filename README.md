# Quiz System

Standalone teacher-first quiz system built with Next.js and Supabase Postgres.

## What It Does

- Teacher email/password auth through Supabase Auth.
- Teacher dashboard for creating quizzes manually, with AI, or from an Excel/CSV sheet.
- Online quizzes expose a share link. Students open it during the quiz window and enter name, roll number, and class.
- Offline quizzes can be printed and graded manually from the teacher dashboard.
- Objective questions auto-grade. Short answers stay pending until the teacher grades them.
- Attempts, answers, scores, participant identity, and violation logs are stored against the teacher-owned quiz.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the Supabase values.
4. Add `OPENAI_API_KEY` if AI question generation should be enabled.
5. Install dependencies with `npm install`.
6. Run `npm run dev`.

## Sheet Import Columns

The importer accepts these columns:

`type`, `questionText`, `option1`, `option2`, `option3`, `option4`, `correctAnswer`, `marks`

Accepted question types are `MCQ`, `TRUE_FALSE` or `TF`, and `SHORT`.
