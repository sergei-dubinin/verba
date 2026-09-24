// Одна ошибка на неверный пароль и несуществующий логин: сообщение не
// должно выдавать, есть ли такой пользователь (BR-23).
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Неверный логин или пароль");
    this.name = "InvalidCredentialsError";
  }
}

export class UserExistsError extends Error {
  constructor(login: string) {
    super(`Пользователь «${login}» уже есть`);
    this.name = "UserExistsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(login: string) {
    super(`Пользователя «${login}» нет`);
    this.name = "UserNotFoundError";
  }
}

export class EmptyPasswordError extends Error {
  constructor() {
    super("Пароль не может быть пустым");
    this.name = "EmptyPasswordError";
  }
}
