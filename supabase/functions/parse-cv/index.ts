// Deploy: supabase functions deploy parse-cv
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Reads an uploaded CV and returns a DRAFT that the candidate then confirms.
// Nothing here writes to candidates, employment_history or registrations.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6"; // check current model names before deploying

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

Addresses: return only the outward postcode (the part before the space — EN1, N17, BT38). Never a full postcode or street address.`;

const TOOL = {
  name: "cv_draft",
  description: "Structured draft extracted from a CV.",
  input_schema: {
    type: "object",
    required: ["employment", "confidence", "sensitive_present"],
    properties: {
      full_name: { type: ["string", "null"] },
      headline: {
        type: ["string", "null"],
        description: "One line, max 90 characters, in the candidate's own register. Not marketing copy.",
      },
      profession_id: { type: ["string", "null"], enum: [...PROFESSION_IDS, null] },
      postcode_district: { type: ["string", "null"] },
      town: { type: ["string", "null"] },
      has_driving_licence: { type: ["boolean", "null"] },
      employment: {
        type: "array",
        items: {
          type: "object",
          required: ["employer", "job_title", "started_on", "is_current"],
          properties: {
            employer: { type: "string" },
            job_title: { type: "string" },
            setting: { type: ["string", "null"], enum: [...SETTINGS, null] },
            started_on: { type: ["string", "null"], description: "YYYY-MM" },
            ended_on: { type: ["string", "null"], description: "YYYY-MM, null if current" },
            is_current: { type: "boolean" },
            description: {
              type: ["string", "null"],
              description: "Two sentences max, rewritten as plain statements of what they did. Drop filler like 'excellent communication skills'.",
            },
          },
        },
      },
      qualifications: {
        type: "array",
        items: {
          type: "object",
          required: ["label"],
          properties: {
            type_id: { type: ["string", "null"], enum: [...QUALIFICATION_IDS, null] },
            label: { type: "string" },
            awarding_body: { type: ["string", "null"] },
            awarded_on: { type: ["string", "null"] },
          },
        },
      },
      registration: {
        type: ["object", "null"],
        description: "Statutory registration if a number appears on the CV.",
        properties: {
          regulator: { type: "string", enum: ["nmc", "hcpc", "gdc", "gmc", "gphc", "swe"] },
          reg_number: { type: "string" },
        },
      },
      dbs_mentioned: { type: "boolean" },
      dbs_on_update_service: {
        type: ["boolean", "null"],
        description: "Only true if the CV explicitly says Update Service. Never infer it.",
      },
      confidence: {
        type: "object",
        required: ["overall", "employment_dates"],
        properties: {
          overall: { type: "number" },
          employment_dates: { type: "number" },
          profession: { type: "number" },
          location: { type: "number" },
        },
      },
      sensitive_present: {
        type: "array",
        items: {
          type: "string",
          enum: ["date_of_birth", "photo", "nationality", "marital_status",
                 "ni_number", "health_information", "religion", "gender"],
        },
      },
      unreadable: {
        type: "boolean",
        description: "True if the file contains no usable CV content — a blank scan, wrong document, unreadable photo.",
      },
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
    .replace(/<w:p[ >][^]*?<\/w:p>/g, (m) => m + "\n")
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

Deno.serve(async (req) => {
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
    let content: unknown[];

    if (mime === "application/pdf") {
      // Claude reads PDFs directly, including scanned ones, so no separate OCR.
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(bytes) } },
        { type: "text", text: "Extract this CV." },
      ];
    } else if (mime.startsWith("image/")) {
      content = [
        { type: "image", source: { type: "base64", media_type: mime, data: b64(bytes) } },
        { type: "text", text: "Extract this CV. It is a photograph, so read carefully and lower confidence where the text is unclear." },
      ];
    } else {
      const text = await docxToText(bytes);
      if (text.length < 80) throw new Error("empty document");
      content = [{ type: "text", text: `Extract this CV.\n\n---\n${text.slice(0, 60000)}` }];
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "cv_draft" },
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);

    const body = await res.json();
    const block = body.content.find((c: { type: string }) => c.type === "tool_use");
    if (!block) throw new Error("no tool_use in response");

    const draft = block.input;

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
