import type { Metadata } from "next";
import Link from "next/link";
import { listRecordings, type RecordingListItem } from "@/server/recordings/list";
import { requireUser } from "./_lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Записи — verba" };

// Список записей (BR-13): docs/design/screens/list.html, на десктопе —
// основная колонка list-desktop.html. Без записей — list-empty.html.
// Чипы и сайдбар папок — в вертикальном срезе 5, «Загрузить» и статусы
// обработки — в вертикальном срезе 3 (план среза 2, решение 11).
export default async function RecordingsPage() {
  const user = await requireUser();
  const groups = await listRecordings(user, new Date());

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={`t-body-strong ${styles.title}`}>Записи</h1>
      </header>
      {groups.length === 0 ? (
        <main className={styles.empty}>
          <p className={`t-body ${styles.emptyText}`}>Здесь появятся ваши записи.</p>
        </main>
      ) : (
        <main className={styles.list}>
          {groups.map((group) => (
            <section key={group.label} className={styles.group}>
              <h2 className={`t-caption-strong ${styles.groupTitle}`}>{group.label}</h2>
              <ul className={styles.card}>
                {group.recordings.map((recording) => (
                  <li key={recording.id} className={styles.item}>
                    <Row recording={recording} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      )}
    </div>
  );
}

// Готовая запись — ссылка на транскрипт; остальные, как в макете, — нет.
function Row({ recording }: { recording: RecordingListItem }) {
  const text = (
    <span className={styles.rowText}>
      <span className={`t-body-strong ${styles.rowTitle}`}>{recording.title}</span>{" "}
      <span className={`t-caption tabular ${styles.rowMeta}`}>{recording.meta}</span>
    </span>
  );
  if (recording.status !== "done") return <div className={styles.row}>{text}</div>;
  return (
    <Link href={`/recordings/${recording.id}`} className={styles.row}>
      {text}
      <svg className={styles.chevron} width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
        <path
          d="M1 1L7 7L1 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
