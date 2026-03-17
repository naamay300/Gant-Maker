import { addDays, differenceInDays, parseISO, format, startOfDay } from 'date-fns';

export const PIXELS_PER_DAY = 40;
export const ROW_HEIGHT = 48;
export const TASK_BAR_HEIGHT = 28;
export const TASK_LIST_WIDTH = 320;

export function dayOffsetToPixels(days: number): number {
  return days * PIXELS_PER_DAY;
}

export function pixelsToDayOffset(pixels: number): number {
  return Math.round(pixels / PIXELS_PER_DAY);
}

export function dateToPixelOffset(date: string, startDate: Date): number {
  const d = parseISO(date);
  const diff = differenceInDays(startOfDay(d), startOfDay(startDate));
  return diff * PIXELS_PER_DAY;
}

export function pixelOffsetToDate(pixels: number, startDate: Date): string {
  const days = Math.round(pixels / PIXELS_PER_DAY);
  return format(addDays(startDate, days), 'yyyy-MM-dd');
}

export function getTimelineStartDate(tasks: { startDate: string }[]): Date {
  if (tasks.length === 0) {
    return addDays(new Date(), -7);
  }
  const earliest = tasks.reduce((min, t) => {
    const d = parseISO(t.startDate);
    return d < min ? d : min;
  }, parseISO(tasks[0].startDate));
  return addDays(earliest, -3);
}

export function getTimelineEndDate(tasks: { startDate: string; duration: number }[]): Date {
  if (tasks.length === 0) {
    return addDays(new Date(), 30);
  }
  const latest = tasks.reduce((max, t) => {
    const end = addDays(parseISO(t.startDate), t.duration);
    return end > max ? end : max;
  }, addDays(parseISO(tasks[0].startDate), tasks[0].duration));
  return addDays(latest, 7);
}

export function generateDays(startDate: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

export function formatDayLabel(date: Date): string {
  return format(date, 'd');
}

export function formatMonthLabel(date: Date): string {
  const months: Record<string, string> = {
    Jan: 'ינואר', Feb: 'פברואר', Mar: 'מרץ', Apr: 'אפריל',
    May: 'מאי', Jun: 'יוני', Jul: 'יולי', Aug: 'אוגוסט',
    Sep: 'ספטמבר', Oct: 'אוקטובר', Nov: 'נובמבר', Dec: 'דצמבר'
  };
  const eng = format(date, 'MMM');
  return months[eng] || eng;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6; // Friday or Saturday (Israel)
}

export function isSameDay(a: Date, b: Date): boolean {
  return format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
}
