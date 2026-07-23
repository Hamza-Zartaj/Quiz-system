import { NextRequest, NextResponse } from "next/server";
import { loadPublicAttempt } from "@/lib/attempts";
import { sanitizeQuestion } from "@/lib/quiz";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  try {
    const { attemptId } = await context.params;
    const token = request.headers.get("x-attempt-token") || request.nextUrl.searchParams.get("token") || "";
    const attempt = await loadPublicAttempt(attemptId, token);

    if (attempt.status === "IN_PROGRESS") {
      return NextResponse.json({ success: false, message: "Quiz still in progress" }, { status: 400 });
    }

    const questions = [...(attempt.quiz?.quiz_questions || [])]
      .sort((left: any, right: any) => Number(left.order_index) - Number(right.order_index));
    const answers = attempt.quiz_answers || [];
    const manualPending = answers.filter((answer) => {
      const question = questions.find((item) => item.id === answer.question_id);
      return question?.type === "SHORT" && answer.is_correct === null && String(answer.answer || "").trim() !== "";
    }).length;

    const allowReview = Boolean(attempt.quiz?.allow_review) &&
      Date.now() > new Date(attempt.quiz?.end_at || "").getTime();

    return NextResponse.json({
      success: true,
      data: {
        attemptId: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        totalScore: Number((attempt as any).total_score || 0),
        totalMarks: questions.reduce((sum, question) => sum + Number(question.marks || 0), 0),
        violations: attempt.violations,
        gradingStatus: manualPending > 0 ? "PENDING_MANUAL" : "FINAL",
        manualPending,
        allowReview,
        reviewAvailableAt: attempt.quiz?.allow_review ? attempt.quiz.end_at : null,
        questions: allowReview
          ? questions.map((question) => {
            const answer = answers.find((item) => item.question_id === question.id);
            return {
              ...sanitizeQuestion(question as any),
              correctAnswer: question.correct_answer,
              yourAnswer: answer?.answer,
              isCorrect: answer?.is_correct,
              marksAwarded: Number(answer?.marks_awarded || 0),
              feedback: answer?.feedback
            };
          })
          : undefined
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load result";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
