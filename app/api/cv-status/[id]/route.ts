// Polled by the CV review screen while the Edge Function runs.
// No ownership check needed here — RLS on cv_imports means a candidate can
// only ever read their own row, and an id that isn't theirs returns nothing.

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("cv_imports")
    .select("status")
    .eq("id", id)
    .single();

  return Response.json({ status: data?.status ?? "failed" });
}
