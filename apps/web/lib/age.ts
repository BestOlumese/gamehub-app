export const MIN_AGE = 18;

export type DateParts = { day: number; month: number; year: number };

/** True if the calendar date exists (rejects 31 April, 29 Feb in non-leap years). */
export function isRealDate({ day, month, year }: DateParts): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (month < 1 || month > 12 || day < 1 || year < 1900) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Age in whole years on `today`. Someone born on 29 February turns a year older
 * on 1 March in non-leap years.
 */
export function ageOn(dob: DateParts, today: DateParts): number {
  let age = today.year - dob.year;
  const hadBirthday =
    today.month > dob.month || (today.month === dob.month && today.day >= dob.day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function isAdult(dob: DateParts, today: DateParts): boolean {
  return isRealDate(dob) && ageOn(dob, today) >= MIN_AGE;
}

/** Today's date in Lagos (UTC+1, no DST). */
export function todayInLagos(now: Date): DateParts {
  const t = new Date(now.getTime() + 60 * 60 * 1000);
  return { day: t.getUTCDate(), month: t.getUTCMonth() + 1, year: t.getUTCFullYear() };
}
