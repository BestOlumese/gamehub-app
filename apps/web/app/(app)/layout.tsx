import type { ReactNode } from "react";
import { PresenceRoot } from "@/components/presence/presence-root";

/** Signed-in pages: presence (friends online, invites as toasts) runs on all of them. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PresenceRoot />
    </>
  );
}
