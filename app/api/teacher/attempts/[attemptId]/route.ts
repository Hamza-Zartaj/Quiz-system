import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serializeQuestion } from "@/lib/quiz";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const { attemptId } = await context.params;
  const { data, error } = await supabaseAdmin()
    .from("quiz_attempts")
    .select(`
      *,
      quiz:quizzes(*, questions:quiz_questions(*)),
      answers:quiz_answers(*)
    `)
    .eq("id", attemptId)
    .single();

  const attempt = data as any;
  if (error || !attempt || attempt.quiz?.teacher_id !== auth.user.id) {
    return NextResponse.json({ success: false, message: "Attempt not found" }, { status: 404 });
  }

  const questions = [...(attempt.quiz.questions || [])]
    .sort((left: any, right: any) => Number(left.order_index) - Number(right.order_index))
    .map((question: any) => serializeQuestion(question));

  const answers = (attempt.answers || []).map((answer: any) => ({
    id: answer.id,
    questionId: answer.question_id,
    answer: answer.answer,
    isCorrect: answer.is_correct,
    marksAwarded: Number(answer.marks_awarded || 0),
    feedback: answer.feedback
  }));

  return NextResponse.json({
    success: true,
    data: {
      id: attempt.id,
      participantName: attempt.participant_name,
      rollNumber: attempt.roll_number,
      className: attempt.class_name,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      status: attempt.status,
      totalScore: Number(attempt.total_score || 0),
      violations: attempt.violations,
      violationLog: attempt.violation_log || [],
      quiz: {
        id: attempt.quiz.id,
        title: attempt.quiz.title,
        totalMarks: Number(attempt.quiz.total_marks || 0),
        questions
      },
      answers
    }
  });
}
