import type { Metadata } from "next";
import { Suspense } from "react";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { SectionHeader } from "@/components/settings/section-header";
import { SectionSkeleton } from "@/components/settings/section-skeleton";
import { SettingsGroup } from "@/components/settings/settings-group";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Game preferences" };

async function Preferences() {
  const user = await requirePlayer({ fresh: true });
  return (
    <>
      <SectionHeader
        title="Game preferences"
        description="How games look and sound on this account. Changes save straight away."
      />
      <SettingsGroup>
        <PreferencesForm
          initial={{ soundOn: user.soundOn ?? true, reducedMotion: user.reducedMotion ?? false }}
        />
      </SettingsGroup>
    </>
  );
}

export default function PreferencesSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Preferences />
    </Suspense>
  );
}
