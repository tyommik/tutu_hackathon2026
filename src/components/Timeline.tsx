"use client";

import { useState } from "react";
import { layoverSummary } from "@/lib/aviaFilters";
import { CITIES, type City } from "@/lib/cities";
import { explainEmptyLeg } from "@/lib/emptyReasons";
import { ExtraRow } from "./ExtraRow";
import { resolvedLabel, suggestDestination, type ResolvedGeo } from "@/lib/geoAliases";
import { renderLightMarkdown } from "@/lib/lightMarkdown";
import { accusative, inCity } from "@/lib/morph";
import { formatMinutes, stayKey, type Leg, type Note, type Stay } from "@/lib/trip";
import { timeWindows, type TimeWindowNote } from "@/lib/windows";
import { ORIGIN_NOTE, useTrip, type LegTransferState } from "@/store/useTrip";

const MODE_ICON: Record<string, string> = {
  avia: "✈",
  rail: "🚆",
  bus: "🚌",
  etrain: "🚊",
  any: "·",
};

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" });

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function dayLabel(date: string) {
  const s = DAY_FMT.format(new Date(`${date}T12:00:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeOf(iso?: string) {
  return iso ? iso.slice(11, 16) : "—";
}

/**
 * Вопросы копилоту от карточек плана. Формулировка сразу задаёт формат
 * ответа: он ложится в заметку, поэтому нужен короткий список, а не эссе.
 */
function transferPrompt(w: TimeWindowNote, date: string): string {
  const gap = w.minutes ? formatMinutes(w.minutes) : "несколько часов";
  return (
    `Что посмотреть ${inCity(w.city ?? "")}? ${date}, пересадка, свободно ${gap}. ` +
    `Дай 3-5 вариантов недалеко от вокзала или аэропорта, у каждого — ` +
    `сколько занимает дорога и осмотр. Без цен.`
  );
}

function stayPrompt(stay: Stay): string {
  return (
    `Что посмотреть ${inCity(stay.city.name)}? Мы там ${stay.nights} ноч., ` +
    `с ${stay.checkin} по ${stay.checkout}. Дай 5 идей списком: главное, ` +
    `что-то нетуристическое и где поесть. Коротко, без цен.`
  );
}

export function Timeline({
  hoveredLeg,
  onHover,
  hoveredStay,
  onHoverStay,
  onOpenVariants,
  onOpenSeatmap,
}: {
  hoveredLeg: string | null;
  onHover: (id: string | null) => void;
  hoveredStay: string | null;
  onHoverStay: (key: string | null) => void;
  onOpenVariants: (t: { kind: "leg"; leg: Leg } | { kind: "stay"; stay: Stay }) => void;
  onOpenSeatmap: (leg: Leg) => void;
}) {
  const {
    legs, stays, origin, legStatus, legUnavailable, legResolved, legTransfers, stayStatus,
    warnings, copilot, addCity, removeCityAt, removeOrigin, seedLegend, clear, splitViaHub,
    setNote, askCopilot, findTransfer, replaceCity, extras, planOpen, setPlanOpen,
    removeHotel, restoreHotel, removeTicket, restoreTicket,
  } = useTrip();
  const busyNote = (key: string) => copilot.loading && copilot.noteFor === key;
  const warns = warnings();
  const windows = timeWindows(legs, stays);
  const [adding, setAdding] = useState(false);
  const [cityKey, setCityKey] = useState("istanbul");
  const [date, setDate] = useState("2026-09-11");

  type Item =
    | { kind: "leg"; date: string; leg: Leg }
    | { kind: "stay"; date: string; stay: Stay };
  const items: Item[] = [
    ...legs.map((leg) => ({ kind: "leg" as const, date: leg.date, leg })),
    ...stays.map((stay) => ({ kind: "stay" as const, date: stay.checkin, stay })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // карточки, к которым привязаны траты, могли исчезнуть при перестройке
  // маршрута: показываем такие траты в хвосте, а не теряем молча
  const anchors = new Set<string>([ORIGIN_NOTE, ...legs.map((l) => l.id), ...stays.map(stayKey)]);
  const orphanExtras = extras.filter((e) => !anchors.has(e.afterId));

  let lastDay = "";

  return (
    <>
      {!planOpen && <PlanStrip onOpen={() => setPlanOpen(true)} />}

      <aside className={`panel${planOpen ? "" : " away"}`} aria-hidden={!planOpen}>
        <div className="head">
          <h2>План поездки</h2>
          <button
            className="fold"
            onClick={() => setPlanOpen(false)}
            aria-expanded
            aria-label="Свернуть план поездки"
            title="Свернуть план поездки"
          >
            ›
          </button>
        </div>
        <div className="scroll">
          {!origin && (
            <div className="empty">
              Добавьте города — транспорт и отели подтянутся сами.
              <button className="btn" style={{ marginTop: 10 }} onClick={seedLegend}>
                Загрузить демо-легенду
              </button>
            </div>
          )}

          {origin && (
            <OriginCard
              city={origin.city.name}
              // с плечами дату несёт заголовок дня ниже — не дублируем
              date={legs.length === 0 ? origin.date : undefined}
              onRemove={removeOrigin}
              note={origin.note}
              onNote={(n) => setNote(ORIGIN_NOTE, n)}
            />
          )}
          {origin && <ExtraRow afterId={ORIGIN_NOTE} />}

          {origin && legs.length === 0 && (
            <div className="empty">Добавьте следующий город — построим плечо от него.</div>
          )}

          {items.map((it) => {
            const day = it.date !== lastDay ? dayLabel(it.date) : null;
            lastDay = it.date;
            return (
              <div key={it.kind === "leg" ? it.leg.id : stayKey(it.stay)}>
                {day && <div className="day">{day}</div>}
                {it.kind === "leg" ? (
                  <LegCard
                    leg={it.leg}
                    status={legStatus[it.leg.id] ?? "idle"}
                    unavailable={legUnavailable[it.leg.id] ?? []}
                    warn={warns.find((w) => w.legId === it.leg.id)}
                    window={windows.find((w) => w.target === it.leg.id)}
                    hovered={hoveredLeg === it.leg.id}
                    onHover={onHover}
                    onClick={() => onOpenVariants({ kind: "leg", leg: it.leg })}
                    onSplit={() => splitViaHub(it.leg.id)}
                    onSeatmap={() => onOpenSeatmap(it.leg)}
                    onRemove={() => removeCityAt(it.leg.id)}
                    onSelfRide={() => removeTicket(it.leg.id)}
                    onRestoreTicket={() => restoreTicket(it.leg.id)}
                    noteBusy={busyNote(it.leg.id)}
                    onNote={(n) => setNote(it.leg.id, n)}
                    onAskSights={(w) =>
                      askCopilot(transferPrompt(w, it.leg.date), { noteFor: it.leg.id })
                    }
                    resolved={legResolved[it.leg.id]}
                    transfer={legTransfers[it.leg.id]}
                    onFindTransfer={() => findTransfer(it.leg.id)}
                    onSuggestCity={(from, to) => replaceCity(from, to)}
                  />
                ) : (
                  <StayCard
                    stay={it.stay}
                    status={stayStatus[stayKey(it.stay)] ?? "idle"}
                    windows={windows.filter((w) => w.target === stayKey(it.stay))}
                    hovered={hoveredStay === stayKey(it.stay)}
                    onHover={onHoverStay}
                    onClick={() => onOpenVariants({ kind: "stay", stay: it.stay })}
                    noteBusy={busyNote(stayKey(it.stay))}
                    onNote={(n) => setNote(stayKey(it.stay), n)}
                    onAskSights={() =>
                      askCopilot(stayPrompt(it.stay), { noteFor: stayKey(it.stay) })
                    }
                    onRemoveHotel={() => removeHotel(stayKey(it.stay))}
                    onRestoreHotel={() => restoreHotel(stayKey(it.stay))}
                  />
                )}
                <ExtraRow afterId={it.kind === "leg" ? it.leg.id : stayKey(it.stay)} />
              </div>
            );
          })}

          {orphanExtras.length > 0 && (
            <div className="orphans">
              траты от прежней версии маршрута
              {[...new Set(orphanExtras.map((e) => e.afterId))].map((id) => (
                <ExtraRow key={id} afterId={id} readOnly />
              ))}
            </div>
          )}

          {adding ? (
            <div className="addform">
              <select value={cityKey} onChange={(e) => setCityKey(e.target.value)}>
                {Object.entries(CITIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.name}</option>
                ))}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <button
                className="btn primary"
                onClick={() => {
                  addCity(CITIES[cityKey] as City, date);
                  setAdding(false);
                }}
              >
                {origin ? "Добавить" : "Начать отсюда"}
              </button>
            </div>
          ) : (
            <button
              className="addrow"
              onClick={() => {
                // отталкиваемся от конца маршрута, а не от даты по умолчанию
                const last = legs.length ? legs[legs.length - 1].date : origin?.date;
                if (last) setDate(last);
                setAdding(true);
              }}
            >
              {origin ? "+ добавить город" : "+ выбрать начальную точку"}
            </button>
          )}

          {legs.length > 0 && (
            <button className="btn" style={{ marginTop: 4 }} onClick={clear}>
              Очистить маршрут
            </button>
          )}
        </div>

        <style jsx>{`
          .panel {
            position: absolute;
            top: 14px;
            right: 14px;
            bottom: 14px;
            width: var(--panel-w);
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: var(--shadow);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: transform 0.22s ease;
          }
          /*
           * Свёрнутая колонка уезжает вправо целиком. Сдвиг заметно больше
           * ширины: у панели тень с размытием 30px и нулевым смещением, при
           * сдвиге ровно на 100% она пятном ложилась бы поверх полоски.
           */
          .panel.away {
            transform: translateX(calc(100% + 48px));
          }
          .head {
            display: flex;
            align-items: center;
            padding: 14px 16px 8px;
          }
          h2 {
            flex: 1;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--ink-3);
            font-weight: 600;
          }
          .fold {
            color: var(--ink-3);
            font-size: 15px;
            line-height: 1;
            padding: 0 4px;
          }
          .fold:hover {
            color: var(--accent);
          }
          .scroll {
            flex: 1;
            overflow-y: auto;
            padding: 0 12px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .day {
            font-size: 11.5px;
            color: var(--ink-3);
            font-weight: 600;
            padding: 8px 4px 4px;
          }
          .empty {
            color: var(--ink-2);
            font-size: 13px;
            padding: 12px 4px;
          }
          .addform {
            display: flex;
            gap: 6px;
            align-items: center;
          }
          .addform select {
            flex: 1;
            min-width: 0;
          }
          .orphans {
            font-size: 11.5px;
            color: var(--ink-3);
            border-top: 1px dashed var(--line-strong);
            padding-top: 8px;
          }
          .addrow {
            border: 1.5px dashed var(--line-strong);
            border-radius: 10px;
            padding: 9px;
            text-align: center;
            color: var(--ink-2);
            font-size: 13px;
            width: 100%;
          }
          .addrow:hover {
            border-color: var(--accent);
            color: var(--accent);
          }
        `}</style>
      </aside>
    </>
  );
}

/**
 * Корешок свёрнутой колонки. Отдельным компонентом, а не веткой внутри
 * Timeline: styled-jsx наклеивает свои классы только на то поддерево, где
 * лежит его <style jsx>, — в соседней ветке фрагмента полоска осталась бы
 * без стилей и вывалилась бы в поток страницы.
 */
function PlanStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="strip"
      onClick={onOpen}
      aria-expanded={false}
      aria-label="Развернуть план поездки"
      title="Развернуть план поездки"
    >
      <span className="chev">‹</span>
      <span className="vert">План поездки</span>

      <style jsx>{`
        .strip {
          position: absolute;
          top: 14px;
          right: 14px;
          bottom: 14px;
          width: var(--strip-w);
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
          color: var(--ink-3);
          animation: stripin 0.18s ease;
        }
        .strip:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .chev {
          font-size: 15px;
          line-height: 1;
        }
        .vert {
          /* читается снизу вверх, как надпись на корешке книги */
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 600;
          white-space: nowrap;
        }
        @keyframes stripin {
          from { opacity: 0; }
        }
      `}</style>
    </button>
  );
}

/**
 * Заметка карточки: свой текст или ответ копилота. Живёт внутри карточки,
 * поэтому гасит клики — иначе каждое нажатие открывало бы веер вариантов.
 */
function NoteBlock({
  note,
  ask,
  busy,
  onSave,
}: {
  note?: Note;
  /** Кнопка «спросить копилота» — только там, где это осмысленно. */
  ask?: { label: string; run: () => void };
  busy?: boolean;
  onSave: (note: Note | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(note?.text ?? "");
    setEditing(true);
  };
  const save = () => {
    const t = draft.trim();
    onSave(t ? { text: t, source: "user" } : null);
    setEditing(false);
  };

  return (
    <div
      className="wrap"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {editing ? (
        <div className="edit">
          <textarea
            value={draft}
            autoFocus
            rows={4}
            placeholder="Что не забыть, что посмотреть…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="acts">
            <button className="btn primary sm" onClick={save}>Сохранить</button>
            <button className="btn sm" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      ) : note ? (
        <div className="note">
          <div className="nhead">
            <span className="src">{note.source === "ai" ? "✦ совет ИИ" : "заметка"}</span>
            <button className="lnk" onClick={startEdit}>изменить</button>
            <button className="lnk" onClick={() => onSave(null)}>удалить</button>
          </div>
          <div
            className="md body"
            // рендер санитайзит HTML и схемы ссылок (см. lib/lightMarkdown)
            dangerouslySetInnerHTML={{ __html: renderLightMarkdown(note.text) }}
          />
        </div>
      ) : busy ? (
        <div className="note pending">✦ копилот подбирает…</div>
      ) : (
        <div className="acts">
          <button className="lnk" onClick={startEdit}>+ заметка</button>
          {ask && (
            <button className="lnk accent" onClick={ask.run}>
              {ask.label}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .wrap { margin-top: 6px; margin-left: 28px; }
        .acts { display: flex; gap: 12px; align-items: center; margin-top: 2px; }
        .lnk {
          font-size: 11.5px;
          color: var(--ink-3);
          padding: 0;
        }
        .lnk:hover { color: var(--accent); }
        .lnk.accent { color: var(--accent); font-weight: 600; }
        .note {
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--ink-2);
        }
        .note.pending { color: var(--accent); }
        .nhead {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 3px;
        }
        .src {
          flex: 1;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--ink-3);
        }
        .body { max-height: 220px; overflow-y: auto; }
        .edit textarea {
          width: 100%;
          font-size: 12.5px;
          line-height: 1.45;
          padding: 7px 9px;
          resize: vertical;
        }
        .edit .acts { margin-top: 6px; }
        .edit :global(.btn.sm) { padding: 4px 11px; font-size: 12px; }
      `}</style>
    </div>
  );
}

/**
 * Начальная точка маршрута. Плеча ещё нет, но выбор уже сделан — карточка
 * это фиксирует, чтобы первый клик «добавить город» не выглядел пустым.
 */
function OriginCard({
  city,
  date,
  onRemove,
  note,
  onNote,
}: {
  city: string;
  date?: string;
  /** Убрать начальную точку; с плечами началом станет следующий город. */
  onRemove?: () => void;
  note?: Note;
  onNote: (note: Note | null) => void;
}) {
  return (
    <div className="card">
      <div className="row">
        <span className="ic">◉</span>
        <span className="title">
          <span className="lbl">Начальная точка</span>
          {city}
        </span>
        {onRemove && (
          <button className="rm" aria-label={`Убрать ${city}`} title={`Убрать ${city}`} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      {date && <div className="sub">старт · {dayLabel(date)}</div>}
      <NoteBlock note={note} onSave={onNote} />
      <style jsx>{`
        .card {
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-left: 3px solid var(--accent);
          border-radius: 10px;
          padding: 9px 11px;
        }
        .row { display: flex; align-items: center; gap: 8px; }
        .ic {
          width: 20px; height: 20px; border-radius: 5px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11px; color: var(--accent); flex: none;
        }
        .title { font-weight: 600; font-size: 13.5px; flex: 1; }
        .lbl {
          display: block;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--ink-3);
          margin-bottom: 1px;
        }
        .sub { color: var(--ink-2); font-size: 12px; margin-top: 3px; padding-left: 28px; }
        .rm {
          color: var(--ink-3);
          font-size: 13px;
          line-height: 1;
          padding: 3px 4px;
          border-radius: 6px;
        }
        .rm:hover { color: var(--danger); background: var(--danger-bg); }
      `}</style>
    </div>
  );
}

function LegCard({
  leg,
  status,
  unavailable,
  warn,
  window: win,
  hovered,
  onHover,
  onClick,
  onSplit,
  onSeatmap,
  onRemove,
  onSelfRide,
  onRestoreTicket,
  noteBusy,
  onNote,
  onAskSights,
  resolved,
  transfer,
  onFindTransfer,
  onSuggestCity,
}: {
  leg: Leg;
  status: string;
  unavailable: Array<{ mode: string; reason?: string; detail?: string }>;
  warn?: { kind: string; message: string };
  window?: TimeWindowNote;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
  onSplit: () => void;
  onSeatmap: () => void;
  /** Убрать город прибытия плеча; в середине маршрута соседние плечи сольются. */
  onRemove?: () => void;
  /** Своим ходом: билет не нужен, плечо остаётся, цена вносится расходом. */
  onSelfRide: () => void;
  onRestoreTicket: () => void;
  noteBusy: boolean;
  onNote: (note: Note | null) => void;
  onAskSights: (w: TimeWindowNote) => void;
  /** Как Туту понял города плеча — показываем при пустой выдаче. */
  resolved?: { from?: ResolvedGeo; to?: ResolvedGeo };
  /** Фоновый автоподбор пересадки для пустого плеча. */
  transfer?: LegTransferState;
  onFindTransfer: () => void;
  onSuggestCity: (oldName: string, newName: string) => void;
}) {
  const o = leg.selectedOffer;
  // крестик спрашивает, что именно убрать: город или только билет
  const [rmOpen, setRmOpen] = useState(false);
  const stops = o ? layoverSummary(o) : null;
  const empty = status === "empty" && !leg.noTicket ? explainEmptyLeg(unavailable, leg.date) : null;
  const canSplit = empty?.hubSplit && leg.from.name !== "Москва" && leg.to.name !== "Москва";
  // подсказка нужна и для города отправления: «Бали → Москва» ломается так же
  const badCity = empty
    ? suggestDestination(leg.to.name)
      ? leg.to.name
      : suggestDestination(leg.from.name)
        ? leg.from.name
        : undefined
    : undefined;
  const suggestion = badCity ? suggestDestination(badCity) : undefined;
  const resolvedPair = empty
    ? [resolvedLabel(resolved?.from), resolvedLabel(resolved?.to)].filter(Boolean).join(" → ") ||
      undefined
    : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      className={`card${hovered ? " hl" : ""}`}
      onClick={onClick}
      // Enter только на самой карточке: внутри живут поля заметки
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onClick()}
      onPointerEnter={() => onHover(leg.id)}
      onPointerLeave={() => {
        onHover(null);
        setRmOpen(false);
      }}
    >
      <div className="row">
        <span className={`ic m-${o?.mode ?? leg.mode}`}>
          {leg.noTicket ? "🚶" : status === "loading" && !o ? <span className="spin" /> : MODE_ICON[o?.mode ?? leg.mode]}
        </span>
        <span className="title">{leg.from.name} → {leg.to.name}</span>
        <span className={`price${status === "loading" && !o && !leg.noTicket ? " pulse" : ""}`}>
          {leg.noTicket ? "" : o ? fmt(o.price) : status === "loading" ? "— ₽" : status === "empty" ? "нет" : ""}
        </span>
        {onRemove && (
          <button
            className="rm"
            aria-label={`Убрать ${leg.to.name} из маршрута`}
            title={`Убрать ${leg.to.name}`}
            aria-haspopup={!leg.noTicket}
            aria-expanded={rmOpen}
            onClick={(e) => {
              e.stopPropagation();
              // без билета выбора нет: остаётся только убрать город
              if (leg.noTicket) onRemove();
              else setRmOpen((v) => !v);
            }}
          >
            ✕
          </button>
        )}
        {rmOpen && (
          <div className="rmenu" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setRmOpen(false);
                onSelfRide();
              }}
            >
              🚶 Поеду своим ходом
            </button>
            <button
              className="drop"
              onClick={() => {
                setRmOpen(false);
                onRemove?.();
              }}
            >
              ✕ Убрать {leg.to.name} из маршрута
            </button>
          </div>
        )}
      </div>
      <div className="sub">
        {leg.noTicket ? (
          <>
            своим ходом · цена — через «+ расход» ·{" "}
            <span
              className="restore"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRestoreTicket();
              }}
              onKeyDown={(e) => e.key === "Enter" && onRestoreTicket()}
            >
              подобрать билеты
            </span>
          </>
        ) : o ? (
          `${timeOf(o.departureAt)} → ${timeOf(o.arrivalAt)} · ${o.carriers.join(", ")}` +
          (o.chosenFare ? ` · ${o.chosenFare}` : "")
        ) : status === "loading" ? (
          leg.mode === "any"
            ? "ищем: авиа, поезда, автобусы…"
            : `ищем: ${{ rail: "поезда", avia: "рейсы", bus: "автобусы", etrain: "электрички" }[leg.mode]}…`
        ) : status === "empty" ? (
          "прямых вариантов нет"
        ) : status === "error" ? (
          "Туту не ответил — нажмите, чтобы повторить"
        ) : (
          "ожидает поиска"
        )}
      </div>
      {stops && (
        <div className={`sub stops${stops.tight ? " tight" : ""}`}>
          {stops.tight ? "⚠ " : stops.long ? "◔ " : "⇄ "}
          {stops.text}
        </div>
      )}
      {empty && (
        <div className="note warn">
          <span>{empty.reasons.join("; ")}</span>
          {resolvedPair && (
            // без этого пустая выдача выглядит поломкой, хотя поиск шёл в другой город
            <div className="resolved">Туту искал: {resolvedPair}</div>
          )}
          <div className="fixes">
            <button
              className="split"
              onClick={(e) => {
                e.stopPropagation();
                onFindTransfer();
              }}
            >
              {transfer?.loading
                ? "Подбираем пересадку…"
                : transfer?.options?.length
                  ? `С пересадкой через ${accusative(transfer.options[0].hub)} от ${fmt(
                      transfer.options[0].totalPrice,
                    )} — показать →`
                  : transfer?.options
                    ? "С пересадкой тоже не нашлось · подробнее"
                    : "Искать с пересадкой →"}
            </button>
            {suggestion && (
              <button
                className="split"
                onClick={(e) => {
                  e.stopPropagation();
                  onSuggestCity(badCity!, suggestion);
                }}
              >
                Попробовать {suggestion}
              </button>
            )}
            {canSplit && (
              <button
                className="split"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit();
                }}
              >
                Разбить через Москву
              </button>
            )}
          </div>
        </div>
      )}
      {o?.mode === "rail" && o.detailsRef ? (
        <div className="sub seatrow">
          {leg.seatChoice ? (
            <>
              {leg.seatChoice.seatNumbers.length > 1 ? "места" : "место"}{" "}
              {leg.seatChoice.seatNumbers.join(", ")} · вагон {leg.seatChoice.carNumber} ·{" "}
            </>
          ) : null}
          <span
            className="seatlink"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSeatmap();
            }}
            onKeyDown={(e) => e.key === "Enter" && onSeatmap()}
          >
            {leg.seatChoice ? "изменить место" : "выбрать место на схеме"}
          </span>
        </div>
      ) : null}
      {win && (
        <div className="note fb">
          ◔ {win.message}
          {win.city && !leg.note && (
            <>
              {" "}
              <button
                className="sights"
                onClick={(e) => {
                  e.stopPropagation();
                  onAskSights(win);
                }}
              >
                Что посмотреть?
              </button>
            </>
          )}
        </div>
      )}
      {leg.autoShifts ? (
        <div className="note fb">
          ⇢ дата сдвинута на {leg.date.split("-").reverse().slice(0, 2).join(".")}, чтобы успеть на
          пересадку
        </div>
      ) : null}
      {warn && (
        <div className={`note ${warn.kind === "impossible" ? "danger" : "warn"}`}>
          {warn.kind === "impossible" ? "⚠ " : "◐ "}
          {warn.message}
        </div>
      )}
      <NoteBlock
        note={leg.note}
        busy={noteBusy}
        ask={win?.city ? { label: "✦ что посмотреть", run: () => onAskSights(win) } : undefined}
        onSave={onNote}
      />
      <style jsx>{`
        .card {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 9px 11px;
          width: 100%;
          text-align: left;
          transition: border-color 0.15s, background 0.15s;
        }
        .card:hover,
        .card.hl {
          border-color: var(--accent);
          background: var(--panel-2);
        }
        .row {
          display: flex;
          align-items: center;
          gap: 8px;
          /* якорь для выпадающего меню крестика */
          position: relative;
        }
        .rmenu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          z-index: 5;
          display: flex;
          flex-direction: column;
          min-width: 200px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .rmenu button {
          text-align: left;
          font-size: 12px;
          padding: 8px 12px;
          color: var(--ink-2);
        }
        .rmenu button:hover {
          background: var(--panel-2);
          color: var(--accent);
        }
        .rmenu button.drop:hover {
          color: var(--danger);
          background: var(--danger-bg);
        }
        .restore {
          color: var(--accent);
          font-weight: 500;
          text-decoration: underline;
          cursor: pointer;
        }
        .ic {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          flex: none;
        }
        .m-avia { background: var(--avia-soft); }
        .m-rail { background: var(--rail-soft); }
        .m-bus { background: var(--bus-soft); }
        .m-etrain { background: var(--rail-soft); }
        .m-any { background: var(--panel-2); }
        .title {
          font-weight: 600;
          font-size: 13.5px;
          flex: 1;
        }
        .price {
          font-weight: 600;
          font-size: 13.5px;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .price.pulse {
          color: var(--ink-3);
          animation: pulse 1.1s ease-in-out infinite;
        }
        @keyframes pulse {
          50% { opacity: 0.35; }
        }
        .spin {
          width: 12px;
          height: 12px;
          border: 2px solid var(--line-strong);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: rot 0.7s linear infinite;
        }
        @keyframes rot {
          to { transform: rotate(360deg); }
        }
        .sub {
          color: var(--ink-2);
          font-size: 12px;
          margin-top: 3px;
          padding-left: 28px;
        }
        .sub.stops { color: var(--ink-3); }
        .sub.stops.tight { color: var(--warn); font-weight: 500; }
        .note {
          font-size: 11.5px;
          border-radius: 7px;
          padding: 5px 9px;
          margin-top: 6px;
          margin-left: 28px;
        }
        .note.warn { background: var(--warn-bg); color: var(--warn); }
        .note.danger { background: var(--danger-bg); color: var(--danger); font-weight: 500; }
        .note.fb { background: var(--rail-soft); color: var(--rail); }
        .fixes {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 5px;
        }
        .resolved {
          margin-top: 4px;
          font-size: 11px;
          color: var(--ink-3);
        }
        .split,
        .sights {
          color: var(--accent);
          font-weight: 600;
          font-size: 11.5px;
          padding: 0;
          text-decoration: underline;
        }
        .rm {
          color: var(--ink-3);
          font-size: 13px;
          line-height: 1;
          padding: 3px 4px;
          border-radius: 6px;
          opacity: 0;
          transition: opacity 0.15s, color 0.15s, background 0.15s;
        }
        .card:hover .rm,
        .card.hl .rm,
        .rm:focus-visible { opacity: 1; }
        .rm:hover { color: var(--danger); background: var(--danger-bg); }
        .seatrow { margin-top: 3px; }
        .seatlink {
          color: var(--accent);
          font-weight: 500;
          text-decoration: underline;
          cursor: pointer;
        }
        .card { cursor: pointer; }
      `}</style>
    </div>
  );
}

function StayCard({
  stay,
  status,
  windows,
  hovered,
  onHover,
  onClick,
  noteBusy,
  onNote,
  onAskSights,
  onRemoveHotel,
  onRestoreHotel,
}: {
  stay: Stay;
  status: string;
  windows: TimeWindowNote[];
  hovered: boolean;
  onHover: (key: string | null) => void;
  onClick: () => void;
  noteBusy: boolean;
  onNote: (note: Note | null) => void;
  onAskSights: () => void;
  /** Убрать отель: ночёвка остаётся, карточка переходит в «без отеля». */
  onRemoveHotel: () => void;
  onRestoreHotel: () => void;
}) {
  const h = stay.selectedHotel;
  return (
    // не <button>: внутри карточки живут поля заметки со своими кнопками
    <div
      role="button"
      tabIndex={0}
      className={`card${hovered ? " hl" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onClick()}
      onPointerEnter={() => onHover(stayKey(stay))}
      onPointerLeave={() => onHover(null)}
    >
      <div className="row">
        <span className="ic">🏨</span>
        <span className="title">
          {h ? h.name : stay.noHotel ? `Без отеля · ${stay.city.name}` : `Отель · ${stay.city.name}`}
        </span>
        <span className="price">{h ? fmt(h.price) : status === "loading" && !stay.noHotel ? "…" : ""}</span>
        {!stay.noHotel && (
          <button
            className="rm"
            aria-label={`Убрать отель ${inCity(stay.city.name)}`}
            title={`Убрать отель ${inCity(stay.city.name)}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveHotel();
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div className="sub">
        {stay.noHotel ? (
          <>
            {stay.nights} ноч. · ночлег свой ·{" "}
            <span
              className="restore"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRestoreHotel();
              }}
              onKeyDown={(e) => e.key === "Enter" && onRestoreHotel()}
            >
              подобрать отель
            </span>
          </>
        ) : (
          <>
            {stay.nights} ноч. ·{" "}
            {h ? `${h.stars ?? "—"}★` : status === "empty" ? "свободных не нашлось" : "подбираем…"}
          </>
        )}
      </div>
      {windows.map((w) => (
        <div key={w.kind} className="note">◔ {w.message}</div>
      ))}
      <NoteBlock
        note={stay.note}
        busy={noteBusy}
        ask={{ label: "✦ что посмотреть", run: onAskSights }}
        onSave={onNote}
      />
      <style jsx>{`
        .card {
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 9px 11px;
          width: 100%;
          text-align: left;
          cursor: pointer;
        }
        /* .hl — подсветка от наведения на город на карте */
        .card:hover,
        .card.hl {
          border-color: var(--accent);
          background: var(--panel-2);
        }
        .row { display: flex; align-items: center; gap: 8px; }
        .ic {
          width: 20px; height: 20px; border-radius: 5px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11px; background: var(--hotel-soft); flex: none;
        }
        .title { font-weight: 600; font-size: 13.5px; flex: 1; }
        .price { font-weight: 600; font-size: 13.5px; font-variant-numeric: tabular-nums; }
        .sub { color: var(--ink-2); font-size: 12px; margin-top: 3px; padding-left: 28px; }
        .note {
          font-size: 11.5px;
          border-radius: 7px;
          padding: 5px 9px;
          margin-top: 6px;
          margin-left: 28px;
          background: var(--warn-bg);
          color: var(--warn);
        }
        .rm {
          color: var(--ink-3);
          font-size: 13px;
          line-height: 1;
          padding: 3px 4px;
          border-radius: 6px;
          opacity: 0;
          transition: opacity 0.15s, color 0.15s, background 0.15s;
        }
        .card:hover .rm,
        .card.hl .rm,
        .rm:focus-visible { opacity: 1; }
        .rm:hover { color: var(--danger); background: var(--danger-bg); }
        .restore {
          color: var(--accent);
          font-weight: 500;
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
