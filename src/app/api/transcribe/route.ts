import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
/**
 * НЕ OPENROUTER_MODEL: это чат-модель копилота. Для распознавания речи
 * нужна ASR-модель, язык Whisper определяет сам.
 */
const MODEL = "openai/whisper-large-v3";

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Премиса 4: падение ИИ — не ошибка приложения, ручной режим не затронут
    return NextResponse.json(
      { error: "Голосовой ввод отключён: не задан OPENROUTER_API_KEY.", unavailable: true },
      { status: 503 },
    );
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) audio = f;
  } catch {
    // не multipart — ответим ниже общей ошибкой
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "Ожидается аудиофайл в поле audio" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "voice.webm");
  upstream.append("model", MODEL);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://tropa.example",
        "X-Title": "Tropa trip planner",
      },
      body: upstream,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        { error: `Не удалось распознать речь (${res.status}): ${detail}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Не удалось распознать речь: ${msg}` }, { status: 502 });
  }
}
