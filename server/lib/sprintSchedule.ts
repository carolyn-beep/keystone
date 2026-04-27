const ISO_LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const SPRINT_PLAN_DAY_COUNT = 30;
export const DEFAULT_SPRINT_ACTIVE_WEEKDAYS = [1, 2, 3, 4, 5] as const;

export interface SprintScheduleDefinition {
  activeWeekdays: number[];
}

export interface SprintDaySlot {
  dayIndex: number;
  dayNumber: number;
  weekNumber: number;
  dayInWeek: number;
  scheduledDate: string;
}

function parseIsoDate(value: string, label: string): Date {
  if (!ISO_LOCAL_DATE_REGEX.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }

  return parsed;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, dayCount: number): Date {
  return new Date(value.getTime() + dayCount * MS_PER_DAY);
}

function normalizeSchedule(schedule?: Partial<SprintScheduleDefinition>): SprintScheduleDefinition {
  const sourceWeekdays = schedule?.activeWeekdays ?? DEFAULT_SPRINT_ACTIVE_WEEKDAYS;
  const normalizedWeekdays = Array.from(new Set(sourceWeekdays))
    .sort((left, right) => left - right);

  if (normalizedWeekdays.length === 0) {
    throw new Error('Sprint schedule must include at least one active weekday');
  }

  normalizedWeekdays.forEach((weekday) => {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error('Sprint schedule weekdays must be integers between 0 (Sun) and 6 (Sat)');
    }
  });

  return {
    activeWeekdays: normalizedWeekdays,
  };
}

function isActiveWeekday(date: Date, schedule: SprintScheduleDefinition): boolean {
  return schedule.activeWeekdays.includes(date.getUTCDay());
}

export function getFirstScheduledDateOnOrAfter(
  localDate: string,
  schedule?: Partial<SprintScheduleDefinition>,
): string {
  const resolvedSchedule = normalizeSchedule(schedule);
  let cursor = parseIsoDate(localDate, 'localDate');

  while (!isActiveWeekday(cursor, resolvedSchedule)) {
    cursor = addUtcDays(cursor, 1);
  }

  return toIsoDate(cursor);
}

export function buildSprintDaySlots(
  startDate: string,
  count = SPRINT_PLAN_DAY_COUNT,
  schedule?: Partial<SprintScheduleDefinition>,
): SprintDaySlot[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Sprint day count must be a positive integer');
  }

  const resolvedSchedule = normalizeSchedule(schedule);
  const workdaysPerWeek = resolvedSchedule.activeWeekdays.length;
  let cursor = parseIsoDate(startDate, 'startDate');

  if (!isActiveWeekday(cursor, resolvedSchedule)) {
    throw new Error(`startDate ${startDate} is not on an active sprint day`);
  }

  const slots: SprintDaySlot[] = [];

  while (slots.length < count) {
    if (isActiveWeekday(cursor, resolvedSchedule)) {
      const dayIndex = slots.length;
      slots.push({
        dayIndex,
        dayNumber: dayIndex + 1,
        weekNumber: Math.floor(dayIndex / workdaysPerWeek) + 1,
        dayInWeek: (dayIndex % workdaysPerWeek) + 1,
        scheduledDate: toIsoDate(cursor),
      });
    }

    cursor = addUtcDays(cursor, 1);
  }

  return slots;
}
