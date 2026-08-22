// NOT PRODUCTION CODE. Design prototype only — kept for visual/UX reference
// (the badge grammar, credential strip, and shortlist-gating pattern).
// Not wired to Supabase, not part of the app build, not imported anywhere.

import React, { useState, useMemo } from "react";

/* ---------------------------------------------------------------------------
   Care marketplace — candidate side prototype

   Three views: Join (sign-up wizard), Find (search listing), Profile.
   The signature idea is the credential strip: four visually distinct grades of
   trust, so an employer can read a profile's reliability at a glance and never
   confuse "we checked the NMC register" with "she typed it in".
--------------------------------------------------------------------------- */

const C = {
  ink: "#14201C",
  slate: "#57655F",
  mute: "#8B978F",
  paper: "#EFF2F0",
  card: "#FFFFFF",
  line: "#DDE3E0",
  verd: "#0E6B57",
  verdLite: "#E4EFEA",
  amber: "#96601A",
  amberLite: "#F6EEE2",
  chalk: "#F7F9F8",
};

const display = "'Archivo', system-ui, sans-serif";
const body = "'Source Serif 4', Georgia, serif";

/* --- badge catalogue (mirrors the badges table in schema.sql) ------------- */

const GRADES = {
  verified: {
    label: "Verified",
    note: "We checked a public register or an identity provider.",
  },
  evidenced: {
    label: "Evidenced",
    note: "A document was uploaded and a person reviewed it.",
  },
  derived: {
    label: "Derived",
    note: "Calculated from data already on the platform.",
  },
  declared: {
    label: "Declared",
    note: "The candidate said so. Nothing has been checked.",
  },
};

const BADGES = {
  id_verified: { label: "ID Verified", grade: "verified", note: "Photo ID checked by our identity provider." },
  nmc_registered: { label: "NMC Registered", grade: "verified", note: "PIN checked against the NMC public register. Renews 31 Mar 2027." },
  hcpc_registered: { label: "HCPC Registered", grade: "verified", note: "Checked against the HCPC public register." },
  gdc_registered: { label: "GDC Registered", grade: "verified", note: "Checked against the GDC public register." },
  dbs_update: {
    label: "Enhanced DBS · on Update Service",
    grade: "evidenced",
    note: "She holds an Enhanced DBS and has consented to you running an Update Service status check. We have not verified the certificate — you must check it yourself.",
  },
  care_certificate: { label: "Care Certificate", grade: "evidenced", note: "Certificate reviewed. All 15 standards." },
  nvq3: { label: "NVQ/Diploma L3", grade: "evidenced", note: "Certificate reviewed. City & Guilds, 2021." },
  mandatory_current: { label: "Mandatory Training Current", grade: "evidenced", note: "Moving & handling, safeguarding, medication, BLS and infection control all in date." },
  exp_5: { label: "5+ Years", grade: "derived", note: "Calculated from employment history, not typed in." },
  exp_3: { label: "3+ Years", grade: "derived", note: "Calculated from employment history." },
  references_2: { label: "Two References Held", grade: "derived", note: "Two former managers completed a structured reference." },
  responsive: { label: "Responsive", grade: "derived", note: "Replied to 92% of messages within 48 hours over the last 90 days." },
  interview_ready: { label: "Interview Ready", grade: "derived", note: "Recorded an introduction. Watch it once you shortlist." },
  available_now: { label: "Available Now", grade: "declared", note: "States she can start immediately. Expires after 30 days of inactivity." },
  driver: { label: "Driver · Own Car", grade: "declared", note: "States she holds a licence and has a vehicle." },
  sponsorship: { label: "Needs Sponsorship", grade: "declared", note: "States they require a Skilled Worker sponsor." },
};

/* --- badge chip: the visual grammar ------------------------------------- */

function Tick() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.4l2.6 2.6L10 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Doc() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 1.2h4l2.2 2.2v7.4H3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.9 1.4v2.3h2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function Calc() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 3h8M2 6h8M2 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="3" y="6" width="8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.9 6V4.5a2.1 2.1 0 014.2 0V6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function Badge({ code, small }) {
  const b = BADGES[code];
  if (!b) return null;
  const g = b.grade;

  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: display,
    fontSize: small ? 10.5 : 11.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: small ? "3px 8px" : "5px 10px",
    borderRadius: 3,
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  };

  const skins = {
    verified: { ...base, background: C.verd, color: "#fff", border: `1px solid ${C.verd}` },
    evidenced: { ...base, background: C.verdLite, color: C.verd, border: `1px solid #BBD6CB` },
    derived: { ...base, background: C.card, color: C.ink, border: `1px solid ${C.line}` },
    declared: {
      ...base,
      background: "transparent",
      color: C.slate,
      border: `1px dashed ${C.mute}`,
      textTransform: "none",
      letterSpacing: "0.01em",
      fontWeight: 500,
    },
  };

  const glyph = { verified: <Tick />, evidenced: <Doc />, derived: <Calc />, declared: null }[g];

  return (
    <span style={skins[g]} title={`${GRADES[g].label} — ${b.note}`}>
      {glyph}
      {b.label}
    </span>
  );
}

/* --- shared bits --------------------------------------------------------- */

const Eyebrow = ({ children, color }) => (
  <div style={{ fontFamily: display, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: color || C.mute, marginBottom: 10 }}>
    {children}
  </div>
);

const Card = ({ children, pad = 24, style }) => (
  <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: pad, ...style }}>{children}</section>
);

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div style={{ fontFamily: display, fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: C.ink, marginBottom: 6 }}>{label}</div>
      {hint && <div style={{ fontFamily: body, fontSize: 13.5, color: C.slate, marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: body,
  fontSize: 15,
  padding: "10px 12px",
  border: `1px solid ${C.line}`,
  borderRadius: 3,
  background: C.chalk,
  color: C.ink,
};

function Choice({ options, value, onChange, multi }) {
  const selected = multi ? value : [value];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (multi) onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id]);
              else onChange(o.id);
            }}
            style={{
              fontFamily: display,
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 13px",
              borderRadius: 3,
              cursor: "pointer",
              border: `1px solid ${on ? C.verd : C.line}`,
              background: on ? C.verd : C.card,
              color: on ? "#fff" : C.ink,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   VIEW 1 — Join
   ========================================================================= */

const FAMILIES = [
  { id: "social", label: "Social care", roles: ["Care Assistant", "Senior Care Assistant", "Support Worker", "Live-in Carer", "Registered Manager"], reg: null },
  { id: "nursing", label: "Nursing", roles: ["Registered Nurse (Adult)", "Registered Nurse (Mental Health)", "Nursing Associate", "Healthcare Assistant"], reg: "NMC" },
  { id: "allied", label: "Allied health", roles: ["Physiotherapist", "Occupational Therapist", "Podiatrist", "Paramedic", "Speech & Language Therapist"], reg: "HCPC" },
  { id: "dental", label: "Dental", roles: ["Dentist", "Dental Nurse", "Dental Hygienist"], reg: "GDC" },
  { id: "support", label: "Support & ancillary", roles: ["Activities Coordinator", "Care Administrator", "Care Home Chef"], reg: null },
];

function Join() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("social");
  const [role, setRole] = useState("Senior Care Assistant");
  const [pin, setPin] = useState("");
  const [rtw, setRtw] = useState("british_irish");
  const [dbs, setDbs] = useState(true);
  const [updateSvc, setUpdateSvc] = useState(true);
  const [avail, setAvail] = useState("available_now");
  const [shifts, setShifts] = useState(["days"]);
  const [about, setAbout] = useState("");

  const fam = FAMILIES.find((f) => f.id === family);

  const earned = useMemo(() => {
    const out = ["id_verified"];
    if (fam.reg === "NMC" && pin.length > 3) out.push("nmc_registered");
    if (fam.reg === "HCPC" && pin.length > 3) out.push("hcpc_registered");
    if (fam.reg === "GDC" && pin.length > 3) out.push("gdc_registered");
    if (dbs && updateSvc) out.push("dbs_update");
    if (rtw === "requires_sponsorship") out.push("sponsorship");
    if (avail === "available_now") out.push("available_now");
    return out;
  }, [fam, pin, dbs, updateSvc, rtw, avail]);

  const steps = ["Your account", "Your work", "Eligibility & DBS", "Availability"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }} className="two-col">
      <Card pad={30}>
        {/* progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 26 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ height: 3, background: i < step ? C.verd : C.line, borderRadius: 2 }} />
              <div style={{ fontFamily: display, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: i < step ? C.verd : C.mute, marginTop: 7 }}>{s}</div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 style={h2}>Tell us who you are</h2>
            <p style={lede}>You'll never pay to use this. Employers pay to find you.</p>
            <Field label="Full name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Amara Nwosu" /></Field>
            <Field label="Email"><input style={inputStyle} type="email" placeholder="you@example.com" /></Field>
            <Field label="Password" hint="At least 10 characters."><input style={inputStyle} type="password" /></Field>
            <Field label="Where are you based?" hint="We show employers your postcode district and town — never your full address.">
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...inputStyle, width: 110 }} placeholder="EN1" />
                <input style={inputStyle} placeholder="Enfield" />
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={h2}>What do you do?</h2>
            <p style={lede}>Pick the work you want next, not only what you've done before.</p>
            <Field label="Field">
              <Choice options={FAMILIES.map((f) => ({ id: f.id, label: f.label }))} value={family} onChange={(v) => { setFamily(v); setRole(FAMILIES.find((f) => f.id === v).roles[0]); }} />
            </Field>
            <Field label="Role">
              <Choice options={fam.roles.map((r) => ({ id: r, label: r }))} value={role} onChange={setRole} />
            </Field>
            {fam.reg && (
              <div style={{ background: C.verdLite, border: `1px solid #BBD6CB`, borderRadius: 3, padding: 18, marginTop: 6 }}>
                <Eyebrow color={C.verd}>Verification available</Eyebrow>
                <Field label={`${fam.reg} registration number`} hint={`We check this against the ${fam.reg} public register straight away. It's the strongest signal on your profile.`}>
                  <input style={{ ...inputStyle, background: "#fff" }} value={pin} onChange={(e) => setPin(e.target.value)} placeholder={fam.reg === "NMC" ? "e.g. 21A1234B" : "Registration number"} />
                </Field>
                <div style={{ margin: 0 }}>{pin.length > 3 && <Badge code={fam.reg === "NMC" ? "nmc_registered" : fam.reg === "HCPC" ? "hcpc_registered" : "gdc_registered"} />}</div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={h2}>Eligibility and DBS</h2>
            <p style={lede}>Employers filter on this, so being straight here gets you contacted faster.</p>
            <Field label="Right to work in the UK">
              <Choice
                options={[
                  { id: "british_irish", label: "British or Irish" },
                  { id: "settled", label: "Settled / pre-settled" },
                  { id: "indefinite_leave", label: "Indefinite leave" },
                  { id: "visa_with_work_rights", label: "Visa with work rights" },
                  { id: "requires_sponsorship", label: "I need sponsorship" },
                ]}
                value={rtw}
                onChange={setRtw}
              />
            </Field>
            {rtw === "requires_sponsorship" && (
              <div style={{ ...noteBox, borderColor: "#E2CFB2", background: C.amberLite }}>
                <strong style={{ fontFamily: display, fontSize: 12.5, letterSpacing: "0.03em" }}>Worth knowing</strong>
                <p style={{ ...noteP, color: C.amber }}>
                  Overseas recruitment into care worker and senior care worker roles closed on 22 July 2025. In-country switching runs to 22 July 2028. Employers here can still sponsor other roles — we'll show you only the ones that can sponsor yours.
                </p>
              </div>
            )}
            <Field label="DBS">
              <Choice options={[{ id: "yes", label: "I hold an Enhanced DBS" }, { id: "no", label: "Not yet" }]} value={dbs ? "yes" : "no"} onChange={(v) => setDbs(v === "yes")} />
            </Field>
            {dbs && (
              <>
                <Field label="Is it on the DBS Update Service?" hint="If it is, an employer can check its status online in minutes instead of waiting weeks for a new one. It's the single biggest thing you can do to get hired quickly.">
                  <Choice options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} value={updateSvc ? "yes" : "no"} onChange={(v) => setUpdateSvc(v === "yes")} />
                </Field>
                <div style={noteBox}>
                  <p style={noteP}>
                    We store your certificate number but keep it off your public profile. It's released only to an employer you've agreed to share with — and it's their check, not ours. We never claim your DBS is valid, because we can't see it.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 style={h2}>When can you start?</h2>
            <p style={lede}>Availability decays after 30 days of quiet, so employers can trust what they see.</p>
            <Field label="Availability">
              <Choice
                options={[
                  { id: "available_now", label: "Available now" },
                  { id: "available_from", label: "From a date" },
                  { id: "open_to_offers", label: "Open to offers" },
                ]}
                value={avail}
                onChange={setAvail}
              />
            </Field>
            <Field label="Shifts you'll take">
              <Choice
                multi
                options={[
                  { id: "days", label: "Days" },
                  { id: "nights", label: "Nights" },
                  { id: "waking", label: "Waking nights" },
                  { id: "weekends", label: "Weekends" },
                  { id: "live_in", label: "Live-in" },
                ]}
                value={shifts}
                onChange={setShifts}
              />
            </Field>
            <Field label="About you" hint="This is where you make the case. What do you do that a rota can't describe?">
              <textarea style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.6 }} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="I've spent eight years in dementia care…" />
              <div style={{ fontFamily: display, fontSize: 11, color: C.mute, marginTop: 6 }}>{about.length} characters · profiles over 400 get roughly twice the employer views</div>
            </Field>
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 26, paddingTop: 22, borderTop: `1px solid ${C.line}` }}>
          {step > 1 && <button onClick={() => setStep(step - 1)} style={btnGhost}>Back</button>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setStep(Math.min(4, step + 1))} style={btnSolid}>{step === 4 ? "Publish my profile" : "Continue"}</button>
        </div>
      </Card>

      {/* live badge accumulator */}
      <Card pad={22} style={{ position: "sticky", top: 20 }}>
        <Eyebrow>Badges so far</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
          {earned.map((c) => <Badge key={c} code={c} small />)}
        </div>
        <p style={{ fontFamily: body, fontSize: 13.5, lineHeight: 1.6, color: C.slate, margin: 0 }}>
          Badges are earned, never bought. Experience badges are calculated from the jobs you add — you can't type "10 years" and have it appear.
        </p>
      </Card>
    </div>
  );
}

/* =========================================================================
   VIEW 2 — Search listing (deliberately no photos)
   ========================================================================= */

const RESULTS = [
  { id: 1, role: "Senior Care Assistant", head: "Dementia and end-of-life, eight years in domiciliary care", area: "Enfield · EN1 · 10 mi", badges: ["id_verified", "dbs_update", "nvq3", "exp_5", "responsive", "available_now", "driver"], rate: "£13.50/hr" },
  { id: 2, role: "Registered Nurse (Adult)", head: "Nursing home lead, wound care and medication management", area: "Barnet · EN4 · 15 mi", badges: ["nmc_registered", "id_verified", "mandatory_current", "exp_5", "references_2"], rate: "£22.00/hr" },
  { id: 3, role: "Physiotherapist", head: "Neuro rehab, community and care-home caseloads", area: "Haringey · N8 · 8 mi", badges: ["hcpc_registered", "id_verified", "exp_3", "interview_ready"], rate: "£34.00/hr" },
  { id: 4, role: "Dental Nurse", head: "Four years chairside, sedation experience", area: "Waltham Forest · E17", badges: ["gdc_registered", "id_verified", "exp_3", "sponsorship"], rate: "£15.00/hr" },
];

function Find() {
  return (
    <>
      <Card pad={20} style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: "1 1 240px", background: "#fff" }} placeholder="Role, skill or certificate" />
          <input style={{ ...inputStyle, width: 130, background: "#fff" }} placeholder="EN1" />
          <button style={btnSolid}>Search</button>
        </div>
      </Card>

      <div style={{ ...noteBox, marginBottom: 18, background: C.chalk }}>
        <p style={{ ...noteP, color: C.slate }}>
          Search results carry no photos, names or videos. You shortlist on evidence first, then see the person. It's a shorter route to a defensible hiring decision — and it's the reason the video sits behind the shortlist button.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {RESULTS.map((r) => (
          <Card key={r.id} pad={20}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 300px" }}>
                <div style={{ fontFamily: display, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>{r.role}</div>
                <div style={{ fontFamily: body, fontSize: 15, color: C.slate, marginTop: 3 }}>{r.head}</div>
                <div style={{ fontFamily: display, fontSize: 11.5, color: C.mute, marginTop: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>{r.area} · from {r.rate}</div>
              </div>
              <button style={btnGhost}>Shortlist</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
              {r.badges.map((b) => <Badge key={b} code={b} small />)}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* =========================================================================
   VIEW 3 — Profile
   ========================================================================= */

const JOBS = [
  { org: "Right at Home Enfield", role: "Senior Care Assistant", setting: "Domiciliary", from: "Mar 2022", to: "Present", text: "Lead carer on a round of eleven clients, six living with dementia. Mentor for four new starters through their Care Certificate. First responder on two safeguarding referrals, both escalated correctly within the hour." },
  { org: "Elmwood Residential", role: "Care Assistant", setting: "Residential", from: "Sep 2019", to: "Feb 2022", text: "Nights on a 32-bed unit. Trained on hoisting and two-person transfers. Ran the reminiscence group on Thursdays." },
  { org: "Bluebird Care", role: "Care Assistant", setting: "Domiciliary", from: "Jun 2017", to: "Aug 2019", text: "First care role. Personal care, medication prompting, companionship calls across Haringey." },
];

function Profile() {
  const [asEmployer, setAsEmployer] = useState(true);
  const [shortlisted, setShortlisted] = useState(false);
  const locked = asEmployer && !shortlisted;

  const badges = ["id_verified", "dbs_update", "care_certificate", "nvq3", "mandatory_current", "exp_5", "references_2", "responsive", "interview_ready", "available_now", "driver"];

  return (
    <>
      {/* view switch — scaffolding, not part of the product */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: display, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.mute }}>Viewing as</span>
        <Choice options={[{ id: "emp", label: "Employer" }, { id: "own", label: "Amara herself" }]} value={asEmployer ? "emp" : "own"} onChange={(v) => setAsEmployer(v === "emp")} />
        {asEmployer && (
          <button onClick={() => setShortlisted(!shortlisted)} style={{ ...btnGhost, marginLeft: "auto" }}>
            {shortlisted ? "Remove from shortlist" : "Shortlist Amara"}
          </button>
        )}
      </div>

      {/* --- the credential strip: the signature element --- */}
      <div style={{ background: C.ink, borderRadius: "4px 4px 0 0", padding: "26px 30px 22px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 46, height: 7, borderRadius: 4, background: "#0B120F", border: "1px solid #263630" }} aria-hidden="true" />
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
          <div style={{ width: 86, height: 86, borderRadius: 3, background: "linear-gradient(150deg,#2E4A40,#16241F)", border: "1px solid #354A43", display: "grid", placeItems: "center", fontFamily: display, fontSize: 28, fontWeight: 700, color: "#7FA396", flexShrink: 0 }}>AN</div>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontFamily: display, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6E8A80" }}>Senior Care Assistant · Enfield EN1</div>
            <h1 style={{ fontFamily: display, fontSize: 30, fontWeight: 700, color: "#fff", margin: "6px 0 4px", letterSpacing: "-0.02em" }}>Amara Nwosu</h1>
            <div style={{ fontFamily: body, fontSize: 16, color: "#B7C9C2", lineHeight: 1.4 }}>Dementia and end-of-life care · 8 years · available now</div>
          </div>
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <div style={{ fontFamily: display, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#6E8A80" }}>Seeking from</div>
            <div style={{ fontFamily: display, fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 2 }}>£13.50<span style={{ fontSize: 13, color: "#8FAAA1" }}>/hr</span></div>
          </div>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "20px 30px 24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {badges.map((b) => <Badge key={b} code={b} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
          {Object.entries(GRADES).map(([k, g]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, flexShrink: 0, background: k === "verified" ? C.verd : k === "evidenced" ? C.verdLite : k === "derived" ? C.card : "transparent", border: k === "verified" ? `1px solid ${C.verd}` : k === "evidenced" ? "1px solid #BBD6CB" : k === "derived" ? `1px solid ${C.line}` : `1px dashed ${C.mute}` }} />
              <span style={{ fontFamily: display, fontSize: 11, color: C.slate }}><strong style={{ color: C.ink }}>{g.label}</strong> — {g.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 290px", gap: 20, marginTop: 20, alignItems: "start" }} className="two-col">
        <div style={{ display: "grid", gap: 20 }}>
          <Card pad={28}>
            <Eyebrow>About</Eyebrow>
            <p style={prose}>
              I came into care at twenty-six after looking after my grandmother through vascular dementia, and I've never wanted to do anything else since. What I'm good at is the part that doesn't fit on a care plan — knowing that Ivy will take her tablets if you put the radio on first, or that Derek gets agitated at four o'clock because that's when his shift used to end.
            </p>
            <p style={prose}>
              I've been the lead carer on my round for three years. I mentor new starters through the Care Certificate and I'm the one the office rings when a call goes wrong. I'm looking for a senior role with a provider that gives carers proper handover time.
            </p>
          </Card>

          <Card pad={28}>
            <Eyebrow>Proudest of</Eyebrow>
            <p style={{ ...prose, fontSize: 18, fontStyle: "italic", color: C.ink }}>
              "A client's daughter asked me to speak at her mother's funeral. I'd been going in three times a day for two years. That's the job, really."
            </p>
          </Card>

          <Card pad={28}>
            <Eyebrow>Experience · 8 yrs 2 mths</Eyebrow>
            <div style={{ position: "relative", paddingLeft: 22 }}>
              <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 1, background: C.line }} />
              {JOBS.map((j, i) => (
                <div key={i} style={{ marginBottom: i === JOBS.length - 1 ? 0 : 26, position: "relative" }}>
                  <span style={{ position: "absolute", left: -22, top: 6, width: 9, height: 9, borderRadius: 5, background: i === 0 ? C.verd : C.card, border: `1px solid ${i === 0 ? C.verd : C.mute}` }} />
                  <div style={{ fontFamily: display, fontSize: 16.5, fontWeight: 700, color: C.ink }}>{j.role}</div>
                  <div style={{ fontFamily: display, fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mute, marginTop: 3 }}>{j.org} · {j.setting} · {j.from} – {j.to}</div>
                  <p style={{ ...prose, marginTop: 8, marginBottom: 0, fontSize: 15 }}>{j.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card pad={28}>
            <Eyebrow>Training and qualifications</Eyebrow>
            {[
              ["NVQ / Diploma L3 Health & Social Care", "City & Guilds · 2021", "evidenced"],
              ["Care Certificate — all 15 standards", "Right at Home · 2018", "evidenced"],
              ["Moving & Handling", "Renewed Feb 2026", "evidenced"],
              ["Safeguarding Adults L3", "Renewed Jan 2026", "evidenced"],
              ["Medication Administration", "Renewed Feb 2026", "evidenced"],
              ["Basic Life Support", "Renewed Nov 2025", "evidenced"],
            ].map(([t, d]) => (
              <div key={t} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ fontFamily: body, fontSize: 15.5, color: C.ink }}>{t}</span>
                <span style={{ fontFamily: display, fontSize: 11.5, color: C.mute, whiteSpace: "nowrap", letterSpacing: "0.04em" }}>{d}</span>
              </div>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
              {["Dementia care", "End of life care", "PEG feeding", "Catheter care", "Hoisting", "Two-person transfers", "Parkinson's"].map((s) => (
                <span key={s} style={{ fontFamily: display, fontSize: 12, padding: "5px 10px", borderRadius: 3, background: C.chalk, border: `1px solid ${C.line}`, color: C.slate }}>{s}</span>
              ))}
            </div>
          </Card>
        </div>

        {/* right rail */}
        <div style={{ display: "grid", gap: 16, position: "sticky", top: 20 }}>
          <Card pad={20}>
            <Eyebrow>Recorded introduction</Eyebrow>
            {locked ? (
              <div style={{ background: C.chalk, border: `1px dashed ${C.mute}`, borderRadius: 3, padding: 20, textAlign: "center" }}>
                <div style={{ color: C.mute, marginBottom: 8 }}><Lock /></div>
                <div style={{ fontFamily: display, fontSize: 13, fontWeight: 600, color: C.ink }}>Available after shortlisting</div>
                <p style={{ fontFamily: body, fontSize: 13.5, color: C.slate, lineHeight: 1.5, margin: "8px 0 0" }}>
                  Video unlocks once you've shortlisted on written evidence. It keeps your first pass free of anything you can't lawfully select on.
                </p>
              </div>
            ) : (
              <div style={{ background: C.ink, borderRadius: 3, aspectRatio: "16/10", display: "grid", placeItems: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: C.verd, display: "grid", placeItems: "center" }}>
                  <svg width="14" height="16" viewBox="0 0 14 16"><path d="M2 1.5l10 6.5-10 6.5z" fill="#fff" /></svg>
                </div>
              </div>
            )}
          </Card>

          <Card pad={20}>
            <Eyebrow>Contact</Eyebrow>
            {locked ? (
              <div style={{ display: "grid", gap: 8 }}>
                {["Phone", "Email", "DBS certificate number"].map((f) => (
                  <div key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", background: C.chalk, borderRadius: 3, border: `1px solid ${C.line}` }}>
                    <span style={{ fontFamily: display, fontSize: 12.5, color: C.slate }}>{f}</span>
                    <span style={{ color: C.mute }}><Lock /></span>
                  </div>
                ))}
                <p style={{ fontFamily: body, fontSize: 13, color: C.slate, lineHeight: 1.5, margin: "4px 0 0" }}>Released when Amara accepts your shortlist request.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, fontFamily: body, fontSize: 15, color: C.ink }}>
                <div>07700 900412</div>
                <div>amara.nwosu@example.com</div>
                <div style={{ paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontFamily: display, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute }}>DBS certificate</div>
                  <div style={{ fontFamily: display, fontSize: 15, letterSpacing: "0.04em" }}>001234567890</div>
                  <p style={{ fontFamily: body, fontSize: 13, color: C.slate, lineHeight: 1.5, margin: "6px 0 0" }}>Run the Update Service status check yourself — we haven't verified this certificate.</p>
                </div>
              </div>
            )}
          </Card>

          <Card pad={20}>
            <Eyebrow>Availability</Eyebrow>
            <div style={{ fontFamily: display, fontSize: 17, fontWeight: 700, color: C.verd }}>Available now</div>
            <p style={{ fontFamily: body, fontSize: 14, color: C.slate, lineHeight: 1.55, margin: "8px 0 12px" }}>Days, waking nights and weekends. Will travel 10 miles. Driver with own car.</p>
            <div style={{ fontFamily: display, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.mute }}>Active 2 days ago</div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* --- style constants ----------------------------------------------------- */

const h2 = { fontFamily: display, fontSize: 25, fontWeight: 700, color: C.ink, margin: "0 0 6px", letterSpacing: "-0.02em" };
const lede = { fontFamily: body, fontSize: 16, color: C.slate, margin: "0 0 26px", lineHeight: 1.5 };
const prose = { fontFamily: body, fontSize: 16.5, lineHeight: 1.65, color: C.slate, margin: "0 0 14px" };
const noteBox = { border: `1px solid ${C.line}`, borderRadius: 3, padding: 16, background: C.chalk, marginBottom: 18 };
const noteP = { fontFamily: body, fontSize: 14, lineHeight: 1.55, color: C.slate, margin: "6px 0 0" };
const btnSolid = { fontFamily: display, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.02em", padding: "11px 22px", borderRadius: 3, border: `1px solid ${C.verd}`, background: C.verd, color: "#fff", cursor: "pointer" };
const btnGhost = { fontFamily: display, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.02em", padding: "11px 22px", borderRadius: 3, border: `1px solid ${C.line}`, background: C.card, color: C.ink, cursor: "pointer" };

/* --- shell --------------------------------------------------------------- */

export default function App() {
  const [view, setView] = useState("profile");

  return (
    <div style={{ background: C.paper, minHeight: "100vh", padding: "0 0 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap');
        * { -webkit-font-smoothing: antialiased; }
        button:focus-visible, input:focus-visible, textarea:focus-visible {
          outline: 2px solid ${C.verd}; outline-offset: 2px;
        }
        @media (max-width: 860px) {
          .two-col { grid-template-columns: minmax(0,1fr) !important; }
          .two-col > div[style*="sticky"], .two-col > section[style*="sticky"] { position: static !important; }
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <header style={{ background: C.card, borderBottom: `1px solid ${C.line}`, marginBottom: 26 }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
          <div style={{ fontFamily: display, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}>
            care<span style={{ color: C.verd }}>·</span>register
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {[["join", "Join"], ["find", "Find people"], ["profile", "Profile"]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                style={{
                  fontFamily: display, fontSize: 13, fontWeight: 600, padding: "8px 14px",
                  border: "none", background: "transparent", cursor: "pointer",
                  color: view === k ? C.ink : C.mute,
                  borderBottom: `2px solid ${view === k ? C.verd : "transparent"}`,
                }}
              >
                {l}
              </button>
            ))}
          </nav>
          <div style={{ marginLeft: "auto", fontFamily: display, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.mute }}>
            Free for people looking for work
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px" }}>
        {view === "join" && <Join />}
        {view === "find" && <Find />}
        {view === "profile" && <Profile />}
      </main>
    </div>
  );
}
