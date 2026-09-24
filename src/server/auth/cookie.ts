// Имя cookie сессии. Отдельный модуль без зависимостей: его читает proxy,
// которому нельзя тянуть за собой базу.
export const SESSION_COOKIE = "verba_session";
