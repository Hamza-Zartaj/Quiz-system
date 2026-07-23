import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const { quizId } = await context.params;
  const { data: quiz, error: quizError } = await supabaseAdmin()
    .from("quizzes")
    .select("id, total_marks, delivery_mode")
    .eq("id", quizId)
    .eq("teacher_id", auth.user.id)
    .single();

  if (quizError || !quiz) {
    return NextResponse.json({ success: false, message: "Quiz not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin()
    .from("quiz_attempts")
    .select(`
      *,
      answers:quiz_answers(
        id,
        answer,
        is_correct,
        marks_awarded,
        question:quiz_questions(type, marks)
      )
    `)
    .eq("quiz_id", quizId)
    .order("class_name", { ascending: true })
    .order("roll_number", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const attempts = (data || []) as any[];
  const rows = attempts.map((attempt) => {
    const manualPending = (attempt.answers || []).filter((answer: any) => (
      answer.question?.type === "SHORT" &&
      answer.is_correct === null &&
      answer.answer !== null &&
      String(answer.answer || "").trim() !== ""
    )).length;

    return {
      id: attempt.id,
      quizId: attempt.quiz_id,
      participantName: attempt.participant_name,
      rollNumber: attempt.roll_number,
      className: attempt.class_name,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      status: attempt.status,
      totalScore: attempt.total_score,
      autoGradedScore: attempt.auto_graded_score,
      manualScore: attempt.manual_score,
      violations: attempt.violations,
      manualPending
    };
  });

  return NextResponse.json({ success: true, quiz, data: rows });
}
