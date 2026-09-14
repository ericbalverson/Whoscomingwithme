import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";

// Lowercase + digits, no ambiguous chars — short enough to read aloud when
// someone shares a trip link at the trailhead with no signal.
const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 8);

export async function POST(req: Request) {
  const body = await req.json();
  const { name, rangeStart, rangeEnd, organizerName } = body as {
    name?: string;
    rangeStart?: string;
    rangeEnd?: string;
    // Optional: if given, the organizer is immediately added as the first
    // participant, so they don't have to re-type their name on the trip
    // page they're about to land on.
    organizerName?: string;
  };

  if (!name || !rangeStart || !rangeEnd) {
    return NextResponse.json(
      { error: "name, rangeStart, and rangeEnd are required" },
      { status: 400 }
    );
  }

  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }

  const trip = await prisma.trip.create({
    data: {
      slug: nanoid(),
      name,
      rangeStart: start,
      rangeEnd: end,
      ...(organizerName?.trim()
        ? { participants: { create: { name: organizerName.trim() } } }
        : {}),
    },
    include: { participants: true },
  });

  const organizerId = trip.participants[0]?.id ?? null;

  return NextResponse.json({ trip, organizerId }, { status: 201 });
}
