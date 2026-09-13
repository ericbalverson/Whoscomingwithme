import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// No separate "organizer" role exists yet — same trust model as the rest
// of the app, anyone with the trip link can pin or unpin. Fine for a
// family/friend group; would need real auth before this could matter for
// a multi-tenant product.

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { facilityId, name, bookingUrl, distanceMiles, windowStart, windowEnd } = body as {
    facilityId?: string;
    name?: string;
    bookingUrl?: string;
    distanceMiles?: number;
    windowStart?: string;
    windowEnd?: string;
  };

  if (!facilityId || !name || !bookingUrl) {
    return NextResponse.json({ error: "facilityId, name, and bookingUrl are required" }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({ where: { slug: params.id } });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  const updated = await prisma.trip.update({
    where: { id: trip.id },
    data: {
      pinnedFacilityId: facilityId,
      pinnedName: name,
      pinnedBookingUrl: bookingUrl,
      pinnedDistanceMiles: distanceMiles ?? null,
      pinnedWindowStart: windowStart ? new Date(windowStart) : null,
      pinnedWindowEnd: windowEnd ? new Date(windowEnd) : null,
      pinnedAt: new Date(),
    },
  });

  return NextResponse.json({ pinnedAt: updated.pinnedAt });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const trip = await prisma.trip.findUnique({ where: { slug: params.id } });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  await prisma.trip.update({
    where: { id: trip.id },
    data: {
      pinnedFacilityId: null,
      pinnedName: null,
      pinnedBookingUrl: null,
      pinnedDistanceMiles: null,
      pinnedWindowStart: null,
      pinnedWindowEnd: null,
      pinnedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
