"use client";

import { useState } from "react";
import { EXTRA_PRESETS, type Extra } from "@/lib/extras";
import { CURRENCY_SIGN, currencyOptions } from "@/lib/rates";
import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function amountLabel(e: Extra) {
  const sign = CURRENCY_SIGN[e.currency];
  const n = e.amount.toLocaleString("ru-RU");
  return sign ? `${n} ${sign}` : `${n} ${e.currency}`;
}

/**
 * Промежуток между карточками плана: свои траты и кнопка добавить.
 * Туту продаёт билеты и отели, но поездка состоит не только из них —
 * такси до вокзала и виза тоже деньги, и в бюджете им место.
 */
export function ExtraRow({ afterId, readOnly }: { afterId: string; readOnly?: boolean }) {
  const extras = useTrip((s) => s.extras);
  const rates = useTrip((s) => s.rates);
  const ratesError = useTrip((s) => s.ratesError);
  const addExtra = useTrip((s) => s.addExtra);
  const updateExtra = useTrip((s) => s.updateExtra);
  const removeExtra = useTrip((s) => s.removeExtra);
  const loadRates = useTrip((s) => s.loadRates);

  const [open, setOpen] = useState(false);
  /** id правимой траты; null — форма добавляет новую. */
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("Такси");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RUB");

  const mine = extras.filter((e) => e.afterId === afterId);

  const start = () => {
    void loadRates();
    setEditing(null);
    setLabel("Такси");
    setAmount("");
    setCurrency("RUB");
    setOpen(true);
  };

  const startEdit = (e: Extra) => {
    void loadRates();
    setEditing(e.id);
    setLabel(e.label);
    setAmount(String(e.amount));
    setCurrency(e.currency);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const submit = () => {
    const value = Number(amount.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    if (editing) updateExtra(editing, { label, amount: value, currency });
    else addExtra({ label, amount: value, currency, afterId });
    setAmount("");
    close();
  };

  return (
    <div className="wrap">
      {mine.map((e) => (
        <div className={`extra${editing === e.id ? " editing" : ""}`} key={e.id}>
          <span className="ic">₽</span>
          <span className="lbl">{e.label}</span>
          <span className="amt">
            {amountLabel(e)}
            {e.currency !== "RUB" && e.rub !== undefined && (
              <span
                className="rub"
                title={`курс ЦБ ${e.rate?.toFixed(4)} ₽ за 1 ${e.currency} на ${e.rateDate}`}
              >
                {" "}
                = {fmt(e.rub)}
              </span>
            )}
            {e.rub === undefined && <span className="norate"> · курса нет</span>}
          </span>
          <button
            className="rm"
            aria-label={`Изменить ${e.label}`}
            title="Изменить"
            onClick={() => startEdit(e)}
          >
            ✎
          </button>
          <button className="rm" aria-label={`Убрать ${e.label}`} title="Убрать" onClick={() => removeExtra(e.id)}>
            ✕
          </button>
        </div>
      ))}

      {readOnly ? null : open ? (
        <div className="form">
          <input
            className="type"
            list="extra-presets"
            value={label}
            placeholder="Тип"
            onChange={(e) => setLabel(e.target.value)}
          />
          <datalist id="extra-presets">
            {EXTRA_PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            className="sum"
            value={amount}
            inputMode="decimal"
            placeholder="Сумма"
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close();
            }}
          />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencyOptions(rates).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn primary sm" onClick={submit}>
            {editing ? "Сохранить" : "Добавить"}
          </button>
          <button className="btn sm" onClick={close} aria-label="Отмена">✕</button>
          {ratesError && (
            <div className="warn">Курсы ЦБ недоступны — запишем сумму в валюте, без рублей.</div>
          )}
        </div>
      ) : (
        <button className="add" onClick={start} title="Добавить свой расход">
          + расход
        </button>
      )}

      <style jsx>{`
        .wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 2px 0;
        }
        .extra {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          background: var(--panel-2);
          border: 1px dashed var(--line-strong);
          border-radius: 9px;
          padding: 6px 10px;
        }
        .ic {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          background: var(--bus-soft);
          color: var(--bus);
          flex: none;
        }
        .lbl { flex: 1; font-weight: 500; }
        .amt { font-variant-numeric: tabular-nums; }
        .rub { color: var(--ink-3); }
        .norate { color: var(--warn); }
        .rm {
          color: var(--ink-3);
          font-size: 12px;
          line-height: 1;
          padding: 2px 3px;
          border-radius: 5px;
        }
        .rm:hover { color: var(--accent); background: var(--accent-soft); }
        .extra .rm:last-of-type:hover { color: var(--danger); background: var(--danger-bg); }
        .extra.editing { border-color: var(--accent); }
        .add {
          align-self: center;
          font-size: 11.5px;
          color: var(--ink-3);
          padding: 2px 10px;
          border-radius: 999px;
          border: 1px dashed transparent;
        }
        .add:hover {
          color: var(--accent);
          border-color: var(--line-strong);
        }
        .form {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          background: var(--panel-2);
          border-radius: 10px;
          padding: 8px;
        }
        .form input,
        .form select { font-size: 12.5px; padding: 5px 8px; }
        /* «Достопримечательности» должно читаться целиком, а не обрезком */
        .form .type { flex: 1; min-width: 132px; }
        .form .sum { width: 78px; }
        .form :global(.btn.sm) { padding: 5px 11px; font-size: 12px; }
        .warn { flex-basis: 100%; font-size: 11.5px; color: var(--warn); }
      `}</style>
    </div>
  );
}
