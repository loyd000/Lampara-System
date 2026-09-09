/**
 * A direct REST call to Resend rather than their SDK — one endpoint, one
 * shape, not worth a dependency in a Deno edge runtime.
 */
export async function sendEmail(args: {
    to: string;
    subject: string;
    text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("NOTIFY_FROM");
    if (!apiKey || !from) {
        return { ok: false, error: "RESEND_API_KEY or NOTIFY_FROM secret is not set" };
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: args.to,
            subject: args.subject,
            text: args.text,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
}
