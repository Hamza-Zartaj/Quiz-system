create extension if not exists pgcrypto;

create type quiz_status as enum ('DRAFT', 'PUBLISHED', 'CLOSED');
create type quiz_delivery_mode as enum ('ONLINE', 'OFFLINE');
create type quiz_question_type as enum ('MCQ', 'TRUE_FALSE', 'SHORT');
create type quiz_attempt_status as enum ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'OFFLINE_RECORDED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  subject_name text,
  class_name text,
  total_marks numeric(8,2) not null default 0,
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 1440),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status quiz_status not null default 'DRAFT',
  delivery_mode quiz_delivery_mode not null default 'ONLINE',
  shuffle_questions boolean not null default false,
  max_violations integer not null default 3 check (max_violations between 1 and 100),
  allow_review boolean not null default true,
  share_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quizzes_end_after_start check (end_at > start_at)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  type quiz_question_type not null,
  question_text text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null,
  marks numeric(8,2) not null default 1 check (marks > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  participant_name text not null,
  roll_number text not null,
  class_name text not null,
  participant_key text not null,
  attempt_token_hash text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status quiz_attempt_status not null default 'IN_PROGRESS',
  total_score numeric(8,2),
  auto_graded_score numeric(8,2),
  manual_score numeric(8,2),
  violations integer not null default 0,
  violation_log jsonb not null default '[]'::jsonb,
  question_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, participant_key)
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer jsonb,
  is_correct boolean,
  marks_awarded numeric(8,2) not null default 0,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  prompt text not null,
  model text,
  request jsonb not null default '{}'::jsonb,
  usage jsonb,
  created_at timestamptz not null default now()
);

create index quizzes_teacher_idx on public.quizzes(teacher_id);
create index quizzes_share_token_idx on public.quizzes(share_token);
create index quizzes_status_time_idx on public.quizzes(status, start_at, end_at);
create index quiz_questions_quiz_order_idx on public.quiz_questions(quiz_id, order_index);
create index quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id);
create index quiz_attempts_status_idx on public.quiz_attempts(status);
create index quiz_answers_attempt_idx on public.quiz_answers(attempt_id);
create index quiz_answers_question_idx on public.quiz_answers(question_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger quizzes_set_updated_at
before update on public.quizzes
for each row execute function public.set_updated_at();

create trigger attempts_set_updated_at
before update on public.quiz_attempts
for each row execute function public.set_updated_at();

create trigger answers_set_updated_at
before update on public.quiz_answers
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.ai_generations enable row level security;

create policy "Teachers manage own profile"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Teachers manage own quizzes"
on public.quizzes
for all
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

create policy "Teachers read own quiz questions"
on public.quiz_questions
for select
using (exists (
  select 1 from public.quizzes q
  where q.id = quiz_questions.quiz_id and q.teacher_id = auth.uid()
));

create policy "Teachers write own quiz questions"
on public.quiz_questions
for all
using (exists (
  select 1 from public.quizzes q
  where q.id = quiz_questions.quiz_id and q.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.quizzes q
  where q.id = quiz_questions.quiz_id and q.teacher_id = auth.uid()
));

create policy "Teachers read own attempts"
on public.quiz_attempts
for select
using (exists (
  select 1 from public.quizzes q
  where q.id = quiz_attempts.quiz_id and q.teacher_id = auth.uid()
));

create policy "Teachers update own attempts"
on public.quiz_attempts
for update
using (exists (
  select 1 from public.quizzes q
  where q.id = quiz_attempts.quiz_id and q.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.quizzes q
  where q.id = quiz_attempts.quiz_id and q.teacher_id = auth.uid()
));

create policy "Teachers read own answers"
on public.quiz_answers
for select
using (exists (
  select 1
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = quiz_answers.attempt_id and q.teacher_id = auth.uid()
));

create policy "Teachers update own answers"
on public.quiz_answers
for update
using (exists (
  select 1
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = quiz_answers.attempt_id and q.teacher_id = auth.uid()
))
with check (exists (
  select 1
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = quiz_answers.attempt_id and q.teacher_id = auth.uid()
));

create policy "Teachers read own AI generations"
on public.ai_generations
for select
using (auth.uid() = teacher_id);

create policy "Teachers insert own AI generations"
on public.ai_generations
for insert
with check (auth.uid() = teacher_id);
