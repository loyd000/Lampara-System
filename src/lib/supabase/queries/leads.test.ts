import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
    from: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock("../client.ts", () => ({
    supabase: db,
    toAppError: (_error: unknown, message: string) => new Error(message),
    unwrap: vi.fn(),
}));

import { updateLead, updateProperty } from "./leads.ts";

beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue({ update: db.update });
    db.update.mockReturnValue({ eq: db.eq });
    db.eq.mockResolvedValue({ error: null });
    db.rpc.mockResolvedValue({ error: null });
});

describe("lead edits", () => {
    it("explicitly clears nullable contact fields and the sales assignment", async () => {
        await updateLead({
            id: "lead-1",
            email: null,
            referredBy: null,
            notes: null,
            assignedSalesRepId: null,
        });

        expect(db.from).toHaveBeenCalledWith("leads");
        expect(db.update).toHaveBeenCalledWith({
            email: null,
            referred_by: null,
            notes: null,
            assigned_sales_rep_id: null,
            last_activity_at: expect.any(String),
        });
        expect(db.eq).toHaveBeenCalledWith("id", "lead-1");
    });

    it("preserves omitted fields during a partial edit", async () => {
        await updateLead({ id: "lead-1", firstName: "Updated", email: undefined });

        expect(db.update).toHaveBeenCalledWith({
            first_name: "Updated",
            last_activity_at: expect.any(String),
        });
    });

    it("writes replacement values without treating them as clears", async () => {
        await updateLead({
            id: "lead-1",
            email: "new@example.com",
            referredBy: "Pat",
            notes: "Call tomorrow",
            assignedSalesRepId: "rep-2",
        });

        expect(db.update).toHaveBeenCalledWith({
            email: "new@example.com",
            referred_by: "Pat",
            notes: "Call tomorrow",
            assigned_sales_rep_id: "rep-2",
            last_activity_at: expect.any(String),
        });
    });
});

describe("property edits", () => {
    it("clears optional notes when null is supplied", async () => {
        await updateProperty({ propertyId: "property-1", notes: null });

        expect(db.from).toHaveBeenCalledWith("properties");
        expect(db.update).toHaveBeenCalledWith({ notes: null });
        expect(db.eq).toHaveBeenCalledWith("id", "property-1");
    });

    it("leaves notes unchanged when editing only the address", async () => {
        await updateProperty({ propertyId: "property-1", address: "New address" });

        expect(db.update).toHaveBeenCalledWith({ address: "New address" });
    });
});
