import { NextRequest, NextResponse } from "next/server";
import {
  buildParticipantKey,
  getPublicQuizState,
  hashToken,
  randomToken,
  sanitizeQuestion,
  shuffle
} from "@/lib/quiz";
import { finalizeAttempt, getAttemptDeadline, isAttemptExpired } from "@/lib/attempts";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const participantName = String(body.participantName || body.name || "").trim();
    const rollNumber = String(body.rollNumber || "").trim();
    const className = String(body.className || "").trim();
    if (!participantName || !rollNumber || !className) {
      throw new Error("Name, roll number, and class are required");
    }

    const { data: quiz, error: quizError } = await supabaseAdmin()
      .from("quizzes")
      .select("*, questions:quiz_questions(*)")
      .eq("share_token", token)
      .single();

    if (quizError || !quiz) {
      return NextResponse.json({ success: false, message: "Quiz link not found" }, { status: 404 });
    }

    const state = getPublicQuizState(quiz);
    if (state !== "OPEN") {
      return NextResponse.json({ success: false, code: state, message: "Quiz is not currently open" }, { status: 400 });
    }

    const participantKey = buildParticipantKey(rollNumber, className);
    const { data: existingAttempt } = await supabaseAdmin()
      .from("quiz_attempts")
      .select("*, quiz:quizzes(id, title, duration_minutes, end_at, max_violations, allow_review)")
      .eq("quiz_id", quiz.id)
      .eq("participant_key", participantKey)
      .maybeSingle();

    let attempt = existingAttempt as any;
    let attemptToken: string | null = null;

    if (attempt && attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, message: "This roll number and class have already submitted this quiz" },
        { status: 409 }
      );
    }

    if (attempt && isAttemptExpired(attempt)) {
      const finalized = await finalizeAttempt(attempt.id, "AUTO_SUBMITTED");
      return NextResponse.json(
        {
          success: false,
          code: "ATTEMPT_EXPIRED",
          message: "This quiz attempt has expired and was submitted automatically",
          data: finalized
        },
        { status: 409 }
      );
    }

    const quizQuestions = Array.isArray(quiz.questions)
      ? (quiz.questions as Record<string, unknown>[])
      : [];
    const orderedQuestions = [...quizQuestions]
      .sort((left, right) => Number(left.order_index) - Number(right.order_index));

    if (!attempt) {
      attemptToken = randomToken(24);
      const questionOrder = quiz.shuffle_questions
        ? shuffle(orderedQuestions.map((question: any) => question.id))
        : orderedQuestions.map((question: any) => question.id);

      const { data: created, error: createError } = await supabaseAdmin()
        .from("quiz_attempts")
        .insert({
          quiz_id: quiz.id,
          participant_name: participantName,
          roll_number: rollNumber,
          class_name: className,
          participant_key: participantKey,
          attempt_token_hash: hashToken(attemptToken),
          status: "IN_PROGRESS",
          question_order: questionOrder
        })
        .select("*, quiz:quizzes(id, title, duration_minutes, end_at, max_violations, allow_review)")
        .single();

      if (createError) throw createError;
      attempt = created;
    } else {
      attemptToken = String(body.attemptToken || "");
      if (!attemptToken || attempt.attempt_token_hash !== hashToken(attemptToken)) {
        return NextResponse.json(
          { success: false, code: "RESUME_TOKEN_REQUIRED", message: "This attempt is already in progress on another session" },
          { status: 409 }
        );
      }
    }

    const questionOrder = Array.isArray(attempt.question_order) ? (attempt.question_order as unknown[]) : [];
    const orderIndex = new Map<string, number>(
      questionOrder.map((questionId, index): [string, number] => [String(questionId), index])
    );
    const questions = orderedQuestions
      .map(sanitizeQuestion)
      .sort((left: any, right: any) => (
        (orderIndex.get(String(left.id)) ?? Number(left.orderIndex)) -
        (orderIndex.get(String(right.id)) ?? Number(right.orderIndex))
      ));

    const { data: savedAnswers } = await supabaseAdmin()
      .from("quiz_answers")
      .select("question_id, answer")
      .eq("attempt_id", attempt.id);

    return NextResponse.json({
      success: true,
      data: {
        attemptId: attempt.id,
        attemptToken,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          totalMarks: Number(quiz.total_marks || 0),
          durationMinutes: quiz.duration_minutes,
          maxViolations: quiz.max_violations,
          startAt: quiz.start_at,
          endAt: quiz.end_at
        },
        questions,
        savedAnswers: (savedAnswers || []).map((answer) => ({
          questionId: answer.question_id,
          answer: answer.answer
        })),
        startedAt: attempt.started_at,
        deadline: getAttemptDeadline(attempt).toISOString(),
        violations: attempt.violations
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start quiz";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
