import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { parseQuizQuestionsWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "A sheet file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const questions = parseQuizQuestionsWorkbook(buffer);
    return NextResponse.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid sheet data";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
