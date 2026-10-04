import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileSection } from "@/components/settings/profile-section";
import { SectionSkeleton } from "@/components/settings/section-skeleton";

export const metadata: Metadata = { title: "Profile settings" };

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <ProfileSection />
    </Suspense>
  );
}
