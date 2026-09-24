import {
  MONTHS_GENITIVE,
  MONTHS_NOMINATIVE,
  MONTHS_SHORT,
  clock,
  dayNumber,
  pad2,
  weekday,
  zoned,
} from "../time";

// Строки, которые видит пользователь: автоназвание (BR-14), группы дат
// (BR-13), метаданные записи, время реплики (BR-18). Экраны их только
// раскладывают (план среза 2, решение 4).

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// «42 мин», «1 ч 04 мин», «2 ч». До ближайшей минуты, не меньше одной.
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${pad2(rest)} мин`;
}

export function formatSpeakers(count: number): string {
  return `${count} ${plural(count, "спикер", "спикера", "спикеров")}`;
}

// Время реплики от начала записи: всегда «чч:мм:сс» (решение 1).
export function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

// ISO 8601 для <time dateTime>: «PT9S», «PT1H2M3S».
export function isoOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

export type TitleFacts = {
  createdAt: Date;
  durationMs: number | null;
  // Число спикеров готовой записи; null — запись ещё не готова.
  speakerCount: number | null;
};

// «19 сен, 42 мин, 3 спикера». Неизвестные части опускаются.
export function autoTitle({ createdAt, durationMs, speakerCount }: TitleFacts): string {
  const d = zoned(createdAt);
  const parts = [`${d.day} ${MONTHS_SHORT[d.month - 1]}`];
  if (durationMs != null) parts.push(formatDuration(durationMs));
  if (speakerCount) parts.push(formatSpeakers(speakerCount));
  return parts.join(", ");
}

export function displayTitle(title: string | null, facts: TitleFacts): string {
  return title?.trim() || autoTitle(facts);
}

type DayKind = "today" | "yesterday" | "week" | "earlier";

function dayKind(createdAt: Date, now: Date): DayKind {
  const today = zoned(now);
  const todayNo = dayNumber(today);
  const dayNo = dayNumber(zoned(createdAt));
  if (dayNo >= todayNo) return "today";
  if (dayNo === todayNo - 1) return "yesterday";
  if (dayNo >= todayNo - (weekday(today) - 1)) return "week";
  return "earlier";
}

// «Сегодня», «Вчера», «На этой неделе», дальше «Сентябрь 2026» (решение 2).
export function dateGroupLabel(createdAt: Date, now: Date): string {
  switch (dayKind(createdAt, now)) {
    case "today":
      return "Сегодня";
    case "yesterday":
      return "Вчера";
    case "week":
      return "На этой неделе";
    case "earlier": {
      const d = zoned(createdAt);
      return `${MONTHS_NOMINATIVE[d.month - 1]} ${d.year}`;
    }
  }
}

// Строка под названием в списке: «14:05 · 42 мин» для сегодня и вчера,
// «17 сен, 10:15 · 35 мин» раньше, «17 сен 2025, 10:15 · 35 мин» в прошлые годы.
export function listMeta(createdAt: Date, durationMs: number | null, now: Date): string {
  const d = zoned(createdAt);
  const kind = dayKind(createdAt, now);
  let when = clock(d);
  if (kind !== "today" && kind !== "yesterday") {
    const year = d.year === zoned(now).year ? "" : ` ${d.year}`;
    when = `${d.day} ${MONTHS_SHORT[d.month - 1]}${year}, ${when}`;
  }
  return durationMs == null ? when : `${when} · ${formatDuration(durationMs)}`;
}

// Строка под названием в шапке транскрипта:
// «19 сентября, 14:05 · 42 мин · 3 спикера».
export function transcriptMeta(facts: TitleFacts, now: Date): string {
  const d = zoned(facts.createdAt);
  const year = d.year === zoned(now).year ? "" : ` ${d.year}`;
  const parts = [`${d.day} ${MONTHS_GENITIVE[d.month - 1]}${year}, ${clock(d)}`];
  if (facts.durationMs != null) parts.push(formatDuration(facts.durationMs));
  if (facts.speakerCount) parts.push(formatSpeakers(facts.speakerCount));
  return parts.join(" · ");
}
