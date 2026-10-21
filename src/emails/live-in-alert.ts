// Live-in availability alert. Content is deliberately narrow (handover §5.2
// and §7): area, block length, rate and start date only. No client name, no
// care-plan detail, no address — the platform does not hold those here and
// the email must not imply otherwise.
//
// Every send includes a management/unsubscribe link. Unsubscribing requires
// sign-in, which is why the link goes to the profile page rather than a
// one-click token: the profile page is the single place the three consents
// are changed, and it is auditable.

export type LiveInAlertRole = {
  title: string | null;
  area: string | null;
  rate: string;
  startDate: string | null;
  blocks: string;
};

const RATE_BASIS_LABELS: Record<string, string> = { day: "per day", "24h": "per 24 hours", week: "per week" };

// "£950.00 per week (plus travel)" — handover §7: rate basis and amount.
export function formatLiveInRate(basis: string | null, pence: number | null, note: string | null): string {
  const amount =
    basis && typeof pence === "number"
      ? `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })} ${RATE_BASIS_LABELS[basis] || basis}`
      : "";
  if (amount && note) return `${amount} (${note})`;
  return amount || note || "To be agreed";
}

function formatStart(date: string | null): string {
  if (!date) return "To be agreed";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type LiveInAlertEmailData = {
  displayName: string;
  roles: LiveInAlertRole[];
  siteUrl: string;
};

export function liveInAlertEmail(data: LiveInAlertEmailData): { subject: string; html: string } {
  const firstName = (data.displayName || "").trim().split(/\s+/)[0] || "there";
  const first = data.roles[0];
  const many = data.roles.length > 1;
  const subject = many
    ? `${data.roles.length} new live-in vacancies on iCare`
    : `New live-in vacancy: ${first.area || "UK"}${first.blocks ? ` — ${first.blocks}` : ""}`;

  const cards = data.roles
    .map(
      (role) => `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #d9d2e6;border-radius:12px;">
        <tr><td style="padding:16px 18px;font-size:15px;line-height:1.7;">
          ${role.title ? `<strong style="color:#330072;">${escapeHtml(role.title)}</strong><br />` : ""}
          <strong>Area:</strong> ${escapeHtml(role.area || "Not specified")}<br />
          <strong>Block:</strong> ${escapeHtml(role.blocks || "To be agreed")}<br />
          <strong>Rate:</strong> ${escapeHtml(role.rate)}<br />
          <strong>Start:</strong> ${escapeHtml(formatStart(role.startDate))}
        </td></tr>
      </table>`
    )
    .join("");

  const heading = many
    ? `${data.roles.length} new live-in vacancies, ${escapeHtml(firstName)}.`
    : `New live-in vacancy in ${escapeHtml(first.area || "the UK")}, ${escapeHtml(firstName)}.`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:#5b5670;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#330072;margin-bottom:32px;">
        i<span style="color:#00A499;">Care</span>
      </div>

      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#330072;line-height:1.3;margin:0 0 16px;">
        ${heading}
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">
        ${many ? "New live-in vacancies have" : "A new live-in vacancy has"} been posted on iCare.
      </p>
${cards}
      <p style="font-size:16px;line-height:1.6;margin:8px 0 28px;">
        If you'd like to hear more, open your live-in profile and tap <strong>I'm interested</strong>. We only share your name and contact details with the iCare team when you do, and we'll be in touch.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.siteUrl}/live-in-profile#vacancies" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">See the vacancy</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you opted into live-in alerts.
        <a href="${data.siteUrl}/live-in-profile" style="color:#8a8599;">Change frequency or switch alerts off</a>.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(text: string | null | undefined): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
