import { Laptop, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOutOthersButton } from "@/components/settings/log-out-others-button";
import { PasswordDialog } from "@/components/settings/password-dialog";
import { SectionHeader } from "@/components/settings/section-header";
import { SectionSkeleton } from "@/components/settings/section-skeleton";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { StatusPill } from "@/components/settings/status-pill";
import { signInMethods } from "@/server/accounts";
import { listDevices } from "@/server/devices";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Security settings" };

const when = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

async function Security() {
  const user = await requirePlayer();
  const [methods, devices] = await Promise.all([signInMethods(user.id), listDevices()]);
  const hasPassword = methods.has("credential");
  const others = devices.filter((d) => !d.current).length;

  return (
    <>
      <SectionHeader
        title="Security"
        description="Your password and the devices you're logged in on."
      />

      <SettingsGroup title="Password">
        {hasPassword ? (
          <SettingsRow
            label="Password"
            value="Changing it logs you out everywhere else."
            action={<PasswordDialog />}
          />
        ) : (
          <SettingsRow
            label="Password"
            value="You sign in with Google, so there's no GameHub password."
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Devices">
        {devices.map((d) => {
          const Icon = /Android|iPhone/.test(d.name) ? Smartphone : Laptop;
          return (
            <div key={d.id} className="flex items-center gap-4 px-4 py-4 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink-2">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="text-sm text-ink-2">
                  {d.current ? "Active now" : `Last active ${when.format(d.lastActive)}`}
                </p>
              </div>
              {d.current ? <StatusPill on>This device</StatusPill> : null}
            </div>
          );
        })}
      </SettingsGroup>
      {others > 0 ? (
        <div className="-mt-4 flex justify-end">
          <LogOutOthersButton />
        </div>
      ) : null}
    </>
  );
}

export default function SecuritySettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Security />
    </Suspense>
  );
}
