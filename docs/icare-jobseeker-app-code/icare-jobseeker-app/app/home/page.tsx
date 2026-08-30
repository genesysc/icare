import type { Invite } from "@/lib/types";
import { HomeFeed } from "@/components/home/HomeFeed";

// Replace with a Supabase fetch keyed on the signed-in candidate.
const mockNewInvites: Invite[] = [
  {
    id: "inv_1",
    employerName: "St Gabriel's Trust",
    employerInitials: "SG",
    roleTitle: "Band 6 Physiotherapist",
    setting: "Acute",
    location: "Enfield",
    distanceMiles: 3.2,
    hoursPattern: "Full time, rotational",
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    status: "new",
  },
  {
    id: "inv_2",
    employerName: "Meadowvale Health Group",
    employerInitials: "MH",
    roleTitle: "Practice Nurse",
    setting: "Primary care",
    location: "Barnet",
    distanceMiles: 5.8,
    hoursPattern: "Weekdays, no weekends",
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    status: "new",
  },
];

const mockFeed = [
  {
    id: "post_1",
    authorName: "Amara Okoye",
    authorRole: "Registered Nurse",
    timeAgo: "2h",
    body: "Finally passed my ALS refresher — small win but a good one after a long week on the ward.",
  },
  {
    id: "post_2",
    authorName: "Beechwood House",
    authorRole: "Care home",
    timeAgo: "5h",
    body: "We're expanding our nights team and would love to hear from experienced senior carers in the Waltham Cross area.",
  },
];

export default function HomePage() {
  // Replace with the signed-in candidate's actual initials.
  return <HomeFeed invites={mockNewInvites} initialFeed={mockFeed} currentUserInitials="SJ" />;
}

