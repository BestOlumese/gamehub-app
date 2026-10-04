"use client";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** id of the element that labels this switch. */
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
};

export function Switch({ checked, onChange, labelledBy, describedBy, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-(--dur-press) disabled:opacity-60 " +
        (checked ? "bg-brand" : "bg-line")
      }
    >
      <span
        aria-hidden="true"
        className={
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-(--dur-press) " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}
