// Время приложения. Даты показываются в одном поясе — не сервера (на VPS
// обычно UTC) и не браузера: пользователи в одном поясе (план среза 2,
// решение 3).
export const APP_TIME_ZONE = "Europe/Moscow";

// Свои названия месяцев: Intl для ru даёт «сент.», а в макетах «сен».
export const MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек",
];
export const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
export const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

// Календарная дата и время момента в поясе приложения. month — 1…12.
export type ZonedDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function zoned(date: Date): ZonedDateTime {
  const parts: Record<string, number> = {};
  for (const p of partsFormat.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

// Номер календарного дня: разность двух номеров — число дней между датами.
export function dayNumber(d: Pick<ZonedDateTime, "year" | "month" | "day">): number {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

// День недели: 1 — понедельник … 7 — воскресенье.
export function weekday(d: Pick<ZonedDateTime, "year" | "month" | "day">): number {
  const sundayZero = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return sundayZero === 0 ? 7 : sundayZero;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function clock(d: ZonedDateTime): string {
  return `${pad2(d.hour)}:${pad2(d.minute)}`;
}

// Смещение пояса приложения в момент времени, мс: «GMT+03:00» → 3 ч.
function zoneOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(name)!;
  if (!m[1]) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

// Дата и время на часах приложения → момент времени. День может выходить за
// пределы месяца: Date.UTC сам переносит его (day = 0 — последний день
// прошлого месяца).
export function fromZoned(d: ZonedDateTime): Date {
  const asUtc = Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute);
  return new Date(asUtc - zoneOffsetMs(new Date(asUtc)));
}
