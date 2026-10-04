import { Suspense } from "react";
import { ProfileSection } from "@/components/settings/profile-section";
import { SectionSkeleton } from "@/components/settings/section-skeleton";
import { SettingsNav } from "@/components/settings/settings-nav";

/** Phones: the list of sections. Laptops: the sidebar (in the layout) plus Profile. */
export default function SettingsIndexPage() {
  return (
    <>
      <div className="lg:hidden">
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Settings</h1>
        <SettingsNav variant="list" />
      </div>
      <div className="hidden lg:block">
        <Suspense fallback={<SectionSkeleton />}>
          <ProfileSection />
        </Suspense>
      </div>
    </>
  );
}
