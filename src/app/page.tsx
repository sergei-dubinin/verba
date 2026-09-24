import type { Metadata } from "next";
import Link from "next/link";
import { listRecordings, type RecordingListItem } from "@/server/recordings/list";
import { AutoRefresh } from "./_components/auto-refresh";
import { RetryButton } from "./_components/retry-button";
import { Spinner } from "./_components/spinner";
import { Upload } from "./_components/upload";
import { requireUser } from "./_lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Записи — verba" };

// Список записей (BR-13, BR-07): docs/design/screens/list.html, на десктопе —
// основная колонка list-desktop.html. Без записей — list-empty.html.
// Чипы и сайдбар папок — в вертикальном срезе 5 (план среза 2, решение 11).
export default async function RecordingsPage() {
  const user = await requireUser();
  const groups = await listRecordings(user, new Date());
  const processing = groups.some((g) => g.recordings.some((r) => r.state === "processing"));

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
                  <li key={recording.id} className={styles.item} data-recording={recording.id}>
                    <Row recording={recording} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      )}
      <Upload />
      <AutoRefresh active={processing} />
    </div>
  );
}

// Готовая запись — ссылка на транскрипт; в обработке и с ошибкой, как в
// макете, — нет: у первой спиннер, у второй «Повторить» (BR-07, BR-08).
function Row({ recording }: { recording: RecordingListItem }) {
  const text = (
    <span className={styles.rowText}>
      <span className={`t-body-strong ${styles.rowTitle}`}>{recording.title}</span>{" "}
      <span className={styles.rowDetails} data-state={recording.state}>
        <span className={`t-caption tabular ${styles.rowMeta}`}>{recording.meta}</span>
        {recording.statusText && (
          <span className={`t-caption ${styles.rowStatus}`}>{recording.statusText}</span>
        )}
      </span>
    </span>
  );
  if (recording.state === "processing") {
    return (
      <div className={styles.row}>
        {text}
        <Spinner />
      </div>
    );
  }
  if (recording.state === "failed") {
    return (
      <div className={styles.row}>
        {text}
        <RetryButton id={recording.id} size="row" />
      </div>
    );
  }
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
