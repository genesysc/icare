"use client";

import { useRouter } from "next/navigation";
import { CvUpload } from "./steps";

export function CvGate() {
  const router = useRouter();
  return <CvUpload onSkip={() => router.push("/candidate/onboarding?step=1")} />;
}
