import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/quiz";

type QuestionRow = {
  id: string;
  type: "MCQ" | "TRUE_FALSE" | "SHORT";
  options: unknown;
  correct_answer: unknown;
  marks: number | string;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  status: string;
  started_at: string;
  submitted_at?: string | null;
  total_score?: number | string | null;
  auto_graded_score?: number | string | null;
  manual_score?: number | string | null;
  attempt_token_hash?: string | null;
  violations: number;
  violation_log: unknown;
  quiz?: {
    id: string;
    title: string;
    duration_minutes: number;
    end_at: string;
    max_violations: number;
    allow_review: boolean;
    quiz_questions?: QuestionRow[];
  };
  quiz_answers?: AnswerRow[];
};

type AnswerRow = {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: unknown;
  is_correct: boolean | null;
  marks_awarded: number | string;
  feedback?: string | null;
  question?: QuestionRow;
};

type FinalizedAttempt = AttemptRow & {
  gradingStatus?: "PENDING_MANUAL" | "FINAL";
  manualPending?: number;
};

export const normalizeAnswer = (question: QuestionRow, answer: unknown) => {
  if (answer === null || answer === undefined || answer === "") return null;

  if (question.type === "SHORT") {
    const value = String(answer).trim();
    if (value.length > 10000) throw new Error("Short answer exceeds the 10,000 character limit");
    return value || null;
  }

  const value = Number(answer);
  const options = Array.isArray(question.options) ? question.options : [];
  if (!Number.isInteger(value) || value < 0 || value >= options.length) {
    throw new Error("Invalid answer option");
  }
  return value;
};

const hasShortAnswerText = (answer: unknown) => (
  answer !== null &&
  answer !== undefined &&
  String(answer).trim() !== ""
);

const autoGrade = (question: QuestionRow, submittedAnswer: unknown) => {
  if (question.type === "SHORT") return { is_correct: null, marks_awarded: 0 };
  if (submittedAnswer === null || submittedAnswer === undefined) {
    return { is_correct: false, marks_awarded: 0 };
  }

  const isCorrect = Number(submittedAnswer) === Number(question.correct_answer);
  return {
    is_correct: isCorrect,
    marks_awarded: isCorrect ? Number(question.marks) : 0
  };
};

export const getAttemptDeadline = (attempt: AttemptRow) => {
  if (!attempt.quiz) throw new Error("Attempt quiz data is missing");
  return new Date(Math.min(
    new Date(attempt.started_at).getTime() + attempt.quiz.duration_minutes * 60000,
    new Date(attempt.quiz.end_at).getTime()
  ));
};

export const isAttemptExpired = (attempt: AttemptRow) => Date.now() >= getAttemptDeadline(attempt).getTime();

export const getAttemptTokenFromRequest = async (request: NextRequest, body?: Record<string, unknown>) => {
  const headerToken = request.headers.get("x-attempt-token");
  const bodyToken = body?.attemptToken;
  return String(headerToken || bodyToken || "");
};

export const loadPublicAttempt = async (attemptId: string, token: string) => {
  if (!token) throw new Error("Attempt token is required");

  const { data, error } = await supabaseAdmin()
    .from("quiz_attempts")
    .select(`
      *,
      quiz:quizzes(
        id,
        title,
        duration_minutes,
        end_at,
        max_violations,
        allow_review,
        quiz_questions(*)
      ),
      quiz_answers(*)
    `)
    .eq("id", attemptId)
    .single();

  if (error || !data) throw new Error("Attempt not found");
  const attempt = data as unknown as AttemptRow;
  if (!attempt.attempt_token_hash || attempt.attempt_token_hash !== hashToken(token)) {
    throw new Error("Invalid attempt token");
  }

  return attempt;
};

export const finalizeAttempt = async (
  attemptId: string,
  status: "SUBMITTED" | "AUTO_SUBMITTED",
  extra: Record<string, unknown> = {},
  finalAnswers: { questionId: string; answer: unknown }[] = []
): Promise<FinalizedAttempt> => {
  const { data, error } = await supabaseAdmin()
    .from("quiz_attempts")
    .select(`
      *,
      quiz:quizzes(*, quiz_questions(*)),
      quiz_answers(*)
    `)
    .eq("id", attemptId)
    .single();

  if (error || !data) throw new Error("Attempt not found");
  const attempt = data as unknown as AttemptRow;
  if (attempt.status !== "IN_PROGRESS") return attempt;

  const questions = [...(attempt.quiz?.quiz_questions || [])]
    .sort((left: any, right: any) => Number(left.order_index) - Number(right.order_index));
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const answersByQuestion = new Map((attempt.quiz_answers || []).map((answer) => [answer.question_id, answer]));

  for (const submitted of finalAnswers) {
    if (!submitted?.questionId || !questionsById.has(submitted.questionId)) {
      throw new Error("Invalid question in final answers");
    }

    const question = questionsById.get(submitted.questionId)!;
    const answer = normalizeAnswer(question, submitted.answer);
    const { data: saved, error: upsertError } = await supabaseAdmin()
      .from("quiz_answers")
      .upsert(
        {
          attempt_id: attemptId,
          question_id: question.id,
          answer
        },
        { onConflict: "attempt_id,question_id" }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;
    answersByQuestion.set(question.id, saved as unknown as AnswerRow);
  }

  let autoScore = 0;
  let manualPending = 0;

  for (const question of questions) {
    const savedAnswer = answersByQuestion.get(question.id);

    if (question.type === "SHORT") {
      if (hasShortAnswerText(savedAnswer?.answer)) {
        manualPending += 1;
        await supabaseAdmin()
          .from("quiz_answers")
          .update({ is_correct: null, marks_awarded: 0 })
          .eq("id", savedAnswer!.id);
        continue;
      }

      if (savedAnswer) {
        await supabaseAdmin()
          .from("quiz_answers")
          .update({ is_correct: false, marks_awarded: 0 })
          .eq("id", savedAnswer.id);
      } else {
        await supabaseAdmin()
          .from("quiz_answers")
          .insert({
            attempt_id: attemptId,
            question_id: question.id,
            answer: null,
            is_correct: false,
            marks_awarded: 0
          });
      }
      continue;
    }

    const grade = autoGrade(question, savedAnswer?.answer);
    autoScore += Number(grade.marks_awarded || 0);

    if (savedAnswer) {
      await supabaseAdmin()
        .from("quiz_answers")
        .update(grade)
        .eq("id", savedAnswer.id);
    } else {
      await supabaseAdmin()
        .from("quiz_answers")
        .insert({
          attempt_id: attemptId,
          question_id: question.id,
          answer: null,
          ...grade
        });
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin()
    .from("quiz_attempts")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      auto_graded_score: autoScore,
      manual_score: 0,
      total_score: autoScore,
      ...extra
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (updateError) throw updateError;

  return {
    ...(updated as unknown as AttemptRow),
    gradingStatus: manualPending > 0 ? "PENDING_MANUAL" : "FINAL",
    manualPending
  };
};

export const recomputeAttemptScores = async (attemptId: string) => {
  const { data: answers, error } = await supabaseAdmin()
    .from("quiz_answers")
    .select("*, question:quiz_questions(type, marks)")
    .eq("attempt_id", attemptId);

  if (error) throw error;

  let autoScore = 0;
  let manualScore = 0;
  let manualPending = 0;

  for (const answer of (answers || []) as unknown as AnswerRow[]) {
    if (answer.question?.type === "SHORT") {
      if (answer.is_correct === null && hasShortAnswerText(answer.answer)) {
        manualPending += 1;
      } else {
        manualScore += Number(answer.marks_awarded || 0);
      }
      continue;
    }
    autoScore += Number(answer.marks_awarded || 0);
  }

  const totalScore = autoScore + manualScore;
  const { data: updated, error: updateError } = await supabaseAdmin()
    .from("quiz_attempts")
    .update({
      auto_graded_score: autoScore,
      manual_score: manualScore,
      total_score: totalScore
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (updateError) throw updateError;
  return { attempt: updated, totalScore, manualPending };
};
