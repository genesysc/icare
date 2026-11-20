export type PayResult = { hourly: number | null; reason?: "pay_unverified" };

const UNVERIFIED: PayResult = { hourly: null, reason: "pay_unverified" };

/**
 * Turn advert pay text into an hourly figure. Takes the lower end of a range.
 * Annual salaries are divided by 52 weeks and the stated (or default) weekly
 * hours. Monthly/weekly/daily or non-numeric pay is never guessed.
 */
export function parseHourlyPay(
  payText: string | null | undefined,
  hoursText: string | null | undefined,
  defaultWeeklyHours: number,
): PayResult {
  if (!payText) return UNVERIFIED;
  // "£13.50 per hour", or a bare figure such as "54000.00"
  const m = payText.match(/£\s*(\d[\d,]*(?:\.\d+)?)/) ?? payText.trim().match(/^(\d[\d,]*(?:\.\d+)?)$/);
  if (!m) return UNVERIFIED;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(amount) || amount <= 0) return UNVERIFIED;
  const t = payText.toLowerCase();
  if (!payText.includes("£") && amount < 100) return UNVERIFIED; // a small bare number has no unit

  if (/(per|an?|\/)\s*(hour|hr)\b|\bph\b|hourly/.test(t)) return { hourly: amount };
  if (/(per|a|\/)\s*(month|week|day)\b|monthly|weekly|daily/.test(t)) return UNVERIFIED;
  const annual = /(per\s*annum|per\s*year|a\s*year|annum|annual|\bp\.?a\.?\b|\/\s*year)/.test(t) || amount >= 100;
  if (annual) {
    const hm = (hoursText || "").match(/(\d+(?:\.\d+)?)\s*(?:hours|hrs|h)\b/i);
    const hours = hm ? parseFloat(hm[1]) : defaultWeeklyHours;
    if (!hours) return UNVERIFIED;
    return { hourly: amount / 52 / hours };
  }
  return { hourly: amount };
}
