import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RecordingNotFoundError } from "@/server/recordings/errors";
import { isoOffset } from "@/server/recordings/format";
import { getTranscript } from "@/server/transcript/get";
import { AutoRefresh } from "../../_components/auto-refresh";
import { BackBar } from "../../_components/back-bar";
import { RetryButton } from "../../_components/retry-button";
import { Spinner } from "../../_components/spinner";
import { requireUser } from "../../_lib/session";
import styles from "./page.module.css";

// Транскрипт (BR-09–12, BR-18): docs/design/screens/transcript.html,
// transcript-desktop.html; в обработке — transcript-processing.html, после
// сбоя — transcript-error.html (BR-07, BR-08). Меню «…» — вертикальные
// срезы 4 и 5 (план среза 2, решение 11).

type Props = { params: Promise<{ id: string }> };

// Один запрос на страницу и её metadata. Чужая или несуществующая запись —
// «не найдено» (BR-22).
const load = cache(async (id: string) => {
  const user = await requireUser();
  try {
    return await getTranscript(user, id);
  } catch (e) {
    if (e instanceof RecordingNotFoundError) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { title } = await load((await params).id);
  return { title: `${title} — verba` };
}

// Палитра на шесть спикеров, дальше по кругу.
const speakerColor = (ord: number) => ((ord - 1) % 6) + 1;

export default async function TranscriptPage({ params }: Props) {
  const transcript = await load((await params).id);

  return (
    <div className={styles.page}>
      <BackBar />
      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={`t-display-md ${styles.title}`}>{transcript.title}</h1>
          <p className={`t-caption tabular ${styles.meta}`}>{transcript.meta}</p>
        </div>
        {transcript.state === "processing" && (
          <div className={styles.state}>
            <Spinner />
            <p className={`t-body ${styles.stateText}`}>{transcript.statusText}</p>
          </div>
        )}
        {transcript.state === "failed" && (
          <div className={`${styles.state} ${styles.stateFailed}`}>
            <p className={`t-body ${styles.stateText}`}>{transcript.statusText}</p>
            <RetryButton id={transcript.id} size="large" />
          </div>
        )}
        <div className={styles.body}>
          {transcript.groups.map((group, i) => (
            <section key={i} className={styles.group} aria-label={group.speaker.name}>
              {group.utterances.map((utterance, j) => (
                <div key={j} className={styles.utterance} data-utterance>
                  <div className={styles.aside}>
                    {j === 0 && (
                      <span
                        className={`t-body-strong ${styles.speaker}`}
                        data-color={speakerColor(group.speaker.ord)}
                      >
                        {group.speaker.name}
                      </span>
                    )}
                    <time className={`t-fine-print tabular ${styles.time}`} dateTime={isoOffset(utterance.startMs)}>
                      {utterance.start}
                    </time>
                  </div>
                  <p className={`t-body ${styles.text}`}>{utterance.text}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
      <AutoRefresh active={transcript.state === "processing"} />
    </div>
  );
}
