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
import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

export default function Home() {
  const { legs, stays, origin, started, planOpen, legStatus, stayStatus, runCheckout, runOptimizer, goHome } =
    useTrip();
  const [hoveredLeg, setHoveredLeg] = useState<string | null>(null);
  const [hoveredStay, setHoveredStay] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantsTarget | null>(null);
  const [seatmapLeg, setSeatmapLeg] = useState<Leg | null>(null);
  const [roomsFor, setRoomsFor] = useState<{ hotel: HotelSnapshot; stay: Stay } | null>(null);
  const budget = useTrip((s) => s.total());
  const searchingLegs = legs.filter((l) => !l.selectedOffer && legStatus[l.id] === "loading").length;
  const searchingStays = Object.values(stayStatus).filter((st) => st === "loading").length;
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
        <div className="budget">
          <div className="lbl">
            {searchingLegs > 0 ? (
              <span className="searching-lbl">
                ищем {searchingLegs} из {legs.length} плеч
              </span>
            ) : (
              "Бюджет поездки"
            )}
          </div>
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
        .searching-lbl {
          color: var(--accent);
          animation: lblpulse 1.1s ease-in-out infinite;
        }
        @keyframes lblpulse {
          50% { opacity: 0.45; }
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
