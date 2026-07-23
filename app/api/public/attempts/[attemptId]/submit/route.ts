import { NextRequest, NextResponse } from "next/server";
import { finalizeAttempt, getAttemptTokenFromRequest, isAttemptExpired, loadPublicAttempt } from "@/lib/attempts";

export async function POST(
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

    const answers = body.answers;
    if (answers !== undefined && !Array.isArray(answers)) {
      return NextResponse.json({ success: false, message: "answers must be an array" }, { status: 400 });
    }

    const expired = isAttemptExpired(attempt);
    const finalized = await finalizeAttempt(
      attemptId,
      expired ? "AUTO_SUBMITTED" : "SUBMITTED",
      {},
      expired ? [] : (answers || [])
    );

    return NextResponse.json({ success: true, data: { ...finalized, expired } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit attempt";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
