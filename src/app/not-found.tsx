import type { Metadata } from "next";
import { NotFoundScreen } from "./_components/not-found-screen";

export const metadata: Metadata = { title: "Страница не найдена — verba" };

export default function NotFound() {
  return <NotFoundScreen message="Страница не найдена." />;
}
