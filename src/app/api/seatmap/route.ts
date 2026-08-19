import { NextResponse } from "next/server";
import { callTool, McpError } from "@/lib/mcp";
import { cacheKey, cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export interface SeatDto {
  number: string;
  type: string;
  gender?: string;
  compartment_number?: number;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface CarDto {
  car_number: string;
  car_type: string;
  service_class?: string;
  service_class_description?: string;
  canvas?: { width: number; height: number; svg_url?: string; background_svg_url?: string };
  seats: SeatDto[];
  seat_groups?: Array<{ type: string; seats_count: number; cheapest_fare?: Record<string, unknown> }>;
}

/**
 * Схема вагона. Двухшаговый протокол клиента:
 * 1) без carNumber — обзор: список вагонов (типы, классы, счётчики мест);
 * 2) с carNumber — полная геометрия мест одного вагона (view='full').
 */
export async function POST(req: Request) {
  let body: { detailsRef?: Record<string, unknown>; carNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }
  if (!body.detailsRef) {
    return NextResponse.json({ error: "Нужен detailsRef из rail-оффера" }, { status: 400 });
  }

  const args: Record<string, unknown> = body.carNumber
    ? { details_ref: body.detailsRef, car_number: body.carNumber, view: "full" }
    : { details_ref: body.detailsRef, max_cars: 20, max_seats_per_car: 1, view: "compact" };

  try {
    const { value } = await cached(cacheKey("get_rail_seatmap", args), () =>
      callTool<{ cars?: CarDto[]; seatmap_status?: string; warnings?: unknown }>(
        "get_rail_seatmap",
        args,
      ),
    );
    return NextResponse.json({
      cars: value.cars ?? [],
      status: value.seatmap_status,
    });
  } catch (e) {
    if (e instanceof McpError) {
      return NextResponse.json({ error: `Туту не ответил: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
