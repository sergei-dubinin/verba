// Логи доменных событий: одна строка JSON на событие, с id объектов.
type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "info") console.info(line);
  else console.error(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error: (event: string, fields: Fields = {}) => write("error", event, fields),
};
