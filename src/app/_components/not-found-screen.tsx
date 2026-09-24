import { BackBar } from "./back-bar";
import styles from "./not-found-screen.module.css";

// «Не найдено» — макета нет: как пустой список (list-empty.html), строка
// текста по центру, и ссылка «Записи» в панели (план среза 2, решение 10).
// Своя страница, а не стандартная: та следует системной тёмной теме.
export function NotFoundScreen({ message }: { message: string }) {
  return (
    <div className={styles.page}>
      <BackBar />
      <main className={styles.main}>
        <p className={`t-body ${styles.text}`}>{message}</p>
      </main>
    </div>
  );
}
