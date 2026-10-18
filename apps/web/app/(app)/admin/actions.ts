"use server";

import { requireAdmin } from "@/server/admin";
import { moderate, type ModAction } from "@/server/moderation";

/** One moderation step from the admin page. */
export async function moderateAction(a: ModAction): Promise<{ ok: true }> {
  const me = await requireAdmin();
  await moderate(me.id, a);
  return { ok: true };
}
