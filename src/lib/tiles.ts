/**
 * Веб-Меркатор и XYZ-тайлы для карты отелей.
 * Своя реализация вместо MapLibre/Leaflet: нам нужен один экран с пинами,
 * а пан/зум в приложении уже написан — библиотека тянула бы килобайты ради
 * того, что здесь занимает страницу формул. Подложка настраивается через
 * NEXT_PUBLIC_TILES_URL; без неё карта работает в схематичном режиме.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;
/** Одна точка на карте — улица, а не континент. */
export const SINGLE_POINT_ZOOM = 15;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Центр карты в мировых пикселях выбранного зума. */
export interface MapView {
  cx: number;
  cy: number;
  z: number;
}

export function normX(lng: number): number {
  return (lng + 180) / 360;
}

export function normY(lat: number): number {
  // за полюсами проекция расходится — Меркатор режут на ±85.05°
  const r = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
}

export function worldSize(z: number): number {
  return TILE_SIZE * 2 ** z;
}

export function worldPx(p: LatLng, z: number): { x: number; y: number } {
  const s = worldSize(z);
  return { x: normX(p.lng) * s, y: normY(p.lat) * s };
}

/** Метры на пиксель — для колец расстояний и масштабной линейки. */
export function metersPerPixel(lat: number, z: number): number {
  return (156543.033928 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Вид, при котором все точки помещаются в окно с отступом. */
export function fitView(points: LatLng[], w: number, h: number, pad = 64): MapView {
  if (points.length === 0) return { cx: worldSize(MIN_ZOOM) / 2, cy: worldSize(MIN_ZOOM) / 2, z: MIN_ZOOM };
  const xs = points.map((p) => normX(p.lng));
  const ys = points.map((p) => normY(p.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dx = maxX - minX;
  const dy = maxY - minY;

  let z: number;
  if (dx === 0 && dy === 0) {
    z = SINGLE_POINT_ZOOM;
  } else {
    const availW = Math.max(64, w - pad * 2);
    const availH = Math.max(64, h - pad * 2);
    z = MAX_ZOOM;
    if (dx > 0) z = Math.min(z, Math.log2(availW / (dx * TILE_SIZE)));
    if (dy > 0) z = Math.min(z, Math.log2(availH / (dy * TILE_SIZE)));
    z = Math.floor(z);
  }
  z = clampZoom(z);
  const s = worldSize(z);
  return { cx: ((minX + maxX) / 2) * s, cy: ((minY + maxY) / 2) * s, z };
}

/**
 * Вид «центр города»: окно шириной примерно spanMeters вокруг точки.
 * Отели Туту размазаны по всей агломерации — от Султанахмета до аэропорта
 * 30 км, и охват всех пинов даёт бесполезный масштаб на весь Стамбул.
 * Человек выбирает отель от центра, поэтому от центра и начинаем.
 */
export function cityView(center: LatLng, w: number, h: number, spanMeters = 4000): MapView {
  const minDim = Math.max(64, Math.min(w, h));
  const z = clampZoom(Math.floor(Math.log2((156543.033928 * Math.cos((center.lat * Math.PI) / 180) * minDim) / spanMeters)));
  const p = worldPx(center, z);
  return { cx: p.x, cy: p.y, z };
}

/** Сколько точек попадает в окно — по нему решаем, годится ли вид. */
export function countInView(points: LatLng[], view: MapView, w: number, h: number, pad = 0): number {
  const originX = view.cx - w / 2;
  const originY = view.cy - h / 2;
  return points.filter((pt) => {
    const p = worldPx(pt, view.z);
    const x = p.x - originX;
    const y = p.y - originY;
    return x >= -pad && y >= -pad && x <= w + pad && y <= h + pad;
  }).length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Плотное ядро набора точек. Отель у аэропорта в 29 км сжимал бы весь центр
 * города в одну кляксу, поэтому первый показ строим по ядру, а «Показать все»
 * возвращает полный охват.
 */
export function coreOf(points: LatLng[], quantile = 0.8, minShare = 0.6): LatLng[] {
  if (points.length < 4) return points;
  const xs = points.map((p) => normX(p.lng));
  const ys = points.map((p) => normY(p.lat));
  const mx = median(xs);
  const my = median(ys);
  const d = points.map((_, i) => Math.hypot(xs[i] - mx, ys[i] - my));
  const limit = [...d].sort((a, b) => a - b)[Math.floor(quantile * (points.length - 1))];
  const kept = points.filter((_, i) => d[i] <= limit);
  return kept.length >= Math.ceil(points.length * minShare) ? kept : points;
}

/**
 * Зум на шаг dz с якорем в точке (mx, my) окна: точка под курсором
 * остаётся на месте — иначе карта «убегает» при каждом повороте колеса.
 */
export function zoomBy(view: MapView, dz: number, mx: number, my: number, w: number, h: number): MapView {
  const nz = clampZoom(view.z + dz);
  if (nz === view.z) return view;
  const k = 2 ** (nz - view.z);
  const wx = view.cx - w / 2 + mx;
  const wy = view.cy - h / 2 + my;
  return { z: nz, cx: wx * k - mx + w / 2, cy: wy * k - my + h / 2 };
}

/** Сдвиг перетаскиванием: карта едет за курсором. */
export function panBy(view: MapView, dx: number, dy: number, h: number): MapView {
  const s = worldSize(view.z);
  return {
    ...view,
    cx: view.cx - dx,
    // за края мира по вертикали не уезжаем, по долготе мир цикличен
    cy: Math.max(Math.min(h, s) / 2, Math.min(s - Math.min(h, s) / 2, view.cy - dy)),
  };
}

export interface TileRef {
  key: string;
  x: number;
  y: number;
  z: number;
  /** Позиция левого верхнего угла тайла в координатах окна. */
  left: number;
  top: number;
}

/** Тайлы, попадающие в окно w×h при текущем виде. */
export function visibleTiles(view: MapView, w: number, h: number): TileRef[] {
  const n = 2 ** view.z;
  const originX = view.cx - w / 2;
  const originY = view.cy - h / 2;
  const out: TileRef[] = [];
  const x0 = Math.floor(originX / TILE_SIZE);
  const x1 = Math.floor((originX + w) / TILE_SIZE);
  const y0 = Math.max(0, Math.floor(originY / TILE_SIZE));
  const y1 = Math.min(n - 1, Math.floor((originY + h) / TILE_SIZE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // мир по долготе цикличен: -1 → последний тайл ряда
      const wrapped = ((x % n) + n) % n;
      out.push({
        key: `${view.z}/${wrapped}/${y}@${x}`,
        x: wrapped,
        y,
        z: view.z,
        left: x * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
      });
    }
  }
  return out;
}

export function tileUrl(template: string, t: { x: number; y: number; z: number }): string {
  return template
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

/** Круглый шаг масштабной линейки, ближайший снизу к ~120 px. */
export function scaleStep(mPerPx: number, targetPx = 120): { meters: number; px: number; label: string } {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
  const want = mPerPx * targetPx;
  const meters = steps.filter((s) => s <= want).pop() ?? steps[0];
  return {
    meters,
    px: meters / mPerPx,
    label: meters >= 1000 ? `${meters / 1000} км` : `${meters} м`,
  };
}
