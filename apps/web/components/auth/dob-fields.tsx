import { Select } from "@gamehub/ui/forms/select";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Day / Month / Year selects. Native selects are quickest on Android. */
export function DobFields({
  error,
  currentYear,
}: {
  error?: string | undefined;
  currentYear: number;
}) {
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 10 - i);
  const invalid = error ? true : undefined;
  return (
    <fieldset aria-describedby="dob-msg">
      <legend className="mb-1.5 text-sm font-semibold text-ink">Date of birth</legend>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <Select
          name="day"
          aria-label="Day"
          defaultValue=""
          required
          autoComplete="bday-day"
          aria-invalid={invalid}
        >
          <option value="" disabled>
            Day
          </option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </Select>
        <Select
          name="month"
          aria-label="Month"
          defaultValue=""
          required
          autoComplete="bday-month"
          aria-invalid={invalid}
        >
          <option value="" disabled>
            Month
          </option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          name="year"
          aria-label="Year"
          defaultValue=""
          required
          autoComplete="bday-year"
          aria-invalid={invalid}
        >
          <option value="" disabled>
            Year
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      <p
        id="dob-msg"
        className={`mt-1.5 text-sm ${error ? "text-danger-strong" : "text-ink-2"}`}
        role={error ? "alert" : undefined}
      >
        {error ?? "You must be 18 or older. We don't keep your date of birth."}
      </p>
    </fieldset>
  );
}
