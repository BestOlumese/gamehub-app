import { AppHeader } from "@/components/app/app-header";
import { requirePlayer } from "@/server/session";

export async function SettingsHeader() {
  const user = await requirePlayer();
  return <AppHeader user={user} />;
}
