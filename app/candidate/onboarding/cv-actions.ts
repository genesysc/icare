"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

// Trust the bytes, not the filename. An extension is whatever the uploader
// decided to call it.
async function sniff(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = [...head].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex.startsWith("25504446")) return "application/pdf";               // %PDF
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.slice(8, 16) === "66747970") return "image/heic";               // ftyp
  if (hex.startsWith("504b0304")) {                                       // zip → docx
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export async function uploadCv(
  _prev: unknown,
  form: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const file = form.get("cv") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5MB. Try saving it as a PDF." };

  const mime = await sniff(file);
  if (!mime || !ALLOWED[mime]) {
    return {
      error:
        "We can read PDFs, Word documents and photos of a printed CV. That file is something else.",
    };
  }

  // Old .doc (pre-2007 Word) is still common in care and we can't read it.
  if (file.name.toLowerCase().endsWith(".doc") && mime !== "application/pdf") {
    return { error: "That's an old Word format we can't read. Open it and 'Save as PDF', or just fill the form in — it only takes a couple of minutes." };
  }

  const path = `${user.id}/${crypto.randomUUID()}.${ALLOWED[mime]}`;

  const { error: upErr } = await supabase.storage
    .from("cvs")
    .upload(path, file, { contentType: mime, upsert: false });

  if (upErr) return { error: "The upload didn't go through. Try again." };

  const { data: imp, error: insErr } = await supabase
    .from("cv_imports")
    .insert({
      candidate_id: user.id,
      storage_path: path,
      original_name: file.name.slice(0, 200),
      mime_type: mime,
      byte_size: file.size,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insErr || !imp) return { error: "Something went wrong saving your CV." };

  // Fire and forget. The review screen polls for the result, so a slow parse
  // never blocks the person standing there looking at a spinner.
  void supabase.functions.invoke("parse-cv", { body: { import_id: imp.id } });

  redirect(`/candidate/onboarding/cv/${imp.id}`);
}

export async function getImport(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cv_imports")
    .select("id, status, parsed, confidence, sensitive_found, original_name, error_detail")
    .eq("id", id)
    .single();
  return data;
}

/**
 * Applies the draft the candidate has just reviewed and edited on screen.
 *
 * Note what this reads: the form fields, not cv_imports.parsed. The parse is a
 * suggestion that populated some inputs; what gets written is whatever the
 * candidate left in those inputs. If they corrected a date, the correction
 * wins — which is the entire point of the review step.
 */
export async function applyCvDraft(
  _prev: unknown,
  form: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const importId = String(form.get("import_id"));
  const uid = user.id;

  const profession = String(form.get("profession_id") ?? "");
  if (profession) {
    await supabase.from("candidate_professions").delete().eq("candidate_id", uid);
    await supabase.from("candidate_professions")
      .insert({ candidate_id: uid, profession_id: profession, is_primary: true });
  }

  const district = String(form.get("postcode_district") ?? "").trim().toUpperCase();
  await supabase.from("candidates").update({
    headline: String(form.get("headline") ?? "").trim().slice(0, 120) || null,
    postcode_district: /^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(district) ? district : null,
    town: String(form.get("town") ?? "").trim() || null,
    has_driving_licence: form.get("has_driving_licence") === "on",
  }).eq("id", uid);

  // Employment rows come back indexed: employer_0, job_title_0, and so on.
  // A row the candidate unticked is simply absent from keep[].
  const keep = form.getAll("keep").map(String);

  const rows = keep.flatMap((i) => {
    const employer = String(form.get(`employer_${i}`) ?? "").trim();
    const title = String(form.get(`job_title_${i}`) ?? "").trim();
    const started = String(form.get(`started_on_${i}`) ?? "");
    const current = form.get(`is_current_${i}`) === "on";
    const ended = String(form.get(`ended_on_${i}`) ?? "");

    // Drop anything the candidate left incomplete rather than guessing.
    if (!employer || !title || !started) return [];
    if (!current && !ended) return [];

    return [{
      candidate_id: uid,
      employer,
      job_title: title,
      setting: String(form.get(`setting_${i}`) ?? "") || null,
      started_on: `${started}-01`,
      ended_on: current ? null : `${ended}-01`,
      is_current: current,
      description: String(form.get(`description_${i}`) ?? "").trim() || null,
    }];
  });

  if (rows.length) {
    await supabase.from("employment_history").delete().eq("candidate_id", uid);
    await supabase.from("employment_history").insert(rows);
  }

  const regulator = String(form.get("regulator") ?? "");
  const regNumber = String(form.get("reg_number") ?? "").trim();
  if (regulator && regNumber) {
    await supabase.from("registrations").upsert(
      { candidate_id: uid, regulator, reg_number: regNumber, status: "submitted" },
      { onConflict: "candidate_id,regulator,reg_number" }
    );
  }

  await supabase.from("cv_imports")
    .update({ status: "review_complete", applied_at: new Date().toISOString() })
    .eq("id", importId).eq("candidate_id", uid);

  // Straight to step 2. Steps 1 and 3 are now answered, so we skip the typing
  // and go to the bit a CV never tells us: when they can actually start.
  await supabase.from("candidates").update({ onboarding_step: 2 }).eq("id", uid);

  revalidatePath("/candidate/onboarding");
  redirect("/candidate/onboarding?step=2&from=cv");
}

export async function discardCv(form: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const id = String(form.get("import_id"));
  const { data: imp } = await supabase
    .from("cv_imports").select("storage_path").eq("id", id).eq("candidate_id", user.id).single();

  if (imp) await supabase.storage.from("cvs").remove([imp.storage_path]);
  await supabase.from("cv_imports").delete().eq("id", id).eq("candidate_id", user.id);

  redirect("/candidate/onboarding?step=1");
}
