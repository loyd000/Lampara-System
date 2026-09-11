import { useState } from "react";
import { useEnrichedLeads, useLeadSearch } from "@/lib/supabase/hooks.ts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
    STAGE_LABELS, STAGE_COLORS, STAGE_GROUP_LABELS,
    PROPERTY_TYPE_LABELS, DESIGN_TYPE_LABELS,
    groupOf, type StageGroup,
} from "@/lib/constants.ts";
import { Plus, Search, SlidersHorizontal, AlertTriangle, User } from "lucide-react";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import CreateLeadDialog from "./_components/CreateLeadDialog.tsx";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { useNow } from "@/hooks/use-now.ts";
import { cn } from "@/lib/utils.ts";
import type { PackageDesignType } from "@/lib/supabase/types.ts";

/**
 * Which breakpoint each of the seven table columns appears at, in order:
 * Name, Location, Date Added, Property Type, Design Type, Stage, Last Activity.
 * Kept beside the header row it mirrors — if a column's visibility changes
 * there, it has to change here or the skeleton stops matching the table.
 */
const SKELETON_COLUMNS = [
    "",
    "hidden sm:table-cell",
    "hidden lg:table-cell",
    "hidden md:table-cell",
    "hidden lg:table-cell",
    "",
    "hidden md:table-cell",
] as const;

export default function LeadsPage() {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [stageFilter, setStageFilter] = useState<string>("all");
    const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
    const [designTypeFilter, setDesignTypeFilter] = useState<string>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [debouncedSearch] = useDebounce(search, 300);
    const now = useNow();

    const { data: page } = useEnrichedLeads();
    const { data: searchResults } = useLeadSearch(debouncedSearch);

    const isSearching = debouncedSearch.trim().length > 1;
    const rawLeads = isSearching ? (searchResults ?? []) : (page?.leads ?? []);
    const isLoading = isSearching ? searchResults === undefined : page === undefined;

    // All three of these filter the fetched page client-side rather than
    // round-tripping to the server: stage is filtered by *main* status, not
    // the ten individual substages, which is a client-side grouping over the
    // same `stage` column rather than a distinct server filter; property
    // type and design type are already in hand for the table's own columns.
    const leads = rawLeads.filter((l) =>
        (stageFilter === "all" || groupOf(l.stage) === stageFilter) &&
        (propertyTypeFilter === "all" || l.property?.propertyType === propertyTypeFilter) &&
        (designTypeFilter === "all" || l.designTypes.includes(designTypeFilter as PackageDesignType)),
    );
    const hasActiveFilters =
        stageFilter !== "all" || propertyTypeFilter !== "all" || designTypeFilter !== "all" || !!search;

    const staleCount = (page?.leads ?? []).filter((l) => {
        const days = (now - new Date(l.lastActivityAt).getTime()) / 86400000;
        return days > 7 && !["active_customer", "installation_complete", "cancelled"].includes(l.stage);
    }).length;

    /**
     * The stage, property type and design type filters run over the *fetched*
     * page, which is capped at `LEAD_LIST_LIMIT`. Past that cap a filtered
     * count describes a truncated set, so the cap has to stay on screen — the
     * dangerous version of this is the one that quietly looks authoritative.
     */
    const countLabel = (() => {
        if (isLoading) return "Loading…";
        const records = `${leads.length} record${leads.length !== 1 ? "s" : ""}`;
        if (isSearching || !page?.truncated) return records;

        const total = page.total.toLocaleString();
        return hasActiveFilters
            ? `${records} — filtered from the first ${rawLeads.length} of ${total}`
            : `Showing ${rawLeads.length} of ${total} — narrow with search or filters`;
    })();

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">Leads & Customers</h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        {countLabel}
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
                        <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {(Object.keys(STAGE_GROUP_LABELS) as StageGroup[]).map((group) => (
                            <SelectItem key={group} value={group}>{STAGE_GROUP_LABELS[group]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
                    <SelectTrigger className="w-40 bg-card">
                        <SelectValue placeholder="All property types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All property types</SelectItem>
                        {Object.entries(PROPERTY_TYPE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={designTypeFilter} onValueChange={setDesignTypeFilter}>
                    <SelectTrigger className="w-40 bg-card">
                        <SelectValue placeholder="All design types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All design types</SelectItem>
                        {Object.entries(DESIGN_TYPE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => {
                            setStageFilter("all");
                            setPropertyTypeFilter("all");
                            setDesignTypeFilter("all");
                            setSearch("");
                        }}
                    >
                        Clear filters
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-x-auto bg-card shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Location</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Date Added</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Property Type</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Design Type</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Stage</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Last Activity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            [...Array(6)].map((_, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    {/* The same per-column visibility as the header
                                        and body rows. Without it the skeleton is a
                                        7-column table on a phone that forces a
                                        horizontal scrollbar, then reflows to 2
                                        columns the moment data lands. */}
                                    {SKELETON_COLUMNS.map((visibility, j) => (
                                        <td key={j} className={cn("px-4 py-3", visibility)}>
                                            <Skeleton className="h-4 w-full" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : leads.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-0">
                                    <Empty className="border-none py-14 md:py-14">
                                        <EmptyHeader>
                                            <EmptyMedia variant="icon">
                                                <User className="size-6" />
                                            </EmptyMedia>
                                            <EmptyTitle>
                                                {hasActiveFilters ? "No leads match your filters" : "No leads yet"}
                                            </EmptyTitle>
                                            <EmptyDescription>
                                                {hasActiveFilters
                                                    ? "Try a different search, or clear a filter."
                                                    : "New leads you add will show up here, ready to move through the pipeline."}
                                            </EmptyDescription>
                                        </EmptyHeader>
                                        {!hasActiveFilters && (
                                            <Button size="sm" onClick={() => setCreateOpen(true)}>
                                                <Plus className="w-3.5 h-3.5 mr-1" />Create your first lead
                                            </Button>
                                        )}
                                    </Empty>
                                </td>
                            </tr>
                        ) : (
                            leads.map((lead) => {
                                const daysOld = Math.floor(
                                    (now - new Date(lead.lastActivityAt).getTime()) / 86400000,
                                );
                                const isStale = daysOld >= 7 &&
                                    !["active_customer", "installation_complete", "cancelled"].includes(lead.stage);
                                return (
                                    <tr
                                        key={lead._id}
                                        className="border-b last:border-0 hover:bg-muted/25 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/leads/${lead._id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-foreground">{lead.firstName} {lead.lastName}</p>
                                            {isStale && (
                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                                    <AlertTriangle className="w-2.5 h-2.5" />No activity {daysOld}d
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                                            {lead.property ? `${lead.property.city}, ${lead.property.state}` : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell tabular-nums">
                                            {new Date(lead._creationTime).toLocaleDateString(undefined, {
                                                month: "short", day: "numeric", year: "numeric",
                                            })}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                                            {lead.property
                                                ? (PROPERTY_TYPE_LABELS[lead.property.propertyType] ?? lead.property.propertyType)
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                                            {(lead.designTypes ?? []).length > 0
                                                ? lead.designTypes.map((dt) => DESIGN_TYPE_LABELS[dt] ?? dt).join(", ")
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className={cn(STAGE_COLORS[lead.stage], "font-semibold")}>
                                                {STAGE_LABELS[lead.stage]}
                                            </Badge>
                                        </td>
                                        <td className={cn(
                                            "px-4 py-3 text-xs hidden md:table-cell",
                                            isStale ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground",
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
