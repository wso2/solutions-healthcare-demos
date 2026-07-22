const SUMMARY_MAX_LENGTH = 110;

export function summarize(text: string, maxLength = SUMMARY_MAX_LENGTH): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
