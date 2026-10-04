import type { ReactNode } from "react";

type SettingsRowProps = {
  label: ReactNode;
  /** Current value or a short explanation under the label. */
  value?: ReactNode;
  /** Button, switch or status on the right. */
  action?: ReactNode;
  labelId?: string;
  valueId?: string;
};

export function SettingsRow({ label, value, action, labelId, valueId }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p id={labelId} className="font-semibold">
          {label}
        </p>
        {value ? (
          <p id={valueId} className="mt-0.5 text-sm break-words text-ink-2">
            {value}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
