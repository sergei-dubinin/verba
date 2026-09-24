import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../_lib/session";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Вход — verba" };

export default async function LoginPage() {
  // «Уже вошёл?» — по сессии в базе, а не по наличию cookie: устаревшая
  // cookie иначе зациклила бы переадресацию / → /login → /.
  if (await getCurrentUser()) redirect("/");

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1 className={`t-display-lg ${styles.title}`}>verba</h1>
        <LoginForm />
      </div>
    </main>
  );
}
