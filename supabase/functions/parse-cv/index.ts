// Deploy: supabase functions deploy parse-cv
// Secrets: supabase secrets set GEMINI_API_KEY=AIza...
//
// Reads an uploaded CV and returns a DRAFT that the candidate then confirms.
// Nothing here writes to candidates, employment_history or registrations.
//
// Uses the Gemini API free tier rather than a paid model, by product
// decision. Trade-off worth knowing: Google's free tier terms allow
// submitted content to be used to improve their models, unlike a paid tier
// with a data processing agreement. Revisit before real candidate CVs are
// flowing through this at volume.

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
// Verify this is still current and still free-tier at ai.google.dev/pricing
// before deploying — Gemini's flash line moves fast (2.0 Flash was retired
// June 2026). Override without a redeploy via the GEMINI_MODEL secret.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";

/* -- the taxonomy the parser must map into ------------------------------- */

const PROFESSION_IDS = [
  "care_assistant", "senior_carer", "support_worker", "live_in_carer",
  "registered_manager", "social_worker", "rgn", "rmn", "rnld",
  "nursing_associate", "midwife", "hca", "physiotherapist",
  "occupational_therapist", "podiatrist", "paramedic", "slt", "dietitian",
  "radiographer", "dentist", "dental_nurse", "dental_hygienist", "pharmacist",
  "pharmacy_technician", "activities_coord", "care_admin", "domestic", "chef",
];

const SETTINGS = [
  "domiciliary", "residential", "nursing_home", "supported_living",
  "hospital", "hospice", "learning_disability", "mental_health",
];

const QUALIFICATION_IDS = [
  "care_certificate", "moving_handling", "safeguarding_l2", "safeguarding_l3",
  "medication", "bls", "first_aid", "infection", "mca_dols", "food_hygiene",
  "nvq2", "nvq3", "nvq5", "degree",
];

const SYSTEM = `You extract structured data from UK health and social care CVs for a jobs platform.

You return a DRAFT for a human to confirm. Accuracy matters more than completeness: if you are not confident, leave the field null and lower the confidence score. A null we ask about is far better than a plausible guess we do not.

DO NOT EXTRACT, under any circumstances, even when clearly present:
- date of birth, age
- nationality, country of origin, immigration or visa detail
- marital status, dependants
- gender, religion, ethnicity
- health conditions, disability, sickness record
- National Insurance number, passport or driving licence numbers
- photographs or physical description
- criminal record detail beyond whether a DBS is mentioned

These are either irrelevant to the role or create discrimination risk for the employer. Instead, list which of them appear in the CV under "sensitive_present" so we can advise the candidate to remove them.

Dates: return YYYY-MM. If only a year is given, use YYYY-01 and drop that entry's confidence. "Present", "current", "to date" means is_current true and ended_on null. Never invent a month.

Addresses: return only the outward postcode (the part before the space — EN1, N17, BT38). Never a full postcode or street address.

Respond only with JSON matching the given schema. If the file has no usable CV content — a blank scan, wrong document, unreadable photo — set "unreadable" to true and leave everything else at its default.`;

const CV_SCHEMA = {
  type: "OBJECT",
  required: ["employment", "confidence", "sensitive_present"],
  properties: {
    full_name: { type: "STRING", nullable: true },
    headline: {
      type: "STRING",
      nullable: true,
      description: "One line, max 90 characters, in the candidate's own register. Not marketing copy.",
    },
    profession_id: { type: "STRING", nullable: true, enum: PROFESSION_IDS },
    postcode_district: { type: "STRING", nullable: true },
    town: { type: "STRING", nullable: true },
    has_driving_licence: { type: "BOOLEAN", nullable: true },
    employment: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["employer", "job_title", "started_on", "is_current"],
        properties: {
          employer: { type: "STRING" },
          job_title: { type: "STRING" },
          setting: { type: "STRING", nullable: true, enum: SETTINGS },
          started_on: { type: "STRING", nullable: true, description: "YYYY-MM" },
          ended_on: { type: "STRING", nullable: true, description: "YYYY-MM, null if current" },
          is_current: { type: "BOOLEAN" },
          description: {
            type: "STRING",
            nullable: true,
            description: "Two sentences max, rewritten as plain statements of what they did. Drop filler like 'excellent communication skills'.",
          },
        },
      },
    },
    qualifications: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["label"],
        properties: {
          type_id: { type: "STRING", nullable: true, enum: QUALIFICATION_IDS },
          label: { type: "STRING" },
          awarding_body: { type: "STRING", nullable: true },
          awarded_on: { type: "STRING", nullable: true },
        },
      },
    },
    registration: {
      type: "OBJECT",
      nullable: true,
      description: "Statutory registration if a number appears on the CV.",
      required: ["regulator", "reg_number"],
      properties: {
        regulator: { type: "STRING", enum: ["nmc", "hcpc", "gdc", "gmc", "gphc", "swe"] },
        reg_number: { type: "STRING" },
      },
    },
    dbs_mentioned: { type: "BOOLEAN" },
    dbs_on_update_service: {
      type: "BOOLEAN",
      nullable: true,
      description: "Only true if the CV explicitly says Update Service. Never infer it.",
    },
    confidence: {
      type: "OBJECT",
      required: ["overall", "employment_dates"],
      properties: {
        overall: { type: "NUMBER" },
        employment_dates: { type: "NUMBER" },
        profession: { type: "NUMBER" },
        location: { type: "NUMBER" },
      },
    },
    sensitive_present: {
      type: "ARRAY",
      items: {
        type: "STRING",
        enum: ["date_of_birth", "photo", "nationality", "marital_status",
               "ni_number", "health_information", "religion", "gender"],
      },
    },
    unreadable: {
      type: "BOOLEAN",
      description: "True if the file contains no usable CV content — a blank scan, wrong document, unreadable photo.",
    },
  },
};

/* -- DOCX: it is a zip, and the text lives in word/document.xml ---------- */

async function docxToText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("no document.xml");
  return xml
    .replace(/<w:p[ >][^]*?<\/w:p>/g, (m: string) => m + "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function b64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/* -- handler ------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const { import_id } = await req.json();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: imp } = await admin
    .from("cv_imports").select("*").eq("id", import_id).single();

  if (!imp) return new Response("not found", { status: 404 });

  await admin.from("cv_imports").update({ status: "parsing" }).eq("id", import_id);

  try {
    const { data: file, error: dlErr } = await admin
      .storage.from("cvs").download(imp.storage_path);
    if (dlErr || !file) throw new Error("download failed");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = imp.mime_type ?? "";
    const parts: unknown[] = [];

    if (mime === "application/pdf") {
      // Gemini reads PDFs directly, including scanned ones, so no separate OCR.
      parts.push({ inline_data: { mime_type: "application/pdf", data: b64(bytes) } });
      parts.push({ text: "Extract this CV." });
    } else if (mime.startsWith("image/")) {
      parts.push({ inline_data: { mime_type: mime, data: b64(bytes) } });
      parts.push({ text: "Extract this CV. It is a photograph, so read carefully and lower confidence where the text is unclear." });
    } else {
      const text = await docxToText(bytes);
      if (text.length < 80) throw new Error("empty document");
      parts.push({ text: `Extract this CV.\n\n---\n${text.slice(0, 60000)}` });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": GEMINI_KEY,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: CV_SCHEMA,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);

    const body = await res.json();

    if (body.promptFeedback?.blockReason) {
      throw new Error(`blocked: ${body.promptFeedback.blockReason}`);
    }

    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error("no text in gemini response");

    const draft = JSON.parse(text);

    if (draft.unreadable) {
      await admin.from("cv_imports").update({
        status: "unreadable",
        error_detail: "No usable CV content found in the file.",
        parsed_at: new Date().toISOString(),
      }).eq("id", import_id);
      return new Response(JSON.stringify({ status: "unreadable" }), {
        headers: { "content-type": "application/json" },
      });
    }

    await admin.from("cv_imports").update({
      status: "parsed",
      parsed: draft,
      confidence: draft.confidence ?? {},
      sensitive_found: draft.sensitive_present ?? [],
      parsed_at: new Date().toISOString(),
    }).eq("id", import_id);

    return new Response(JSON.stringify({ status: "parsed" }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    await admin.from("cv_imports").update({
      status: "failed",
      error_detail: String(e).slice(0, 500),
      parsed_at: new Date().toISOString(),
    }).eq("id", import_id);

    // Never a hard error to the client. A failed parse means the candidate
    // types it in themselves — an inconvenience, not a dead end.
    return new Response(JSON.stringify({ status: "failed" }), {
      headers: { "content-type": "application/json" },
    });
  }
});
