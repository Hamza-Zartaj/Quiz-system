import { redirect } from "next/navigation";
import TeacherDashboard from "@/components/TeacherDashboard";
import { ensureTeacherProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await ensureTeacherProfile(user);

  return <TeacherDashboard teacherEmail={user.email || "Teacher"} />;
}
