import { useState } from "react";
import { useEnrichedLeads, useLeadSearch } from "@/lib/supabase/hooks.ts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    STAGE_LABELS, STAGE_COLORS, SOURCE_LABELS, STAGES, type Stage,
} from "@/lib/constants.ts";
import { Plus, Search, SlidersHorizontal, AlertTriangle, User } from "lucide-react";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import CreateLeadDialog from "./_components/CreateLeadDialog.tsx";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { useNow } from "@/hooks/use-now.ts";
import { cn } from "@/lib/utils.ts";
import type { Doc, EnrichedLead } from "@/lib/supabase/types.ts";

export default function LeadsPage() {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [stageFilter, setStageFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [debouncedSearch] = useDebounce(search, 300);
    const now = useNow();

    const { data: page } = useEnrichedLeads({
        ...(stageFilter !== "all" ? { stage: stageFilter as Stage } : {}),
        ...(sourceFilter !== "all" ? { source: sourceFilter as Doc<"leads">["source"] } : {}),
    });
    const { data: searchResults } = useLeadSearch(debouncedSearch);

    // Search returns bare leads; the table only reads the enriched fields when
    // they are present, so widening is enough.
    const isSearching = debouncedSearch.trim().length > 1;
    const rawLeads = isSearching ? (searchResults ?? []) : (page?.leads ?? []);
    const leads = rawLeads as EnrichedLead[];
    const isLoading = isSearching ? searchResults === undefined : page === undefined;

    const staleCount = (page?.leads ?? []).filter((l) => {
        const days = (now - new Date(l.lastActivityAt).getTime()) / 86400000;
        return days > 7 && !["active_customer", "installation_complete"].includes(l.stage);
    }).length;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads & Customers</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading
                            ? "Loading…"
                            : !isSearching && page?.truncated
                                ? `Showing ${leads.length} of ${page.total.toLocaleString()} — narrow with search or filters`
                                : `${leads.length} record${leads.length !== 1 ? "s" : ""}`}
                        {staleCount > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground font-medium">
                                <AlertTriangle className="w-3 h-3" />{staleCount} stale
                            </span>
                        )}
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />New Lead
                </Button>
            </div>

            {/* Filters row */}
            <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name, phone, email…"
                        className="pl-9 bg-card"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-44 bg-card">
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="All stages" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All stages</SelectItem>
                        {STAGES.map((s) => (
                            <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-40 bg-card">
                        <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(stageFilter !== "all" || sourceFilter !== "all" || search) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => { setStageFilter("all"); setSourceFilter("all"); setSearch(""); }}
                    >
                        Clear filters
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden bg-card shadow-2xs">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Contact</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Location</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Source</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Stage</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Assigned To</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Last Activity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            [...Array(6)].map((_, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    {[...Array(7)].map((_, j) => (
                                        <td key={j} className="px-4 py-3">
                                            <Skeleton className="h-4 w-full" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : leads.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-14 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <User className="w-8 h-8 opacity-30" />
                                        <p className="font-medium">
                                            {search ? "No leads match your search." : "No leads yet."}
                                        </p>
                                        {!search && (
                                            <Button size="sm" onClick={() => setCreateOpen(true)}>
                                                <Plus className="w-3.5 h-3.5 mr-1" />Create your first lead
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            leads.map((lead) => {
                                const daysOld = Math.floor(
                                    (now - new Date(lead.lastActivityAt).getTime()) / 86400000,
                                );
                                const isStale = daysOld >= 7 &&
                                    !["active_customer", "installation_complete"].includes(lead.stage);
                                return (
                                    <tr
                                        key={lead._id}
                                        className="border-b last:border-0 hover:bg-muted/25 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/leads/${lead._id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                                                    {lead.firstName.charAt(0)}{lead.lastName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground">{lead.firstName} {lead.lastName}</p>
                                                    {isStale && (
                                                        <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                                                            <AlertTriangle className="w-2.5 h-2.5" />No activity {daysOld}d
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 hidden sm:table-cell">
                                            <p className="text-foreground">{lead.phone}</p>
                                            {lead.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{lead.email}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                                            {lead.property ? `${lead.property.city}, ${lead.property.state}` : "—"}
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <span className="text-xs text-muted-foreground">
                                                {SOURCE_LABELS[lead.source] ?? lead.source}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className={cn(STAGE_COLORS[lead.stage], "text-[11px] font-semibold")}>
                                                {STAGE_LABELS[lead.stage]}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {lead.assignedRepName ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold text-primary">
                                                        {lead.assignedRepName.charAt(0)}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{lead.assignedRepName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground/50">Unassigned</span>
                                            )}
                                        </td>
                                        <td className={cn(
                                            "px-4 py-3 text-xs hidden lg:table-cell",
                                            isStale ? "text-amber-600 font-medium" : "text-muted-foreground",
                                        )}>
                                            {daysOld === 0 ? "Today" : daysOld === 1 ? "Yesterday" : `${daysOld}d ago`}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <CreateLeadDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}
