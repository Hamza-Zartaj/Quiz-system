import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { recomputeAttemptScores } from "@/lib/attempts";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ answerId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const { answerId } = await context.params;
    const body = await request.json();
    const { data, error } = await supabaseAdmin()
      .from("quiz_answers")
      .select(`
        *,
        question:quiz_questions(*),
        attempt:quiz_attempts(*, quiz:quizzes(id, teacher_id))
      `)
      .eq("id", answerId)
      .single();

    const answer = data as any;
    if (error || !answer || answer.attempt?.quiz?.teacher_id !== auth.user.id) {
      return NextResponse.json({ success: false, message: "Answer not found" }, { status: 404 });
    }
    if (answer.question?.type !== "SHORT") {
      return NextResponse.json({ success: false, message: "Only short answers can be graded manually" }, { status: 400 });
    }

    const marksAwarded = Number(body.marksAwarded);
    const maxMarks = Number(answer.question.marks);
    if (!Number.isFinite(marksAwarded) || marksAwarded < 0 || marksAwarded > maxMarks) {
      throw new Error(`marksAwarded must be between 0 and ${maxMarks}`);
    }
    const feedback = body.feedback === undefined ? null : String(body.feedback).trim().slice(0, 4000) || null;

    const { error: updateError } = await supabaseAdmin()
      .from("quiz_answers")
      .update({
        marks_awarded: marksAwarded,
        is_correct: marksAwarded === maxMarks,
        feedback
      })
      .eq("id", answerId);

    if (updateError) throw updateError;
    const result = await recomputeAttemptScores(answer.attempt_id);

    return NextResponse.json({
      success: true,
      data: {
        ...result.attempt,
        gradingStatus: result.manualPending > 0 ? "PENDING_MANUAL" : "FINAL",
        manualPending: result.manualPending
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save grade";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
