import { ensureUser, parseRuDateTime } from "../support/data";
import { Given } from "../support/fixtures";

// В домене «вошёл» — значит, сервисы вызываются от имени этого пользователя.
Given("я вошёл как {string}", async ({ ctx }, login: string) => {
  ctx.user = await ensureUser(login);
});

// «Сейчас» для сервисов, которые его принимают (план среза 2, решение 4).
Given("сегодня {string}", async ({ ctx }, date: string) => {
  ctx.now = parseRuDateTime(date);
});
