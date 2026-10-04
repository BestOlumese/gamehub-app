import { Avatar } from "@gamehub/ui/data-display/avatar";
import { requirePlayer } from "@/server/session";
import { SectionHeader } from "./section-header";
import { SettingsGroup } from "./settings-group";
import { SettingsRow } from "./settings-row";

const joined = new Intl.DateTimeFormat("en-NG", {
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

export async function ProfileSection() {
  const user = await requirePlayer();
  return (
    <>
      <SectionHeader title="Profile" description="How other players see you at the table." />
      <div className="mb-8 flex items-center gap-5 rounded-card border border-line bg-surface p-5 shadow-sm sm:p-6">
        <Avatar username={user.username} image={user.image} size={72} />
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-extrabold tracking-tight">
            @{user.username}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">Joined {joined.format(user.createdAt)}</p>
        </div>
      </div>
      <SettingsGroup title="Details">
        <SettingsRow label="Username" value={`@${user.username} · usernames can't be changed`} />
        <SettingsRow
          label="Avatar"
          value={
            user.image
              ? "Your Google profile photo."
              : "Your initials on a colour picked from your username."
          }
        />
      </SettingsGroup>
    </>
  );
}
