import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findCandidateWindows } from "@/lib/overlap";
import { geocodeLocation } from "@/lib/providers/geocode";
import { getRecommendations } from "@/lib/recommend";
import { resolveGroupCampingStyle } from "@/lib/campingStyle";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { location, radiusMiles, windowIndex, campingStyleOverride } = body as {
    location?: string;
    radiusMiles?: number;
    windowIndex?: number;
    // Lets the organizer force CAR/BACKPACK/EITHER instead of the group's
    // computed consensus — useful when there's a conflict to break, or
    // when they just want to see the other option.
    campingStyleOverride?: "CAR" | "BACKPACK" | "EITHER";
  };

  if (!location?.trim()) {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({
    where: { slug: params.id },
    include: { participants: { include: { unavailableRanges: true } } },
  });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  const windows = findCandidateWindows(
    trip.rangeStart,
    trip.rangeEnd,
    trip.participants.map((p) => ({
      participantId: p.id,
      name: p.name,
      unavailable: p.unavailableRanges.map((r) => ({ startDate: r.startDate, endDate: r.endDate })),
    }))
  );

  const window = windows[windowIndex ?? 0];
  if (!window) {
    return NextResponse.json(
      { error: "no candidate window yet — have the group mark their availability first" },
      { status: 400 }
    );
  }

  const styleResolution = resolveGroupCampingStyle(
    trip.participants.map((p) => ({ name: p.name, campingStyle: p.campingStyle }))
  );
  const effectiveStyle =
    campingStyleOverride ?? (styleResolution.status === "agreed" ? styleResolution.style : "EITHER");

  const geo = await geocodeLocation(location);
  if (!geo) {
    return NextResponse.json({ error: `could not find a location matching "${location}"` }, { status: 400 });
  }

  try {
    const recommendations = await getRecommendations({
      latitude: geo.latitude,
      longitude: geo.longitude,
      stateCode: geo.stateCode,
      radiusMiles: radiusMiles ?? 30,
      windowStart: window.startDate,
      windowEnd: window.endDate,
      requiredStyle: effectiveStyle,
    });

    return NextResponse.json({
      window,
      resolvedLocation: geo.displayName,
      campingStyle: { resolution: styleResolution, effectiveStyle },
      ...recommendations,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "recommendation lookup failed" },
      { status: 502 }
    );
  }
}
