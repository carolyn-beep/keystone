function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function getTodayLocalDate(): string {
  return formatLocalDate(new Date());
}
