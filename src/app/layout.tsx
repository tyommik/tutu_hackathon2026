import type { Metadata } from "next";
import { StateSync } from "@/components/StateSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Тропа",
  description: "Конструктор планирования путешествий на основе Tutu MCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {/* один монтаж на всё приложение: смена экрана не должна перечитывать ссылку */}
        <StateSync />
        {children}
      </body>
    </html>
  );
}
