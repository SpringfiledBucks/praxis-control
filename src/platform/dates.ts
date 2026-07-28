export function formatDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  const datePrefix = /^\d{4}-\d{2}-\d{2}/.exec(text);
  if (datePrefix) return datePrefix[0];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date value: ${text}`);
  return parsed.toISOString().slice(0, 10);
}
