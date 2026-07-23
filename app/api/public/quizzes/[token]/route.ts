import { NextRequest, NextResponse } from "next/server";
import { getPublicQuizState } from "@/lib/quiz";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const { data: quiz, error } = await supabaseAdmin()
    .from("quizzes")
    .select("*, questions:quiz_questions(id)")
    .eq("share_token", token)
    .single();

  if (error || !quiz) {
    return NextResponse.json({ success: false, message: "Quiz link not found" }, { status: 404 });
  }

  const state = getPublicQuizState(quiz);
  return NextResponse.json({
    success: true,
    data: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      subjectName: quiz.subject_name,
      className: quiz.class_name,
      totalMarks: Number(quiz.total_marks || 0),
      durationMinutes: quiz.duration_minutes,
      startAt: quiz.start_at,
      endAt: quiz.end_at,
      status: quiz.status,
      deliveryMode: quiz.delivery_mode,
      maxViolations: quiz.max_violations,
      allowReview: quiz.allow_review,
      questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
      state,
      serverTime: new Date().toISOString()
    }
  });
}
