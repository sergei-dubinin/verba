import type { Metadata } from "next";
import { requireUser } from "./_lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Записи — verba" };

// Список записей. Пока записей нет — только пустое состояние
// (docs/design/screens/list-empty.html); «Загрузить» — в срезе 2,
// сайдбар папок на десктопе — в срезе 5.
export default async function RecordingsPage() {
  await requireUser();

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={`t-body-strong ${styles.title}`}>Записи</h1>
      </header>
      <main className={styles.empty}>
        <p className={`t-body ${styles.emptyText}`}>Здесь появятся ваши записи.</p>
      </main>
    </div>
  );
}
