import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findCandidateWindows } from "@/lib/overlap";

// `id` in the route is the trip's short slug, not its cuid — keeps URLs
// shareable (/trip/kx4p9qz2) while the DB still uses cuids internally.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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
      unavailable: p.unavailableRanges.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
      })),
    }))
  );

  return NextResponse.json({ trip, windows });
}

// No separate "organizer" role exists — same trust model as pinning: anyone
// with the trip link can delete it. Fine for a family/friend group; worth
// adding real auth before this could matter for a multi-tenant product.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const trip = await prisma.trip.findUnique({ where: { slug: params.id } });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  // Cascade deletes on Participant and UnavailableRange (set in
  // schema.prisma) handle cleaning up everything attached to this trip.
  await prisma.trip.delete({ where: { id: trip.id } });

  return NextResponse.json({ ok: true });
}
