"use client";

import { Switch } from "@gamehub/ui/forms/switch";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { SettingsRow } from "./settings-row";

type Prefs = { soundOn: boolean; reducedMotion: boolean };

/** Saves each switch as it's flipped; flips back if the save fails. */
export function PreferencesForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function update(key: keyof Prefs, value: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    setError(null);
    const { error: err } = await authClient.updateUser({ [key]: value });
    if (err) {
      setPrefs(before);
      setError("Couldn't save that. Check your connection and try again.");
    }
  }

  return (
    <>
      <SettingsRow
        labelId="sound-label"
        valueId="sound-desc"
        label="Sound"
        value="Card flicks, dice rolls and voice lines during games."
        action={
          <Switch
            checked={prefs.soundOn}
            onChange={(v) => update("soundOn", v)}
            labelledBy="sound-label"
            describedBy="sound-desc"
          />
        }
      />
      <SettingsRow
        labelId="motion-label"
        valueId="motion-desc"
        label="Reduce motion"
        value="Shorter animations, no bouncing or shaking."
        action={
          <Switch
            checked={prefs.reducedMotion}
            onChange={(v) => update("reducedMotion", v)}
            labelledBy="motion-label"
            describedBy="motion-desc"
          />
        }
      />
      {error ? (
        <p role="alert" className="px-4 py-3 text-sm text-danger-strong sm:px-5">
          {error}
        </p>
      ) : null}
    </>
  );
}
