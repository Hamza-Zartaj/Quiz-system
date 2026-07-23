import PublicQuiz from "@/components/PublicQuiz";

export default async function PublicQuizPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const resolved = await params;
  return <PublicQuiz token={resolved.token} />;
}
