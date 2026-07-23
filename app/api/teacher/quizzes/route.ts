import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { questionToDb, randomToken, serializeQuiz, validateQuizPayload } from "@/lib/quiz";

export async function GET() {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const { data, error } = await supabaseAdmin()
    .from("quizzes")
    .select("*, questions:quiz_questions(id), attempts:quiz_attempts(id)")
    .eq("teacher_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: (data || []).map((quiz) => serializeQuiz(quiz))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const validated = validateQuizPayload(body);
    const questions = validated.questions || [];
    const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);

    const { data: quiz, error: quizError } = await supabaseAdmin()
      .from("quizzes")
      .insert({
        teacher_id: auth.user.id,
        title: validated.title,
        description: validated.description ?? null,
        subject_name: validated.subjectName ?? null,
        class_name: validated.className ?? null,
        duration_minutes: validated.durationMinutes ?? 30,
        start_at: validated.startAt!.toISOString(),
        end_at: validated.endAt!.toISOString(),
        status: validated.status || "DRAFT",
        delivery_mode: validated.deliveryMode || "ONLINE",
        shuffle_questions: validated.shuffleQuestions ?? false,
        max_violations: validated.maxViolations ?? 3,
        allow_review: validated.allowReview ?? true,
        total_marks: totalMarks,
        share_token: randomToken(18)
      })
      .select()
      .single();

    if (quizError) throw quizError;

    const questionRows = questions.map((question) => questionToDb(quiz.id, question));
    if (questionRows.length > 0) {
      const { error: questionError } = await supabaseAdmin()
        .from("quiz_questions")
        .insert(questionRows);

      if (questionError) {
        await supabaseAdmin().from("quizzes").delete().eq("id", quiz.id);
        throw questionError;
      }
    }

    const { data: created } = await supabaseAdmin()
      .from("quizzes")
      .select("*, questions:quiz_questions(*), attempts:quiz_attempts(id)")
      .eq("id", quiz.id)
      .single();

    return NextResponse.json({ success: true, data: serializeQuiz(created || quiz) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quiz";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
