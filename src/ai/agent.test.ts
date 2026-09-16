import { describe, expect, it } from "vitest";
import { canonicalArgs, confirmedToolNames, type AgentMessage } from "./agent.ts";

/**
 * `confirmedToolNames` (paired with `canonicalArgs`) is the entire
 * enforcement mechanism behind `AgentTool.requiresConfirmation` — the one
 * thing standing between "the system prompt asked the model to wait for
 * confirmation" and "a write tool actually cannot fire without it". Get this
 * wrong and the gate is decorative. See audit.md's P1 #1 for the scenario
 * this closes: a write tool called in the same turn as a read, with no
 * genuine human message in between confirming it — and the "collects
 * multiple pending tools" / "requires matching arguments" tests below for
 * the narrower follow-up: the retry has to be the *same action*, not just
 * the same tool name, or a description of one project's stage change could
 * silently confirm a retry against a different project entirely.
 */
describe("confirmedToolNames", () => {
    it("confirms nothing for an empty history (first message of a conversation)", () => {
        expect(confirmedToolNames([])).toEqual(new Map());
    });

    it("confirms nothing when the previous turn ended with a tool call, not text", () => {
        const history: AgentMessage[] = [
            { role: "user", content: "cancel the Dela Cruz project" },
            {
                role: "assistant",
                content: [{ type: "tool_use", id: "t1", name: "update_project_stage", input: {} }],
            },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });

    it("confirms nothing when the assistant answered directly with no tool call at all", () => {
        // No tool_result turn before the trailing text — nothing was ever
        // proposed-and-blocked, so there's nothing to confirm.
        const history: AgentMessage[] = [
            { role: "user", content: "what's today?" },
            { role: "assistant", content: "It's September 12, 2026." },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });

    it("confirms nothing when the prior tool_result was a normal success, not a pendingConfirmation refusal", () => {
        const history: AgentMessage[] = [
            { role: "user", content: "what's Juan's stage?" },
            {
                role: "assistant",
                content: [{ type: "tool_use", id: "t1", name: "get_project", input: { projectId: "abc" } }],
            },
            {
                role: "user",
                content: [
                    { type: "tool_result", tool_use_id: "t1", content: JSON.stringify({ stage: "contract_signed" }) },
                ],
            },
            { role: "assistant", content: "Juan's project is at Contract Signed." },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });

    it("confirms the exact tool + arguments named in a pendingConfirmation refusal, once the model followed up in plain text", () => {
        const args = { stage: "cancelled" };
        const history: AgentMessage[] = [
            { role: "user", content: "cancel the Dela Cruz project" },
            {
                role: "assistant",
                content: [{ type: "tool_use", id: "t1", name: "update_project_stage", input: args }],
            },
            {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: "t1",
                        content: JSON.stringify({
                            error: "not confirmed",
                            pendingConfirmation: "update_project_stage",
                            pendingConfirmationArgs: canonicalArgs(args),
                        }),
                        is_error: true,
                    },
                ],
            },
            { role: "assistant", content: "I'll move it to Cancelled — confirm?" },
        ];
        expect(confirmedToolNames(history)).toEqual(
            new Map([["update_project_stage", canonicalArgs(args)]]),
        );
    });

    it("collects multiple pending tools proposed together in one turn", () => {
        const history: AgentMessage[] = [
            { role: "user", content: "cancel it and note why" },
            {
                role: "assistant",
                content: [
                    { type: "tool_use", id: "t1", name: "update_project_stage", input: {} },
                    { type: "tool_use", id: "t2", name: "add_lead_note", input: {} },
                ],
            },
            {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: "t1",
                        content: JSON.stringify({
                            error: "not confirmed",
                            pendingConfirmation: "update_project_stage",
                            pendingConfirmationArgs: canonicalArgs({}),
                        }),
                    },
                    {
                        type: "tool_result",
                        tool_use_id: "t2",
                        content: JSON.stringify({
                            error: "not confirmed",
                            pendingConfirmation: "add_lead_note",
                            pendingConfirmationArgs: canonicalArgs({}),
                        }),
                    },
                ],
            },
            { role: "assistant", content: "I'll cancel it and log why — confirm?" },
        ];
        expect(confirmedToolNames(history)).toEqual(
            new Map([
                ["update_project_stage", canonicalArgs({})],
                ["add_lead_note", canonicalArgs({})],
            ]),
        );
    });

    it("does not confirm a stale pending marker from further back than the immediately preceding turn", () => {
        // The pendingConfirmation is there, but it's not immediately before
        // the trailing text — a normal exchange happened in between, so the
        // proposal has gone stale rather than carrying forward forever.
        const history: AgentMessage[] = [
            { role: "user", content: "cancel it" },
            { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "update_project_stage", input: {} }] },
            {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: "t1",
                        content: JSON.stringify({
                            error: "not confirmed",
                            pendingConfirmation: "update_project_stage",
                            pendingConfirmationArgs: canonicalArgs({}),
                        }),
                    },
                ],
            },
            { role: "assistant", content: "I'll cancel it — confirm?" },
            { role: "user", content: "actually never mind, what's scheduled today?" },
            { role: "assistant", content: "Nothing scheduled today." },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });

    it("does not crash on non-JSON or oddly-shaped tool_result content", () => {
        const history: AgentMessage[] = [
            { role: "user", content: "..." },
            { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_project", input: {} }] },
            { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "not json at all" }] },
            { role: "assistant", content: "Here's what I found." },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });

    it("does not confirm a marker missing pendingConfirmationArgs (old-shape or malformed marker)", () => {
        const history: AgentMessage[] = [
            { role: "user", content: "cancel it" },
            { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "update_project_stage", input: {} }] },
            {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: "t1",
                        // Missing pendingConfirmationArgs entirely.
                        content: JSON.stringify({ error: "not confirmed", pendingConfirmation: "update_project_stage" }),
                    },
                ],
            },
            { role: "assistant", content: "I'll cancel it — confirm?" },
        ];
        expect(confirmedToolNames(history)).toEqual(new Map());
    });
});

describe("canonicalArgs", () => {
    it("produces the same signature regardless of key order", () => {
        expect(canonicalArgs({ a: 1, b: 2 })).toBe(canonicalArgs({ b: 2, a: 1 }));
    });

    it("distinguishes genuinely different argument values", () => {
        expect(canonicalArgs({ projectId: "a" })).not.toBe(canonicalArgs({ projectId: "b" }));
    });

    it("sorts keys recursively, including inside nested objects", () => {
        expect(canonicalArgs({ outer: { z: 1, a: 2 } })).toBe(
            canonicalArgs({ outer: { a: 2, z: 1 } }),
        );
    });
});
