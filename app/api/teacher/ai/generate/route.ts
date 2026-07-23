import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { generateQuizQuestions, validateAIQuizRequest } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const windows = new Map<string, number[]>();
const WINDOW_MS = 60000;
const MAX_REQUESTS = 5;

const consumeAllowance = (teacherId: string) => {
  const now = Date.now();
  const recent = (windows.get(teacherId) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return false;
  recent.push(now);
  windows.set(teacherId, recent);
  return true;
};

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const aiRequest = validateAIQuizRequest(body);
    if (!consumeAllowance(auth.user.id)) {
      return NextResponse.json(
        { success: false, code: "AI_RATE_LIMITED", message: "Please wait a minute before generating more questions" },
        { status: 429 }
      );
    }

    const generated = await generateQuizQuestions({
      subjectName: String(body.subjectName || body.subject_name || ""),
      className: String(body.className || body.class_name || ""),
      ...aiRequest
    });

    await supabaseAdmin()
      .from("ai_generations")
      .insert({
        teacher_id: auth.user.id,
        prompt: aiRequest.prompt,
        model: generated.model,
        request: {
          questionCount: aiRequest.questionCount,
          mix: aiRequest.mix,
          difficulty: aiRequest.difficulty,
          marksPerQuestion: aiRequest.marksPerQuestion
        },
        usage: generated.usage
      });

    return NextResponse.json({ success: true, data: generated });
  } catch (error) {
    const code = (error as Error & { code?: string; status?: number }).code;
    const status = (error as Error & { status?: number }).status;

    if (code === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: false, code, message: (error as Error).message }, { status: 503 });
    }
    if (code === "AI_INVALID_OUTPUT") {
      return NextResponse.json({ success: false, code, message: (error as Error).message }, { status: 422 });
    }
    if (status === 401) {
      return NextResponse.json(
        { success: false, code: "AI_AUTH_FAILED", message: "The configured OpenAI API key was rejected" },
        { status: 503 }
      );
    }
    if (status === 429) {
      return NextResponse.json(
        { success: false, code: "AI_PROVIDER_RATE_LIMIT", message: "OpenAI is rate-limiting requests. Try again shortly." },
        { status: 429 }
      );
    }

    const message = error instanceof Error ? error.message : "AI generation failed";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
