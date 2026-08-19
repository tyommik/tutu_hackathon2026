#!/usr/bin/env python3
"""Компактный справочник координат городов из Natural Earth 10m populated places.

Ключи — нормализованные русские и латинские названия, значение — [lat, lng].
При коллизии имён побеждает более крупный город (POP_MAX).
"""
import json

SRC = "places_full.geojson"
OUT = "/Users/shibaev/Dev/github/tutu_ru/src/lib/cityCoords.json"


def norm(s: str) -> str:
    return (
        s.strip()
        .lower()
        .replace("ё", "е")
        .replace("`", "")
        .replace("'", "")
    )


d = json.load(open(SRC))
best: dict[str, tuple[int, float, float]] = {}

for f in d["features"]:
    p = f["properties"]
    g = f["geometry"]
    if not g or g.get("type") != "Point":
        continue
    lng, lat = g["coordinates"][:2]
    pop = p.get("POP_MAX") or 0
    names = [p.get("NAME_RU"), p.get("NAME"), p.get("NAMEASCII"), p.get("NAMEALT")]
    for n in names:
        if not n or not isinstance(n, str):
            continue
        for part in n.split("|"):
            k = norm(part)
            if len(k) < 2:
                continue
            prev = best.get(k)
            if prev is None or pop > prev[0]:
                best[k] = (pop, round(lat, 3), round(lng, 3))

out = {k: [v[1], v[2]] for k, v in best.items()}
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)

import os
print(f"cities: {len(out)}, size: {os.path.getsize(OUT) // 1024} KB")
for probe in ["воронеж", "геленджик", "сочи", "старый оскол", "порту", "варшава", "дубай", "стамбул"]:
    print(f"  {probe}: {out.get(probe)}")
