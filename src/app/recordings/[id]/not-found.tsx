import type { Metadata } from "next";
import { NotFoundScreen } from "../../_components/not-found-screen";

export const metadata: Metadata = { title: "Запись не найдена — verba" };

// Чужая и несуществующая запись выглядят одинаково (BR-22).
export default function RecordingNotFound() {
  return <NotFoundScreen message="Запись не найдена." />;
}
