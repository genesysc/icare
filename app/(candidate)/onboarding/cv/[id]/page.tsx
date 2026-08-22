import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CvReview } from "../../_components/steps";

export const metadata = { title: "Check your details" };

export default async function CvReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: imp } = await supabase
    .from("cv_imports")
    .select("id, status, parsed, confidence, sensitive_found")
    .eq("id", id)
    .single();

  if (!imp) notFound();

  return (
    <main className="wizard">
      <CvReview
        importId={imp.id}
        status={imp.status}
        draft={imp.parsed}
        confidence={imp.confidence}
        sensitive={imp.sensitive_found ?? []}
      />
    </main>
  );
}
