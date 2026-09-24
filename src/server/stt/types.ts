// Ответ провайдера STT, приведённый адаптером к нашему формату. Кроме
// адаптера, ничто не знает, какой провайдер его дал (NFR-02).

export type SttUtterance = {
  // Метка спикера у провайдера: «A», «0», «spk_1»…
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type SttTranscript = {
  durationMs: number;
  utterances: SttUtterance[];
};
