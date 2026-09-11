import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, User, Wrench } from "lucide-react";

import { useLeadSearch, useTicketSearch } from "@/lib/supabase/hooks.ts";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { STAGE_LABELS, TICKET_STATUS_LABELS } from "@/lib/constants.ts";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command.tsx";

/**
 * Cmd+K / Ctrl+K anywhere in the app. Mounted once in `AppLayout` so the
 * shortcut works from any page, not just a dedicated search route.
 *
 * Searches leads (name/email/phone) and service tickets (title/description)
 * server-side — both queries already run through the same RLS a sales rep's
 * own lead list does, so results never leak a lead outside what that rep can
 * already see elsewhere in the app.
 */
export default function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [debouncedQuery] = useDebounce(query, 250);
    const navigate = useNavigate();

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        }
        // The sidebar's search button lives outside this component (it needs
        // to render even when this one hasn't mounted yet on first paint), so
        // it reaches in via a DOM event rather than prop-drilling `setOpen`
        // through AppLayout.
        function onOpenRequest() {
            setOpen(true);
        }
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("lampara:open-search", onOpenRequest);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("lampara:open-search", onOpenRequest);
        };
    }, []);

    // Query resets a beat after the dialog closes, not before — closing mid
    // fade shouldn't blank the results the user is still looking at.
    function onOpenChange(next: boolean) {
        setOpen(next);
        if (!next) setTimeout(() => setQuery(""), 200);
    }

    const leadsQuery = useLeadSearch(debouncedQuery);
    const ticketsQuery = useTicketSearch(debouncedQuery);
    const leads = leadsQuery.data ?? [];
    const tickets = ticketsQuery.data ?? [];
    const searching = query.trim().length > 1;
    const loading = searching && (leadsQuery.isFetching || ticketsQuery.isFetching);
    const noResults = searching && !loading && leads.length === 0 && tickets.length === 0;

    function go(path: string) {
        navigate(path);
        onOpenChange(false);
    }

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Search"
            description="Search projects and service tickets"
            shouldFilter={false}
        >
            <CommandInput
                placeholder="Search projects, phone numbers, tickets…"
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                {!searching && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        Type a name, phone number or ticket to search.
                    </div>
                )}
                {loading && (
                    <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Searching…
                    </div>
                )}
                {noResults && <CommandEmpty>No results for "{query}".</CommandEmpty>}

                {leads.length > 0 && (
                    <CommandGroup heading="Projects">
                        {leads.map((lead) => (
                            <CommandItem
                                key={lead._id}
                                value={`lead-${lead._id}`}
                                onSelect={() => go(`/projects/${lead._id}`)}
                            >
                                <User className="text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate">{lead.firstName} {lead.lastName}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {lead.phone}{lead.email ? ` · ${lead.email}` : ""}
                                    </p>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {STAGE_LABELS[lead.stage] ?? lead.stage}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {tickets.length > 0 && (
                    <CommandGroup heading="Service Tickets">
                        {tickets.map((ticket) => (
                            <CommandItem
                                key={ticket._id}
                                value={`ticket-${ticket._id}`}
                                onSelect={() => go(`/projects/${ticket.leadId}?tab=maintenance`)}
                            >
                                <Wrench className="text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate">{ticket.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {ticket.customerName}
                                    </p>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    );
}
