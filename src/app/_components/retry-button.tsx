"use client";

import { useFormStatus } from "react-dom";
import { retryRecording } from "../recordings/actions";
import styles from "./retry-button.module.css";

function Submit({ size }: { size: "row" | "large" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${size === "row" ? "t-button-utility" : "t-body"} ${styles.button} ${styles[size]}`}
    >
      Повторить
    </button>
  );
}

// «Повторить» после сбоя обработки (BR-08): строка списка (list.html) и
// экран транскрипта (transcript-error.html).
export function RetryButton({ id, size }: { id: string; size: "row" | "large" }) {
  return (
    <form action={retryRecording.bind(null, id)} className={styles.form}>
      <Submit size={size} />
    </form>
  );
}
