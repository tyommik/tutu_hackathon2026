"use client";

import { useEffect } from "react";
import {
  encodeSkeleton,
  loadSnapshot,
  planKey,
  saveSnapshot,
  skeletonFromLocation,
} from "@/lib/persist";
import { useTrip, type TripSnapshot } from "@/store/useTrip";

/** Пауза после последнего изменения: план меняется пачками, писать на каждое незачем. */
const DEBOUNCE_MS = 400;

/**
 * Связь плана с адресной строкой и localStorage.
 *
 * Скелет (города, даты, состав, траты) живёт в #-фрагменте: он не уходит на
 * сервер и переживает пересылку ссылкой. Полный снимок с ценами и заметками
 * лежит в localStorage под хешем скелета — из него F5 поднимается мгновенно.
 */
export function StateSync() {
  useEffect(() => {
    const { raw, skeleton } = skeletonFromLocation(window.location.hash);
    if (skeleton) {
      useTrip.getState().restore(skeleton, loadSnapshot<TripSnapshot>(planKey(raw)));
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastHash = raw;

    const flush = () => {
      const s = useTrip.getState();
      if (!s.started) return;
      const encoded = encodeSkeleton(s.skeleton());
      if (encoded !== lastHash) {
        lastHash = encoded;
        // replaceState, а не push: план — это одно состояние, а не история шагов
        window.history.replaceState(null, "", `#p=${encoded}`);
      }
      saveSnapshot<TripSnapshot>(planKey(encoded), s.snapshotData());
    };

    const unsubscribe = useTrip.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
