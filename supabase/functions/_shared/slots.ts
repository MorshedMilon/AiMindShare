// _shared/slots.ts — the thin slot-shaping helpers that live ABOVE the SQL engine.
// compute_slots() (0017) is authoritative for every DB-visible constraint (weekly
// availability, blocks, existing appointments, buffer, notice, max/day, group
// capacity, round-robin). The one thing SQL can't see is the calendar owner's
// Google busy times — that token lives in Vault and is only readable in an Edge
// Function under the service role. So the Edge Fn calls the RPC, then subtracts
// Google freebusy here. Keeping this the ONLY place freebusy is applied means the
// grid rules are never duplicated (DRY).

export interface Slot {
  slot_start: string;   // ISO timestamptz from compute_slots
  slot_end: string;
  assigned_user: string | null;
}

export interface BusyInterval {
  start: string;  // ISO
  end: string;    // ISO
}

// True when [aStart,aEnd) overlaps [bStart,bEnd).
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Remove any slot that overlaps a Google busy interval. Pure + side-effect-free so
// it is trivially unit-testable and cannot leak a slot the owner is actually busy.
export function subtractBusy(slots: Slot[], busy: BusyInterval[]): Slot[] {
  if (!busy.length) return slots;
  const busyMs = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  return slots.filter((s) => {
    const ss = Date.parse(s.slot_start);
    const se = Date.parse(s.slot_end);
    return !busyMs.some(([bs, be]) => overlaps(ss, se, bs, be));
  });
}
