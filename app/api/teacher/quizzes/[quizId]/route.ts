import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { questionToDb, serializeQuiz, validateQuizPayload } from "@/lib/quiz";

const getOwnedQuiz = async (quizId: string, teacherId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("quizzes")
    .select("*, questions:quiz_questions(*), attempts:quiz_attempts(id)")
    .eq("id", quizId)
    .eq("teacher_id", teacherId)
    .single();

  if (error || !data) return null;
  return data;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const { quizId } = await context.params;
  const quiz = await getOwnedQuiz(quizId, auth.user.id);
  if (!quiz) {
    return NextResponse.json({ success: false, message: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: serializeQuiz(quiz) });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const { quizId } = await context.params;
    const existing = await getOwnedQuiz(quizId, auth.user.id);
    if (!existing) {
      return NextResponse.json({ success: false, message: "Quiz not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = validateQuizPayload(body, { partial: true });
    const nextStart = validated.startAt || new Date(existing.start_at);
    const nextEnd = validated.endAt || new Date(existing.end_at);
    if (nextEnd <= nextStart) throw new Error("endAt must be after startAt");

    const hasAttempts = Array.isArray(existing.attempts) && existing.attempts.length > 0;
    if (validated.questions && hasAttempts) {
      return NextResponse.json(
        { success: false, message: "Cannot modify questions after attempts exist" },
        { status: 400 }
      );
    }

    const totalMarks = validated.questions
      ? validated.questions.reduce((sum, question) => sum + question.marks, 0)
      : undefined;

    const updateData: Record<string, unknown> = {};
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.subjectName !== undefined) updateData.subject_name = validated.subjectName;
    if (validated.className !== undefined) updateData.class_name = validated.className;
    if (validated.durationMinutes !== undefined) updateData.duration_minutes = validated.durationMinutes;
    if (validated.startAt !== undefined) updateData.start_at = validated.startAt.toISOString();
    if (validated.endAt !== undefined) updateData.end_at = validated.endAt.toISOString();
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.deliveryMode !== undefined) updateData.delivery_mode = validated.deliveryMode;
    if (validated.shuffleQuestions !== undefined) updateData.shuffle_questions = validated.shuffleQuestions;
    if (validated.maxViolations !== undefined) updateData.max_violations = validated.maxViolations;
    if (validated.allowReview !== undefined) updateData.allow_review = validated.allowReview;
    if (totalMarks !== undefined) updateData.total_marks = totalMarks;

    const { error: updateError } = await supabaseAdmin()
      .from("quizzes")
      .update(updateData)
      .eq("id", quizId)
      .eq("teacher_id", auth.user.id);

    if (updateError) throw updateError;

    if (validated.questions) {
      const { error: deleteError } = await supabaseAdmin()
        .from("quiz_questions")
        .delete()
        .eq("quiz_id", quizId);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabaseAdmin()
        .from("quiz_questions")
        .insert(validated.questions.map((question) => questionToDb(quizId, question)));
      if (insertError) throw insertError;
    }

    const updated = await getOwnedQuiz(quizId, auth.user.id);
    return NextResponse.json({ success: true, data: serializeQuiz(updated!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update quiz";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const { quizId } = await context.params;
  const existing = await getOwnedQuiz(quizId, auth.user.id);
  if (!existing) {
    return NextResponse.json({ success: false, message: "Quiz not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin()
    .from("quizzes")
    .delete()
    .eq("id", quizId)
    .eq("teacher_id", auth.user.id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
