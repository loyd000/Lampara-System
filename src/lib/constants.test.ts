import { describe, expect, it } from "vitest";

import { canScheduleInstallation, STAGES } from "./constants.ts";

describe("canScheduleInstallation", () => {
    it("unlocks as soon as the contract is signed", () => {
        // The regression this guards: the gate was a hand-written list of the
        // stages before installation that included `contract_signed`, because
        // `permitting` used to sit between them. Removing `permitting` left no
        // reachable stage that unlocked the tab at all.
        expect(canScheduleInstallation("contract_signed")).toBe(true);
    });

    it("stays locked before the contract is signed", () => {
        for (const stage of ["lead", "survey_scheduled", "survey_completed", "proposal_sent"]) {
            expect(canScheduleInstallation(stage)).toBe(false);
        }
    });

    it("stays unlocked once installation is under way", () => {
        for (const stage of [
            "installation_scheduled",
            "installation_complete",
            "active_customer",
        ]) {
            expect(canScheduleInstallation(stage)).toBe(true);
        }
    });

    it("treats cancelled as a dead end, not a late stage", () => {
        // `cancelled` is last in STAGES, so a naive index comparison passes it.
        expect(canScheduleInstallation("cancelled")).toBe(false);
    });

    it("locks a stage it doesn't recognise", () => {
        expect(canScheduleInstallation("permitting")).toBe(false);
        expect(canScheduleInstallation("")).toBe(false);
    });

    it("leaves exactly one boundary in the pipeline", () => {
        // Every stage is on one side of the line or the other, and the flip
        // happens once — a second flip would mean the order drifted.
        const flips = STAGES.filter((stage) => stage !== "cancelled")
            .map(canScheduleInstallation)
            .reduce((n, unlocked, i, all) => (i > 0 && unlocked !== all[i - 1] ? n + 1 : n), 0);
        expect(flips).toBe(1);
    });
});
