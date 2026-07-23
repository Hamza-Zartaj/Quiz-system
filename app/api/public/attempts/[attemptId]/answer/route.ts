import { NextRequest, NextResponse } from "next/server";
import { finalizeAttempt, getAttemptTokenFromRequest, isAttemptExpired, loadPublicAttempt, normalizeAnswer } from "@/lib/attempts";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  try {
    const { attemptId } = await context.params;
    const body = await request.json();
    const token = await getAttemptTokenFromRequest(request, body);
    const attempt = await loadPublicAttempt(attemptId, token);

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ success: false, message: "Attempt already submitted" }, { status: 400 });
    }
    if (isAttemptExpired(attempt)) {
      const finalized = await finalizeAttempt(attemptId, "AUTO_SUBMITTED");
      return NextResponse.json(
        {
          success: false,
          code: "ATTEMPT_EXPIRED",
          message: "The deadline passed; saved work was submitted automatically",
          data: finalized
        },
        { status: 409 }
      );
    }

    const questionId = String(body.questionId || "");
    const question = (attempt.quiz?.quiz_questions || []).find((item) => item.id === questionId);
    if (!question) throw new Error("Invalid question");

    const answer = normalizeAnswer(question, body.answer);
    const { error } = await supabaseAdmin()
      .from("quiz_answers")
      .upsert(
        {
          attempt_id: attemptId,
          question_id: questionId,
          answer
        },
        { onConflict: "attempt_id,question_id" }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save answer";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
