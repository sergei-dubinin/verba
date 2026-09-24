"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const failed = !!state.error && !pending;

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.group}>
        <div className={`${styles.card} ${failed ? styles.cardError : ""}`}>
          <label htmlFor="login" className={`t-body ${styles.label}`}>
            Логин
          </label>
          <input
            // После ответа сервера React сбрасывает форму; key пересоздаёт
            // поле, чтобы в нём остался введённый логин.
            key={state.login ?? ""}
            id="login"
            name="login"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="ivanov"
            defaultValue={state.login}
            disabled={pending}
            aria-invalid={failed || undefined}
            className={`t-body ${styles.input}`}
          />
          <div className={styles.divider} />
          <label htmlFor="password" className={`t-body ${styles.label}`}>
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            aria-invalid={failed || undefined}
            className={`t-body ${styles.input}`}
          />
        </div>
        {failed && (
          <p role="alert" className={`t-caption ${styles.error}`}>
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={`t-button-large ${styles.submit}`}>
        {pending && <span className={styles.spinner} aria-hidden="true" />}
        {pending ? "Вход…" : "Войти"}
      </button>
      <p className={`t-caption ${styles.hint}`}>Доступ выдаёт администратор</p>
    </form>
  );
}
