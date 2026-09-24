import Link from "next/link";
import styles from "./back-bar.module.css";

// Панель со ссылкой «назад» к списку: шапка транскрипта и «не найдено»
// (docs/design/screens/transcript.html). «Все записи» из десктопного макета
// появится вместе с папками (план среза 2, решение 11).
export function BackBar() {
  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.back}>
        <svg width="9" height="16" viewBox="0 0 9 16" fill="none" aria-hidden="true">
          <path
            d="M8 1L1 8L8 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Записи</span>
      </Link>
    </header>
  );
}
