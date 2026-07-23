import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuthSuccess = { user: User };
type AuthFailure = { response: NextResponse };

export const ensureTeacherProfile = async (user: User) => {
  const email = user.email || "";
  const fullName = String(
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    email.split("@")[0] ||
    "Teacher"
  );

  const { error } = await supabaseAdmin()
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email,
        full_name: fullName
      },
      { onConflict: "id" }
    );

  if (error) throw error;
};

export const requireTeacher = async (): Promise<AuthSuccess | AuthFailure> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json(
        { success: false, message: "Teacher login is required" },
        { status: 401 }
      )
    };
  }

  await ensureTeacherProfile(user);
  return { user };
};
