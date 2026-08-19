import { NextResponse } from "next/server";
import { assist, AssistUnavailable } from "@/lib/assist";
import type { Party, Trip } from "@/lib/trip";

export const dynamic = "force-dynamic";
// Запас над таймаутом запроса к модели (180 с в assist.ts): маршрут не должен
// обрываться раньше него, иначе вместо ответа модели придёт обрыв маршрута.
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: {
    message?: string;
    trip?: Trip;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    party?: Party;
    /** review — автоотчёт системы поиска, а не сообщение пользователя. */
    kind?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Нужно message" }, { status: 400 });
  }
  const trip: Trip = body.trip ?? { legs: [], stays: [] };

  try {
    const result = await assist(
      message,
      trip,
      body.history ?? [],
      body.party,
      body.kind === "review" ? "review" : undefined,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AssistUnavailable) {
      // Премиса 4: падение ИИ — не ошибка приложения, ручной режим не затронут
      return NextResponse.json({ error: e.message, unavailable: true }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
