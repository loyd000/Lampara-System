/**
 * PostgreSQL row shapes for the Lampara CRM schema (supabase/migrations).
 *
 * Hand-maintained to match the migrations. Regenerate any time the schema
 * changes rather than editing by hand:
 *
 *     npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 *
 * These are the *database* shapes (snake_case). The app works with the
 * camelCase document types in ./types.ts — the query layer maps between them.
 */

export type UserRole = "admin" | "sales" | "surveyor" | "installer" | "office";

export type LeadStage =
    | "lead"
    | "survey_scheduled"
    | "survey_completed"
    | "proposal_sent"
    | "contract_signed"
    | "permitting"
    | "installation_scheduled"
    | "installation_complete"
    | "active_customer";

export type LeadSource =
    | "referral"
    | "facebook_ad"
    | "website_form"
    | "walk_in"
    | "other";

export type PropertyType = "residential" | "commercial" | "agricultural";
export type SurveyStatus = "scheduled" | "completed" | "cancelled";
export type RoofType = "asphalt_shingle" | "metal" | "tile" | "flat" | "other";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded";
export type FinancingOption = "cash" | "loan" | "lease" | "ppa";
export type ContractStatus = "pending_signature" | "signed" | "cancelled";
export type PermitType =
    | "building_permit"
    | "electrical_permit"
    | "hoa_approval"
    | "utility_interconnection"
    | "other";
export type PermitStatus = "not_submitted" | "submitted" | "approved" | "rejected";
export type InstallationStatus = "scheduled" | "in_progress" | "completed" | "on_hold";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export type ChecklistItem = { item: string; checked: boolean };

type Timestamps = {
    created_at: string;
    updated_at: string;
};

export type UserRow = Timestamps & {
    id: string;
    name: string | null;
    email: string | null;
    role: UserRole;
    avatar_url: string | null;
    is_active: boolean;
};

export type LeadRow = Timestamps & {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    source: LeadSource;
    referred_by: string | null;
    stage: LeadStage;
    assigned_sales_rep_id: string | null;
    last_activity_at: string;
    converted_at: string | null;
    notes: string | null;
};

export type PropertyRow = Timestamps & {
    id: string;
    lead_id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    property_type: PropertyType;
    notes: string | null;
};

export type SurveyRow = Timestamps & {
    id: string;
    lead_id: string;
    property_id: string;
    assigned_surveyor_id: string;
    scheduled_at: string;
    completed_at: string | null;
    status: SurveyStatus;
    roof_type: RoofType | null;
    shading_notes: string | null;
    estimated_system_size_kw: number | null;
    roof_age_years: number | null;
    additional_notes: string | null;
    photo_paths: string[];
};

export type QuoteRow = Timestamps & {
    id: string;
    lead_id: string;
    version: number;
    status: QuoteStatus;
    panel_count: number;
    panel_model: string;
    inverter_type: string;
    system_size_kw: number;
    total_price_usd: number | string;
    financing_option: FinancingOption;
    valid_until: string | null;
    notes: string | null;
    created_by: string;
    sent_at: string | null;
};

export type ContractRow = Timestamps & {
    id: string;
    lead_id: string;
    quote_id: string;
    status: ContractStatus;
    signed_at: string | null;
    document_path: string | null;
    notes: string | null;
};

export type PermitRow = Timestamps & {
    id: string;
    lead_id: string;
    type: PermitType;
    status: PermitStatus;
    submitted_at: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    due_date: string | null;
    document_path: string | null;
    notes: string | null;
    assigned_to_id: string | null;
};

export type InstallationRow = Timestamps & {
    id: string;
    lead_id: string;
    status: InstallationStatus;
    scheduled_date: string;
    completed_at: string | null;
    assigned_crew_ids: string[];
    lead_installer_note: string | null;
    materials_checklist: ChecklistItem[];
    completion_photo_paths: string[];
    notes: string | null;
};

export type ServiceTicketRow = Timestamps & {
    id: string;
    lead_id: string;
    installation_id: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    assigned_to_id: string | null;
    resolved_at: string | null;
    scheduled_visit_at: string | null;
    warranty_related: boolean;
};

export type ActivityLogRow = {
    id: string;
    lead_id: string;
    user_id: string;
    action: string;
    details: string | null;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
};

/** Table name → row/insert/update triple, in the shape supabase-js expects. */
type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
    Row: Row;
    Insert: Insert;
    Update: Update;
    Relationships: [];
};

export type Database = {
    public: {
        Tables: {
            users: TableDef<UserRow>;
            leads: TableDef<LeadRow>;
            properties: TableDef<PropertyRow>;
            surveys: TableDef<SurveyRow>;
            quotes: TableDef<QuoteRow>;
            contracts: TableDef<ContractRow>;
            permits: TableDef<PermitRow>;
            installations: TableDef<InstallationRow>;
            service_tickets: TableDef<ServiceTicketRow>;
            activity_log: TableDef<ActivityLogRow>;
        };
        Views: Record<never, never>;
        Functions: {
            create_lead_with_property: {
                Args: {
                    p_first_name: string;
                    p_last_name: string;
                    p_phone: string;
                    p_source: LeadSource;
                    p_address: string;
                    p_city: string;
                    p_state: string;
                    p_zip: string;
                    p_property_type: PropertyType;
                    p_email?: string | null;
                    p_referred_by?: string | null;
                    p_notes?: string | null;
                    p_assigned_sales_rep_id?: string | null;
                };
                Returns: string;
            };
            create_quote: {
                Args: {
                    p_lead_id: string;
                    p_panel_count: number;
                    p_panel_model: string;
                    p_inverter_type: string;
                    p_system_size_kw: number;
                    p_total_price_usd: number;
                    p_financing_option: FinancingOption;
                    p_valid_until?: string | null;
                    p_notes?: string | null;
                };
                Returns: string;
            };
            revise_quote: {
                Args: { p_quote_id: string };
                Returns: string;
            };
            create_contract: {
                Args: { p_lead_id: string; p_quote_id: string; p_notes?: string | null };
                Returns: string;
            };
            // Each returns one jsonb object; the shape lives in queries/reports.ts.
            report_pipeline_summary: { Args: Record<never, never>; Returns: unknown };
            report_permits_summary: { Args: Record<never, never>; Returns: unknown };
            report_revenue_summary: { Args: Record<never, never>; Returns: unknown };
            report_installations_summary: { Args: Record<never, never>; Returns: unknown };
            log_lead_activity: {
                Args: {
                    p_lead_id: string;
                    p_action: string;
                    p_details?: string | null;
                    p_entity_type?: string | null;
                    p_entity_id?: string | null;
                    p_touch_lead?: boolean;
                };
                Returns: undefined;
            };
            /** Returns the previous stage, or null if nothing moved. */
            advance_lead_stage: {
                Args: {
                    p_lead_id: string;
                    p_stage: LeadStage;
                    p_only_from?: LeadStage[] | null;
                };
                Returns: LeadStage | null;
            };
            toggle_checklist_item: {
                Args: { p_installation_id: string; p_index: number };
                Returns: ChecklistItem[] | null;
            };
            add_checklist_item: {
                Args: { p_installation_id: string; p_item: string };
                Returns: ChecklistItem[] | null;
            };
            append_completion_photos: {
                Args: { p_installation_id: string; p_paths: string[] };
                Returns: string[] | null;
            };
        };
        Enums: Record<never, never>;
        CompositeTypes: Record<never, never>;
    };
};

/** Table names the app reads and writes. */
export type PublicTable = keyof Database["public"]["Tables"];
