"use client";

import { useEffect, useState } from "react";
import { topAmenities, type HotelCard, type HotelReview } from "@/lib/hotelCard";
import { bedLabel, type RoomSnapshot } from "@/lib/rooms";
import { stayKey, type HotelSnapshot, type Stay } from "@/lib/trip";
import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function reviewDate(d?: string) {
  return d ? DATE_FMT.format(new Date(`${d}T12:00:00`)) : "";
}

interface CardResponse {
  rooms?: RoomSnapshot[];
  hotel?: HotelCard;
  reviews?: HotelReview[];
  reviewsTotal?: number;
  reviewsHasMore?: boolean;
  reviewsNextOffset?: number;
  error?: string;
}

/**
 * Карточка отеля: галерея, оценки по аспектам, удобства, правила и отзывы
 * из get_offer_details(view='full') — плюс номера, ради которых её и
 * открывают. Выбор тарифа кладёт в план offerpack_hash, из него
 * create_checkout_link собирает корзину сразу с этим номером.
 */
export function HotelModal({
  hotel,
  stay,
  onClose,
  onPicked,
}: {
  hotel: HotelSnapshot;
  stay: Stay;
  onClose: () => void;
  /** вызывается после выбора номера — закрывает и веер вариантов */
  onPicked?: () => void;
}) {
  const party = useTrip((s) => s.party);
  const chooseHotel = useTrip((s) => s.chooseHotel);
  const [data, setData] = useState<CardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [allAmenities, setAllAmenities] = useState(false);
  const [rules, setRules] = useState(false);
  const [reviews, setReviews] = useState<HotelReview[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = (reviewOffset: number) =>
    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelId: hotel.hotelId,
        checkin: stay.checkin,
        checkout: stay.checkout,
        party,
        view: "full",
        reviewOffset,
      }),
    }).then((r) => r.json() as Promise<CardResponse>);

  useEffect(() => {
    load(0)
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setData(d);
        setReviews(d.reviews ?? []);
        setHasMore(d.reviewsHasMore ?? false);
        setNextOffset(d.reviewsNextOffset ?? 0);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotel.hotelId]);

  const moreReviews = () => {
    setLoadingMore(true);
    load(nextOffset)
      .then((d) => {
        setReviews((prev) => [...prev, ...(d.reviews ?? [])]);
        setHasMore(d.reviewsHasMore ?? false);
        setNextOffset(d.reviewsNextOffset ?? nextOffset);
      })
      .finally(() => setLoadingMore(false));
  };

  const pick = (room: RoomSnapshot, rateIx: number) => {
    const rate = room.rates[rateIx];
    // ключ должен совпадать со stayKey — иначе выбор не долетит до плана
    chooseHotel(stayKey(stay), {
      ...hotel,
      price: rate.price,
      roomName: room.name,
      mealName: rate.mealName,
      breakfastIncluded: rate.breakfastIncluded,
      freeCancellation: rate.freeCancellation,
      checkoutRef: {
        ...hotel.checkoutRef,
        ...(rate.offerpackHash ? { offer_pack_hash: rate.offerpackHash } : {}),
      },
    });
    onClose();
    onPicked?.();
  };

  const card = data?.hotel;
  const rooms = data?.rooms;
  const photos = card?.photos ?? (hotel.photo ? [hotel.photo] : []);
  const amenities = card ? topAmenities(card.amenityGroups) : [];

  return (
    <div className="ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="head">
          <div>
            <h3>{card?.name ?? hotel.name}</h3>
            <p className="sub">
              {hotel.stars ? `${hotel.stars}★ · ` : ""}
              {stay.nights} ноч. · {stay.checkin.slice(8)}–{stay.checkout.slice(8)}
              {card?.address ? ` · ${card.address}` : hotel.address ? ` · ${hotel.address}` : ""}
            </p>
          </div>
          {/* 0.0 — это «оценок нет», а не плохой отель: значок прячем */}
          {!!(card?.rating ?? hotel.rating) && (
            <div className="score">
              <b>{(card?.rating ?? hotel.rating)!.toFixed(1)}</b>
              <span>
                {card?.ratingText ?? "рейтинг"}
                {card?.reviewCount ? ` · ${card.reviewCount}` : ""}
              </span>
            </div>
          )}
          <button className="btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        {error && <p className="sub err">{error}</p>}
        {!data && !error && <div className="loading">Загружаем карточку отеля…</div>}

        {photos.length > 0 && (
          <div className="gallery">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero" src={photos[Math.min(photo, photos.length - 1)]} alt="" />
            {photos.length > 1 && (
              <div className="thumbs">
                {photos.map((p, i) => (
                  <button
                    key={p}
                    className={`thumb${i === photo ? " on" : ""}`}
                    onClick={() => setPhoto(i)}
                    aria-label={`Фото ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" />
                  </button>
                ))}
                {card?.photosTotal && card.photosTotal > photos.length ? (
                  <span className="rest">ещё {card.photosTotal - photos.length} на Туту</span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {card && (card.checkInTime || card.aspects.length > 0) && (
          <div className="facts">
            {card.checkInTime && (
              <span className="fact">
                заезд с <b>{card.checkInTime}</b>
                {card.checkOutTime ? `, выезд до ${card.checkOutTime}` : ""}
              </span>
            )}
            {card.aspects.map((a) => (
              <span className="fact" key={a.text}>
                {a.text} <b>{a.rating.toFixed(1)}</b>
              </span>
            ))}
          </div>
        )}

        {amenities.length > 0 && (
          <section>
            <h4>
              Удобства
              {card && card.amenityGroups.length > 1 && (
                <button className="lnk" onClick={() => setAllAmenities((v) => !v)}>
                  {allAmenities ? "свернуть" : "все"}
                </button>
              )}
            </h4>
            {allAmenities ? (
              <div className="groups">
                {card!.amenityGroups.map((g) => (
                  <div className="group" key={g.name}>
                    <div className="gname">{g.name}</div>
                    <div className="chips">
                      {g.items.map((a) => (
                        <span className="chip" key={a}>{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chips">
                {amenities.map((a) => (
                  <span className="chip" key={a}>{a}</span>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <h4>Номера {rooms ? <span className="cnt">{rooms.length}</span> : null}</h4>
          {rooms?.length === 0 && <p className="sub">Туту не вернул список номеров для этого отеля.</p>}
          <div className="rooms">
            {(rooms ?? []).map((room, i) => (
              <div className="room" key={`${room.name}-${i}`}>
                {room.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="rph" src={room.photo} alt="" />
                )}
                <div className="rbody">
                  <div className="rhead">
                    <span className="rname">{room.name}</span>
                    {room.priceFrom !== undefined && <span className="rprice">от {fmt(room.priceFrom)}</span>}
                  </div>
                  <div className="rmeta">
                    {[
                      room.bedSummary ?? bedLabel(room.bedType),
                      room.roomsCount ? `${room.roomsCount} комн.` : null,
                      room.sizeSqm ? `${room.sizeSqm} м²` : null,
                      room.maxOccupancy ? `до ${room.maxOccupancy} чел.` : null,
                      room.view ?? null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "детали номера Туту не вернул"}
                  </div>
                  {room.amenities.length > 0 && (
                    <div className="ram">{room.amenities.slice(0, 6).join(" · ")}</div>
                  )}

                  <div className="rates">
                    {room.rates.map((rate, ix) => (
                      <div className="rate" key={rate.offerpackHash ?? ix}>
                        <span className="rt">
                          {[
                            rate.mealName,
                            rate.freeCancellation
                              ? "бесплатная отмена"
                              : rate.refundable
                                ? "возвратный"
                                : "невозвратный",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="rp">{fmt(rate.price)}</span>
                        <button className="btn primary sm" onClick={() => pick(room, ix)}>
                          Выбрать
                        </button>
                      </div>
                    ))}
                    {room.rates.length === 0 && <div className="rmeta">тарифы не вернулись</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {reviews.length > 0 && (
          <section>
            <h4>
              Отзывы
              {data?.reviewsTotal ? <span className="cnt">{data.reviewsTotal}</span> : null}
            </h4>
            <div className="revs">
              {reviews.map((r) => (
                <div className="rev" key={r.id}>
                  <div className="rvhead">
                    {r.rating !== undefined && <span className="rvscore">{r.rating.toFixed(1)}</span>}
                    <span className="rvwho">
                      {r.author ?? "Гость"}
                      {r.tripKind ? ` · ${r.tripKind}` : ""}
                      {r.lineup.length ? ` · ${r.lineup.join(", ")}` : ""}
                    </span>
                    <span className="rvdate">{reviewDate(r.date)}</span>
                  </div>
                  {r.pros.map((t, i) => (
                    <p className="pro" key={`p${i}`}>+ {t}</p>
                  ))}
                  {r.cons.map((t, i) => (
                    <p className="con" key={`c${i}`}>− {t}</p>
                  ))}
                  {r.plain.map((t, i) => (
                    <p className="plain" key={`n${i}`}>{t}</p>
                  ))}
                  {r.source && <div className="src">источник: {r.source}</div>}
                </div>
              ))}
            </div>
            {hasMore && (
              <button className="btn" disabled={loadingMore} onClick={moreReviews}>
                {loadingMore ? "Загружаем…" : "Показать ещё отзывы"}
              </button>
            )}
          </section>
        )}

        {card && card.policies.length > 0 && (
          <section>
            <h4>
              Правила отеля
              <button className="lnk" onClick={() => setRules((v) => !v)}>
                {rules ? "свернуть" : "показать"}
              </button>
            </h4>
            {rules &&
              card.policies.map((p) => (
                <div className="policy" key={p.title}>
                  {p.title && <div className="gname">{p.title}</div>}
                  {p.paragraphs.map((t, i) => (
                    <p className="sub" key={i}>{t}</p>
                  ))}
                </div>
              ))}
          </section>
        )}
      </div>

      <style jsx>{`
        .ovl {
          position: fixed;
          inset: 0;
          background: rgba(10, 16, 26, 0.45);
          z-index: 65;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: var(--panel);
          border-radius: 16px;
          width: min(880px, 100%);
          max-height: 88vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          padding: 20px 22px 24px;
        }
        .head { display: flex; align-items: flex-start; gap: 14px; }
        .head h3 { font-size: 18px; font-weight: 600; }
        .head .btn { padding: 5px 10px; }
        .score {
          margin-left: auto;
          text-align: right;
          white-space: nowrap;
        }
        .score b { font-size: 19px; color: var(--ok); }
        .score span { display: block; font-size: 11px; color: var(--ink-3); }
        .sub { color: var(--ink-2); font-size: 13px; margin-top: 4px; line-height: 1.45; }
        .sub.err { color: var(--danger); }
        .loading { padding: 26px 0; color: var(--ink-2); }

        .gallery { margin-top: 14px; }
        .hero {
          width: 100%;
          height: 280px;
          /*
           * contain, а не cover: отельные фото часто вертикальные, и cover
           * срезал им верх и низ. Целиком с полосами по бокам честнее, чем
           * красиво, но без половины кадра; фон полос — panel-2.
           */
          object-fit: contain;
          border-radius: 12px;
          display: block;
          background: var(--panel-2);
        }
        .thumbs {
          display: flex;
          gap: 6px;
          margin-top: 6px;
          overflow-x: auto;
          align-items: center;
          padding-bottom: 2px;
        }
        .thumb {
          flex: none;
          width: 64px;
          height: 48px;
          border-radius: 7px;
          overflow: hidden;
          padding: 0;
          border: 2px solid transparent;
          opacity: 0.75;
        }
        .thumb.on { border-color: var(--accent); opacity: 1; }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .rest { font-size: 11.5px; color: var(--ink-3); flex: none; padding-left: 4px; }

        .facts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .fact {
          font-size: 12px;
          color: var(--ink-2);
          background: var(--panel-2);
          border-radius: 7px;
          padding: 4px 9px;
        }
        .fact b { color: var(--ink); font-weight: 600; }

        section { margin-top: 20px; }
        h4 {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-weight: 600;
          margin-bottom: 9px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cnt {
          letter-spacing: 0;
          text-transform: none;
          color: var(--ink-2);
          font-weight: 500;
        }
        .lnk {
          margin-left: auto;
          font-size: 11.5px;
          letter-spacing: 0;
          text-transform: none;
          color: var(--accent);
          padding: 0;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          font-size: 12px;
          color: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 7px;
          padding: 3px 9px;
        }
        .groups { display: flex; flex-direction: column; gap: 10px; }
        .gname { font-size: 12.5px; font-weight: 600; margin-bottom: 4px; }

        .rooms { display: flex; flex-direction: column; gap: 10px; }
        .room {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          gap: 12px;
        }
        .rph {
          width: 108px;
          height: 84px;
          object-fit: cover;
          border-radius: 9px;
          flex: none;
          display: block;
        }
        .rbody { flex: 1; min-width: 0; }
        .rhead { display: flex; align-items: baseline; gap: 10px; }
        .rname { font-weight: 600; font-size: 14px; flex: 1; }
        .rprice { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rmeta { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; }
        .ram { font-size: 12px; color: var(--ink-3); margin-top: 3px; }
        .rates { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .rate {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--panel-2);
          border-radius: 9px;
          padding: 7px 10px;
          font-size: 12.5px;
        }
        .rt { flex: 1; color: var(--ink-2); }
        .rp { font-weight: 600; font-variant-numeric: tabular-nums; }
        .rate :global(.btn.sm) { padding: 5px 12px; font-size: 12.5px; }

        .revs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
        .rev {
          border: 1px solid var(--line);
          border-radius: 11px;
          padding: 10px 12px;
        }
        .rvhead { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
        .rvscore {
          font-weight: 700;
          color: var(--ok);
          font-variant-numeric: tabular-nums;
        }
        .rvwho { color: var(--ink-2); flex: 1; }
        .rvdate { color: var(--ink-3); white-space: nowrap; }
        .rev p {
          font-size: 13px;
          line-height: 1.45;
          margin-top: 5px;
        }
        .pro { color: var(--ink); }
        .con { color: var(--ink-2); }
        .plain { color: var(--ink-2); }
        .src { font-size: 11px; color: var(--ink-3); margin-top: 6px; }
        .policy { margin-bottom: 10px; }
      `}</style>
    </div>
  );
}
