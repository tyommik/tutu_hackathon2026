"use client";

import { useState } from "react";
import { MapCanvas } from "@/components/MapCanvas";
import { Timeline } from "@/components/Timeline";
import { VariantsDrawer, type VariantsTarget } from "@/components/VariantsDrawer";
import { CheckoutModal } from "@/components/CheckoutModal";
import { OptimizerModal } from "@/components/OptimizerModal";
import { CopilotCard } from "@/components/CopilotCard";
import { SeatmapModal } from "@/components/SeatmapModal";
import { PartyPicker } from "@/components/PartyPicker";
import { HotelModal } from "@/components/HotelModal";
import { TransferModal } from "@/components/TransferModal";
import { StartScreen } from "@/components/StartScreen";
import type { HotelSnapshot, Stay } from "@/lib/trip";
import type { Leg } from "@/lib/trip";
import { pluralRu, searchProgress } from "@/lib/progress";
import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

export default function Home() {
  const {
    legs,
    stays,
    origin,
    started,
    planOpen,
    legStatus,
    legTransfers,
    copilot,
    stayStatus,
    runCheckout,
    runOptimizer,
    goHome,
  } = useTrip();
  const [hoveredLeg, setHoveredLeg] = useState<string | null>(null);
  const [hoveredStay, setHoveredStay] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantsTarget | null>(null);
  const [seatmapLeg, setSeatmapLeg] = useState<Leg | null>(null);
  const [roomsFor, setRoomsFor] = useState<{ hotel: HotelSnapshot; stay: Stay } | null>(null);
  const budget = useTrip((s) => s.total());
  const progress = searchProgress(
    legs.map((l) => ({ loading: !l.selectedOffer && legStatus[l.id] === "loading" })),
  );
  const searchingLegs = progress?.searching ?? 0;
  const searchingStays = Object.values(stayStatus).filter((st) => st === "loading").length;
  // поле статуса агента: последний реальный шаг из журнала + счётчик плеч
  const working =
    searchingLegs > 0 ||
    searchingStays > 0 ||
    copilot.loading ||
    Object.values(legTransfers).some((t) => t.loading);
  const lastStatus = [...copilot.messages].reverse().find((m) => m.role === "status")?.content;
  const incomplete =
    searchingLegs > 0 ||
    searchingStays > 0 ||
    legs.some((l) => !l.selectedOffer) ||
    stays.some((s) => !s.selectedHotel);

  if (!started) return <StartScreen />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="home" onClick={goHome} title="На главную" aria-label="На главную">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand" src="/tutu-ai-wordmark.webp" alt="tutu AI" width={440} height={163} />
        </button>
        {legs.length > 0 ? (
          <div className="meta">
            {legs[0].from.name} → {legs[legs.length - 1].to.name} · плеч: {legs.length}
          </div>
        ) : origin ? (
          <div className="meta">старт: {origin.city.name}</div>
        ) : null}
        {working && (
          <div className="agent-status" role="status">
            <span className="dot" aria-hidden />
            <span className="txt">{lastStatus ?? "Агент работает…"}</span>
            {progress && (
              <span className="cnt">
                ещё {progress.searching} {pluralRu(progress.searching, ["плечо", "плеча", "плеч"])}
              </span>
            )}
          </div>
        )}
        <div className="budget">
          <div className="lbl">Бюджет поездки</div>
          <div className="val">
            {incomplete && legs.length > 0 ? "~" : ""}
            {fmt(budget)}
          </div>
        </div>
        <PartyPicker />
        <button className="btn" onClick={runOptimizer} disabled={legs.length < 2}>
          ✦ Оптимизируй
        </button>
        <button className="btn primary" onClick={runCheckout} disabled={legs.length === 0}>
          Checkout маршрута
        </button>
      </header>

      <main className={`stage${planOpen ? "" : " wide"}`}>
        <MapCanvas
          hoveredLeg={hoveredLeg}
          onHover={setHoveredLeg}
          hoveredStay={hoveredStay}
          onHoverStay={setHoveredStay}
          // клик по городу открывает тот же веер, что и карточка отеля в плане
          onOpenStay={(stay) => setVariants({ kind: "stay", stay })}
        />
        <Timeline
          hoveredLeg={hoveredLeg}
          onHover={setHoveredLeg}
          hoveredStay={hoveredStay}
          onHoverStay={setHoveredStay}
          onOpenVariants={setVariants}
          onOpenSeatmap={setSeatmapLeg}
        />
        <CopilotCard />
      </main>

      <VariantsDrawer
        target={variants}
        onClose={() => setVariants(null)}
        onOpenRooms={(hotel, stay) => setRoomsFor({ hotel, stay })}
      />
      {roomsFor && (
        <HotelModal
          hotel={roomsFor.hotel}
          stay={roomsFor.stay}
          onClose={() => setRoomsFor(null)}
          onPicked={() => setVariants(null)}
        />
      )}
      <TransferModal />
      <CheckoutModal />
      <OptimizerModal />
      {seatmapLeg && <SeatmapModal leg={seatmapLeg} onClose={() => setSeatmapLeg(null)} />}

      <style jsx>{`
        .app {
          height: 100dvh;
          display: flex;
          flex-direction: column;
        }
        .topbar {
          height: 58px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 18px;
          background: var(--panel);
          border-bottom: 1px solid var(--line);
          z-index: 40;
          /* якорь для абсолютно центрированного поля статуса агента */
          position: relative;
        }
        .home {
          display: block;
          padding: 0;
          /*
           * Ни фона, ни прозрачности, ни трансформаций: любое из них создало
           * бы у кнопки свой контекст наложения, и mix-blend-mode логотипа
           * перестал бы убирать его белую подложку.
           */
          border-radius: 8px;
        }
        .home:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 3px;
        }
        .brand {
          display: block;
          /* 36 px при шапке 58: логотип читается, но не давит на остальное */
          height: 36px;
          width: auto;
          /* у логотипа белый фон без альфы: multiply убирает его на светлой теме */
          mix-blend-mode: multiply;
        }
        @media (prefers-color-scheme: dark) {
          .brand {
            /* на тёмной шапке multiply дал бы чёрный прямоугольник */
            mix-blend-mode: normal;
            background: #fff;
            border-radius: 7px;
            padding: 3px 7px;
          }
        }
        .meta {
          color: var(--ink-2);
          font-size: 13px;
          border-left: 1px solid var(--line);
          padding-left: 14px;
          /*
           * В узкой шапке подпись складывалась в столбик по слову — особенно
           * когда справа появляется строка прогресса. Лучше одна строка с
           * многоточием: min-width: 0 разрешает флексу ужимать её ниже
           * ширины содержимого.
           */
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        /*
         * Поле статуса агента: последний реальный шаг из журнала (см.
         * lib/activityLog) в явной рамке. Центр шапки, абсолютно: позиция не
         * зависит от ширины соседей, а min-width не даёт полю прыгать при
         * смене коротких и длинных статусов. Когда агент простаивает, поля
         * нет — шапка живёт обычной жизнью.
         */
        .agent-status {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 300px;
          max-width: min(40vw, 560px);
          padding: 6px 12px;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: var(--panel-2);
          font-size: 17px;
          color: var(--ink-2);
        }
        .agent-status .dot {
          flex: none;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: statuspulse 1.1s ease-in-out infinite;
        }
        .agent-status .txt {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .agent-status .cnt {
          flex: none;
          padding-left: 8px;
          border-left: 1px solid var(--line);
          color: var(--ink-3);
          white-space: nowrap;
        }
        @keyframes statuspulse {
          50% { opacity: 0.35; }
        }
        .budget {
          margin-left: auto;
          text-align: right;
        }
        .lbl {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-3);
        }
        .val {
          font-size: 20px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .stage {
          position: relative;
          flex: 1;
        }
        /* план свёрнут — карта забирает место колонки, оставляя корешок */
        .stage.wide {
          --panel-gap: calc(var(--strip-w) + 28px);
        }
      `}</style>
    </div>
  );
}
