import { ProfileView } from "@/components/profile/ProfileView";
import type { ProfileData } from "@/lib/types";

// Replace with a Supabase fetch (server component, so this can be an
// `await` straight from the route handler). Kept as static mock data here
// so the UI is reviewable without wiring the DB first.
const mockProfile: ProfileData = {
  id: "profile_sarah_jenkins",
  fullName: "Sarah Jenkins",
  initials: "SJ",
  roleTitle: "Registered Nurse — Adult",
  location: "Enfield",
  availability: "available in 2 weeks",
  findable: true,
  about:
    "Adult nurse with six years across acute medical and emergency settings. Comfortable leading a bay independently and mentoring newly qualified staff. Looking for a permanent day-shift role within travelling distance of Enfield.",
  registrationsAndTraining: [
    { id: "nmc", title: "NMC registration", subtitle: "Checked 12 Aug 2026", grade: "verified" },
    {
      id: "degree",
      title: "BSc (Hons) Adult Nursing",
      subtitle: "Certificate uploaded",
      grade: "evidenced",
    },
    { id: "als", title: "ALS provider", subtitle: "Refreshed 2026, declared", grade: "declared" },
  ],
  experience: [
    {
      id: "years",
      title: "6 years, acute medical & ED",
      subtitle: "Worked out from your history",
      grade: "derived",
    },
    {
      id: "current-role",
      title: "St Thomas' Hospital",
      subtitle: "Senior Staff Nurse · 2021–present",
      grade: "derived",
    },
  ],
  currentEmployerName: "St Thomas' Hospital",
  dbs: { state: "current_no_new_information" },
};

export default function ProfilePage() {
  return <ProfileView profile={mockProfile} />;
}
