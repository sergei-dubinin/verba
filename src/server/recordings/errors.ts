// Чужая и несуществующая запись неотличимы: одна ошибка, один текст,
// чтобы не подтверждать, что такой id существует (BR-22).
export class RecordingNotFoundError extends Error {
  constructor() {
    super("Запись не найдена");
    this.name = "RecordingNotFoundError";
  }
}

// Переход статуса не из таблицы в docs/architecture.md.
export class InvalidStatusTransitionError extends Error {
  constructor(recordingId: string, from: string, to: string) {
    super(`Запись ${recordingId}: переход ${from} → ${to} не разрешён`);
    this.name = "InvalidStatusTransitionError";
  }
}
