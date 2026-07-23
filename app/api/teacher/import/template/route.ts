import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { createQuizImportTemplate } from "@/lib/excel";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTeacher();
  if ("response" in auth) return auth.response;

  const buffer = createQuizImportTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=quiz_import_template.xlsx"
    }
  });
}
