import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { buildParticipantKey } from "@/lib/quiz";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const { quizId } = await context.params;
    const body = await request.json();
    const { data: quiz, error: quizError } = await supabaseAdmin()
      .from("quizzes")
      .select("id, title, total_marks, delivery_mode")
      .eq("id", quizId)
      .eq("teacher_id", auth.user.id)
      .single();

    if (quizError || !quiz) {
      return NextResponse.json({ success: false, message: "Quiz not found" }, { status: 404 });
    }
    if (quiz.delivery_mode !== "OFFLINE") {
      return NextResponse.json(
        { success: false, message: "Offline marks can only be entered for printed/offline quizzes" },
        { status: 400 }
      );
    }

    const participantName = String(body.participantName || body.name || "").trim();
    const rollNumber = String(body.rollNumber || "").trim();
    const className = String(body.className || "").trim();
    const marksAwarded = Number(body.marksAwarded);
    if (!participantName || !rollNumber || !className) {
      throw new Error("Name, roll number, and class are required");
    }
    if (!Number.isFinite(marksAwarded) || marksAwarded < 0 || marksAwarded > Number(quiz.total_marks)) {
      throw new Error(`Marks must be between 0 and ${quiz.total_marks}`);
    }

    const participantKey = buildParticipantKey(rollNumber, className);
    const { data, error } = await supabaseAdmin()
      .from("quiz_attempts")
      .upsert(
        {
          quiz_id: quizId,
          participant_name: participantName,
          roll_number: rollNumber,
          class_name: className,
          participant_key: participantKey,
          status: "OFFLINE_RECORDED",
          submitted_at: new Date().toISOString(),
          total_score: marksAwarded,
          manual_score: marksAwarded,
          auto_graded_score: 0,
          question_order: []
        },
        { onConflict: "quiz_id,participant_key" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save offline mark";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
