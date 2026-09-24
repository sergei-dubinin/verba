// Отказы при загрузке. Текст — тот, что видит пользователь в шторке
// загрузки (docs/design/screens/upload-format-error.html).

export class UnsupportedFormatError extends Error {
  constructor() {
    super("Поддерживаются только записи Диктофона iPhone (.m4a)");
    this.name = "UnsupportedFormatError";
  }
}

export class RecordingTooLongError extends Error {
  constructor() {
    super("Записи длиннее 3 часов не принимаются");
    this.name = "RecordingTooLongError";
  }
}
