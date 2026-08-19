import { NextResponse } from "next/server";
import { assist, AssistUnavailable } from "@/lib/assist";
import type { Party, Trip } from "@/lib/trip";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: {
    message?: string;
    trip?: Trip;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    party?: Party;
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
    const result = await assist(message, trip, body.history ?? [], body.party);
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
