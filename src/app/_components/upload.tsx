"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/server/recordings/format";
import styles from "./upload.module.css";

// Загрузка записи (BR-01, BR-03, BR-20, BR-21): кнопка «Загрузить», системный
// выбор файла, шторка на телефоне (upload-sheet.html, upload-progress.html,
// upload-format-error.html) и диалог на десктопе (list-desktop-upload.html).
// Никаких параметров: ни языка, ни числа спикеров. Раздел «Папка» — в
// вертикальном срезе 5 (план среза 3, решения 2 и 14).
//
// Тексты ошибок формата и длительности — те же, что у сервера
// (src/server/uploads/errors.ts); решает сервер, шторка только
// предупреждает раньше.

const FORMAT_MESSAGE = "Поддерживаются только записи Диктофона iPhone (.m4a)";
const TOO_LONG_MESSAGE = "Записи длиннее 3 часов не принимаются";
const NETWORK_MESSAGE = "Не удалось загрузить файл. Проверьте соединение";
const MAX_DURATION_MS = 3 * 60 * 60 * 1000;

type Picked = { file: File; durationMs: number | null };

type State =
  | { kind: "closed" }
  | ({ kind: "ready" } & Picked)
  | ({ kind: "rejected"; message: string } & Picked)
  | ({ kind: "uploading"; progress: number } & Picked)
  | ({ kind: "failed"; message: string } & Picked);

// «38,4 МБ», «62 КБ».
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

// Длительность из <audio>. Браузер не смог (ALAC в Chrome) — null.
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 3000);
    audio.src = url;
  });
}

export function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<State>({ kind: "closed" });

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (state.kind === "closed" && el.open) el.close();
    if (state.kind !== "closed" && !el.open) el.showModal();
  }, [state.kind]);

  function choose() {
    if (!input.current) return;
    input.current.value = "";
    input.current.click();
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!/\.m4a$/i.test(file.name)) {
      setState({ kind: "rejected", file, durationMs: null, message: FORMAT_MESSAGE });
      return;
    }
    const durationMs = await readDuration(file);
    if (durationMs != null && durationMs > MAX_DURATION_MS) {
      setState({ kind: "rejected", file, durationMs, message: TOO_LONG_MESSAGE });
      return;
    }
    setState({ kind: "ready", file, durationMs });
  }

  function send(picked: Picked) {
    const request = new XMLHttpRequest();
    xhr.current = request;
    setState({ kind: "uploading", ...picked, progress: 0 });
    request.open("POST", `/api/recordings?filename=${encodeURIComponent(picked.file.name)}`);
    request.setRequestHeader("content-type", "application/octet-stream");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) setState({ kind: "uploading", ...picked, progress: e.loaded / e.total });
    };
    request.onload = () => {
      xhr.current = null;
      if (request.status === 201) {
        setState({ kind: "closed" });
        router.refresh();
        return;
      }
      if (request.status === 401) {
        router.push("/login");
        return;
      }
      let message = NETWORK_MESSAGE;
      try {
        message = (JSON.parse(request.responseText) as { message?: string }).message ?? message;
      } catch {}
      const kind = request.status === 415 || request.status === 422 ? "rejected" : "failed";
      setState({ kind, ...picked, message });
    };
    request.onerror = () => {
      xhr.current = null;
      setState({ kind: "failed", ...picked, message: NETWORK_MESSAGE });
    };
    request.send(picked.file);
  }

  function cancel() {
    xhr.current?.abort();
    xhr.current = null;
    setState({ kind: "closed" });
  }

  const open = state.kind !== "closed";
  const busy = state.kind === "uploading";
  const error = state.kind === "rejected" || state.kind === "failed" ? state.message : null;

  return (
    <>
      <div className={styles.bar}>
        <button type="button" className={`t-button-large ${styles.primary}`} onClick={choose}>
          Загрузить
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".m4a,audio/mp4,audio/x-m4a"
        hidden
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <dialog
        ref={dialog}
        className={styles.sheet}
        aria-labelledby="upload-title"
        onCancel={(e) => {
          e.preventDefault();
          cancel();
        }}
      >
        {open && (
          <>
            <div className={styles.grabber} aria-hidden="true" />
            <div className={styles.head}>
              <button type="button" className={`t-body ${styles.link}`} onClick={cancel}>
                Отмена
              </button>
              <h2 id="upload-title" className={`t-body-strong ${styles.title}`}>
                Загрузка
              </h2>
            </div>
            <div className={styles.body}>
              <div className={`${styles.file} ${error ? styles.fileError : ""}`}>
                <span className={`t-body-strong ${styles.fileName}`}>{state.file.name}</span>
                <span className={`t-caption tabular ${styles.muted}`}>
                  {[formatSize(state.file.size), state.durationMs != null ? formatDuration(state.durationMs) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {error && (
                  <span role="alert" className={`t-caption ${styles.error}`}>
                    {error}
                  </span>
                )}
              </div>
              {state.kind === "uploading" && (
                <div className={styles.progress}>
                  <div
                    className={styles.track}
                    role="progressbar"
                    aria-label="Загрузка"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(state.progress * 100)}
                  >
                    <div className={styles.fill} style={{ width: `${state.progress * 100}%` }} />
                  </div>
                  <span className={`t-caption tabular ${styles.muted}`}>
                    Загрузка… {Math.round(state.progress * 100)} %
                  </span>
                </div>
              )}
              {error && (
                <button type="button" className={`t-body ${styles.secondary}`} onClick={choose}>
                  Выбрать другой файл
                </button>
              )}
            </div>
            <div className={styles.foot}>
              {state.kind === "ready" && (
                <p className={`t-fine-print ${styles.hint}`}>Поддерживаются записи Диктофона iPhone (.m4a)</p>
              )}
              <div className={styles.actions}>
                <button type="button" className={`t-button-utility ${styles.cancelBottom}`} onClick={cancel}>
                  Отмена
                </button>
                <button
                  type="button"
                  className={`t-button-large ${styles.primary} ${styles.submit}`}
                  disabled={busy || state.kind === "rejected"}
                  onClick={() => send({ file: state.file, durationMs: state.durationMs })}
                >
                  {state.kind === "failed" ? "Загрузить ещё раз" : "Загрузить"}
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
