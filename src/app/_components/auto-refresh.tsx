"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Пока запись обрабатывается, экран перечитывается раз в 10 с: уведомлений
// нет, а без этого «готово» видно только после перезагрузки (план среза 3,
// решение 13).
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
