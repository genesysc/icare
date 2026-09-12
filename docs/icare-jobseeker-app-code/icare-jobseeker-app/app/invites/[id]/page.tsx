import { InviteDetail } from "@/components/invites/InviteDetail";
import type { Invite } from "@/lib/types";

// Replace with a Supabase fetch by params.id.
const mockInvite: Invite = {
  id: "inv_1",
  employerName: "St Gabriel's Trust",
  employerInitials: "SG",
  roleTitle: "Band 6 Physiotherapist",
  setting: "Acute",
  location: "Enfield",
  distanceMiles: 3.2,
  hoursPattern: "Rotational post across stroke and respiratory. Full time.",
  invitedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  status: "new",
};

export default function InviteDetailPage({ params }: { params: { id: string } }) {
  // params.id would key the real fetch; mock ignores it for now.
  return <InviteDetail invite={mockInvite} />;
}
