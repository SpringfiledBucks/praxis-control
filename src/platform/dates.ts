export function formatDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  const datePrefix = /^\d{4}-\d{2}-\d{2}/.exec(text);
  if (datePrefix) return datePrefix[0];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date value: ${text}`);
  return parsed.toISOString().slice(0, 10);
}

export function addDateOnlyDays(value: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date-only value: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function currentWeekStart(now = new Date(), timeZone = 'Asia/Shanghai'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((item) => item.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} while formatting date`);
    return value;
  };
  const localDate = `${part('year')}-${part('month')}-${part('day')}`;
  const utcDay = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return addDateOnlyDays(localDate, -((utcDay + 6) % 7));
}
