import { parseHourlyPay } from "./pay";
import { detectSponsorship, mapSponsorshipState, type SponsorshipState } from "./sponsorship";

export type RejectReason =
  | "pay_unverified" | "below_minimum" | "no_apply_link" | "duplicate"
  | "no_register_match" | "sponsorship_refused";

export interface Job {
  title: string;
  location: string;
  payText: string | null;
  hoursText: string | null;
  applyUrl: string;
  description: string;
}
export interface Settings { minHourlyPay: number; defaultWeeklyHours: number }
export interface Ctx { registerMatched: boolean; existingKeys: Set<string>; settings: Settings }
export interface Verdict {
  publish: boolean;
  reasons: RejectReason[];
  hourly: number | null;
  sponsorshipState: SponsorshipState;
  note?: string;
}

export const jobKey = (title: string, location: string) =>
  `${title.trim().toLowerCase()}|${location.trim().toLowerCase()}`;

/** Deterministic rules: no AI judgement. Pure function. */
export function evaluateJob(job: Job, ctx: Ctx): Verdict {
  const reasons: RejectReason[] = [];
  const pay = parseHourlyPay(job.payText, job.hoursText, ctx.settings.defaultWeeklyHours);
  if (pay.hourly === null) reasons.push("pay_unverified");
  else if (Math.round(pay.hourly * 100) / 100 < ctx.settings.minHourlyPay) reasons.push("below_minimum");
  if (!job.applyUrl || !/^https?:\/\//i.test(job.applyUrl)) reasons.push("no_apply_link");
  if (!ctx.registerMatched) reasons.push("no_register_match");
  if (ctx.existingKeys.has(jobKey(job.title, job.location))) reasons.push("duplicate");
  const spons = detectSponsorship(job.description);
  if (spons.mentions && spons.negated) reasons.push("sponsorship_refused");
  const m = mapSponsorshipState(job.title, job.description);
  return {
    publish: reasons.length === 0,
    reasons,
    hourly: pay.hourly,
    sponsorshipState: m.state,
    ...(m.note ? { note: m.note } : {}),
  };
}
