"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Голосовой ввод: микрофон → MediaRecorder → /api/transcribe → текст.
 *
 * Вынесен из копилота, когда микрофон понадобился и стартовому экрану:
 * запись, волна уровня сигнала и обращение к распознаванию везде одинаковы,
 * различается только поле, куда падает текст, — его отдаёт onText.
 *
 * Волна рисуется в canvas по ref из хука: каждый кадр берём RMS-уровень
 * сигнала и ведём ленту столбиков справа налево. Уровни живут в замыкании —
 * ре-рендеры реакта им не нужны.
 */
export function useVoiceInput(onText: (text: string) => void) {
  // idle → rec (идёт запись) → busy (ждём распознавание) → idle
  const [voice, setVoice] = useState<"idle" | "rec" | "busy">("idle");
  const [error, setError] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  // ✕ во время записи: остановить и выбросить звук, не ходя в распознавание
  const cancelRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveCtxRef = useRef<AudioContext | null>(null);
  const waveRafRef = useRef(0);
  // свежий обработчик без пересоздания start/finish между рендерами
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const startWave = (stream: MediaStream) => {
    const ctx = new AudioContext();
    waveCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const levels: number[] = [];
    const draw = () => {
      waveRafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) canvas.width = w * dpr;
      if (canvas.height !== h * dpr) canvas.height = h * dpr;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const bar = 3 * dpr;
      const gap = 2 * dpr;
      const max = Math.floor((w * dpr) / (bar + gap));
      levels.push(rms);
      if (levels.length > max) levels.shift();
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, canvas.width, canvas.height);
      // цвет задан на canvas через CSS (var(--accent)) — берём вычисленный
      g.fillStyle = getComputedStyle(canvas).color;
      const mid = canvas.height / 2;
      for (let i = 0; i < levels.length; i++) {
        // тихий сигнал тоже виден: минимум 2px, дальше рост от уровня
        const bh = Math.max(2 * dpr, Math.min(levels[i] * 3, 1) * (canvas.height - 4 * dpr));
        const x = canvas.width - (levels.length - i) * (bar + gap);
        g.fillRect(x, mid - bh / 2, bar, bh);
      }
    };
    waveRafRef.current = requestAnimationFrame(draw);
  };

  const stopWave = () => {
    cancelAnimationFrame(waveRafRef.current);
    void waveCtxRef.current?.close().catch(() => {});
    waveCtxRef.current = null;
  };

  const finish = () => recRef.current?.stop();

  const cancel = () => {
    cancelRef.current = true;
    recRef.current?.stop();
  };

  const start = async () => {
    if (recRef.current || waveCtxRef.current) return;
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Нет доступа к микрофону — разрешите его в браузере или введите текст руками.");
      return;
    }
    const rec = new MediaRecorder(
      stream,
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : undefined,
    );
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stopWave();
      stream.getTracks().forEach((t) => t.stop());
      if (cancelRef.current) {
        cancelRef.current = false;
        setVoice("idle");
        recRef.current = null;
        return;
      }
      setVoice("busy");
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.text) {
          onTextRef.current(data.text);
        } else {
          setError("Речь не распозналась — попробуйте ещё раз.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setVoice("idle");
        recRef.current = null;
      }
    };
    recRef.current = rec;
    rec.start();
    startWave(stream);
    setVoice("rec");
  };

  // уход со страницы не должен оставить микрофон включённым
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
      stopWave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { voice, error, canvasRef, start, finish, cancel };
}
