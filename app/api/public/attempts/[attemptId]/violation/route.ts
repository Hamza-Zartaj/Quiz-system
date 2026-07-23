import { NextRequest, NextResponse } from "next/server";
import { finalizeAttempt, getAttemptTokenFromRequest, isAttemptExpired, loadPublicAttempt } from "@/lib/attempts";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
      return NextResponse.json({ success: true, data: { autoSubmitted: false } });
    }
    if (isAttemptExpired(attempt)) {
      const finalized = await finalizeAttempt(attemptId, "AUTO_SUBMITTED");
      return NextResponse.json({ success: true, data: { autoSubmitted: true, expired: true, totalScore: finalized.total_score } });
    }

    const log = Array.isArray(attempt.violation_log) ? attempt.violation_log : [];
    log.push({ type: String(body.type || "UNKNOWN").slice(0, 80), at: new Date().toISOString() });
    const violations = Number(attempt.violations || 0) + 1;
    const maxViolations = Number(attempt.quiz?.max_violations || 3);

    if (violations >= maxViolations) {
      const finalized = await finalizeAttempt(attemptId, "AUTO_SUBMITTED", {
        violations,
        violation_log: log
      });
      return NextResponse.json({ success: true, data: { autoSubmitted: true, totalScore: finalized.total_score } });
    }

    const { error } = await supabaseAdmin()
      .from("quiz_attempts")
      .update({ violations, violation_log: log })
      .eq("id", attemptId);
    if (error) throw error;

    return NextResponse.json({ success: true, data: { autoSubmitted: false, violations, max: maxViolations } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to log violation";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
