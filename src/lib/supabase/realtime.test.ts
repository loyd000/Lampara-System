import { describe, expect, it } from "vitest";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { keysFor } from "./realtime.ts";

type Row = Record<string, unknown>;

/** Only the fields `keysFor` actually reads — `new`, `old`. */
function payload(newRow: Row = {}, oldRow: Row = {}): RealtimePostgresChangesPayload<Row> {
    return { new: newRow, old: oldRow } as RealtimePostgresChangesPayload<Row>;
}

/** `keysFor` returns nested arrays; compare them as their serialised form. */
function serialised(table: string, p: RealtimePostgresChangesPayload<Row>): string[] {
    return keysFor(table, p).map((key) => JSON.stringify(key));
}

describe("keysFor", () => {
    it("narrows a lead change to that lead rather than every lead detail", () => {
        const keys = serialised("leads", payload({ id: "lead-1" }));

        expect(keys).toContain(JSON.stringify(["leads", "detail", "lead-1"]));
        expect(keys).toContain(JSON.stringify(["leads", "enriched"]));
    });

    it("falls back to the broad key when the changed row carries no id", () => {
        // DELETE without REPLICA IDENTITY FULL would look like this.
        expect(serialised("leads", payload())).toContain(JSON.stringify(["leads"]));
    });

    /**
     * The Leads list shows a design type derived from the *approved* quote, so
     * approving one has to reach the lead lists — not just the quote caches.
     * This regressed once already: the column sat stale until the 5-minute
     * staleTime lapsed.
     */
    it.each(["quotes", "quote_items"])(
        "refreshes the lead lists when %s change, since design type is derived from them",
        (table) => {
            const keys = serialised(table, payload({ lead_id: "lead-1", quote_id: "q-1" }));

            expect(keys).toContain(JSON.stringify(["leads", "enriched"]));
            expect(keys).toContain(JSON.stringify(["leads", "search"]));
        },
    );

    it("refreshes lead lists and search when a property changes, since both show location", () => {
        const keys = serialised("properties", payload({ lead_id: "lead-1" }));

        expect(keys).toContain(JSON.stringify(["leads", "enriched"]));
        expect(keys).toContain(JSON.stringify(["leads", "search"]));
    });

    it("reads the lead id off `old` when a delete leaves `new` empty", () => {
        const keys = serialised("lead_notes", payload({}, { lead_id: "lead-9" }));

        expect(keys).toContain(JSON.stringify(["leadNotes", "lead", "lead-9"]));
    });

    it("ignores tables it does not know about", () => {
        expect(keysFor("something_else", payload({ id: "x" }))).toEqual([]);
    });
});
