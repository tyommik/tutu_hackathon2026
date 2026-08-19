"use client";

import { useState } from "react";
import { partyLabel } from "@/lib/trip";
import { useTrip } from "@/store/useTrip";

export function PartyPicker() {
  const party = useTrip((s) => s.party);
  const setParty = useTrip((s) => s.setParty);
  const legsCount = useTrip((s) => s.legs.length);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(party);

  const apply = () => {
    setOpen(false);
    if (JSON.stringify(draft) !== JSON.stringify(party)) setParty(draft);
  };

  return (
    <div className="wrap">
      <button
        className="btn who"
        onClick={() => {
          setDraft(party);
          setOpen((v) => !v);
        }}
      >
        👤 {partyLabel(party)}
      </button>

      {open && (
        <div className="pop">
          <div className="row">
            <span>Взрослые</span>
            <div className="step">
              <button
                className="btn s"
                aria-label="Меньше взрослых"
                disabled={draft.adults <= 1}
                onClick={() => setDraft((d) => ({ ...d, adults: d.adults - 1 }))}
              >
                −
              </button>
              <b>{draft.adults}</b>
              <button
                className="btn s"
                aria-label="Больше взрослых"
                disabled={draft.adults >= 9}
                onClick={() => setDraft((d) => ({ ...d, adults: d.adults + 1 }))}
              >
                +
              </button>
            </div>
          </div>

          {draft.childrenAges.map((age, i) => (
            <div className="row" key={i}>
              <span>Ребёнок {i + 1}</span>
              <div className="step">
                <select
                  value={age}
                  aria-label={`Возраст ребёнка ${i + 1}`}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDraft((d) => {
                      const ages = [...d.childrenAges];
                      ages[i] = v;
                      return { ...d, childrenAges: ages };
                    });
                  }}
                >
                  {Array.from({ length: 18 }, (_, a) => (
                    <option key={a} value={a}>
                      {a} лет
                    </option>
                  ))}
                </select>
                <button
                  className="btn s"
                  aria-label={`Убрать ребёнка ${i + 1}`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, childrenAges: d.childrenAges.filter((_, j) => j !== i) }))
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {draft.childrenAges.length < 6 && (
            <button
              className="addkid"
              onClick={() => setDraft((d) => ({ ...d, childrenAges: [...d.childrenAges, 7] }))}
            >
              + добавить ребёнка
            </button>
          )}

          <p className="hint">
            Детские тарифы учитываются в авиа, автобусах и отелях; подростки 12+ считаются
            взрослыми. Мультипоиск считает по взрослым. Цена ж/д — за одно место
            (итог за всех посчитает корзина Туту).
          </p>

          <div className="foot">
            <button className="btn" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn primary" onClick={apply}>
              {legsCount > 0 ? "Применить и пересчитать" : "Применить"}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .wrap { position: relative; }
        .who { font-size: 13px; }
        .pop {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 290px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: var(--shadow);
          padding: 14px;
          z-index: 70;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13.5px;
        }
        .step {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .step b {
          min-width: 18px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .step :global(.btn.s) {
          width: 28px;
          height: 28px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .step select { padding: 5px 8px; font-size: 13px; }
        .addkid {
          text-align: left;
          color: var(--accent);
          font-size: 13px;
          font-weight: 500;
        }
        .hint {
          font-size: 11.5px;
          color: var(--ink-3);
          line-height: 1.4;
        }
        .foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}
