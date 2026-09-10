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

export type UserRole = "superadmin" | "admin" | "field";

export type LeadStage =
    | "lead"
    | "survey_scheduled"
    | "survey_completed"
    | "proposal_sent"
    | "contract_signed"
    | "installation_scheduled"
    | "installation_complete"
    | "active_customer"
    | "cancelled";

export type PropertyType = "residential" | "commercial" | "industrial";

/**
 * Only two states, and it has been that way since 0012 removed the
 * submit/approve handoff — the CHECK constraint permits nothing else.
 * "Finished" is `completed_at`, not a status (see 0028).
 *
 * This used to also list "submitted" and "approved". A type that claims values
 * the database rejects is not a harmless leftover: the revenue report was
 * written against exactly that kind of stale union in `QuoteStatus` below,
 * filtered on statuses that could never match, and silently reported ₱0 (0027).
 */
export type SurveyStatus = "scheduled" | "cancelled";

// ─── Site Ocular Report enumerations ──────────────────────────────────────
// Every one of these mirrors a tick-box group on the printed form
// (public/Ocular report sample.pdf).
export type UsageHabit = "morning" | "evening" | "both";
export type SupportPurlin = "wood" | "steel" | "concrete";
export type RoofAccess = "ladder" | "scaffolding" | "both";
export type MountingType = "l_foot" | "u_type" | "tegula" | "hanger_bolt";
export type RoofOrientation = "north" | "east" | "west" | "south";
export type MeterPhase = "single" | "three";
export type MeterKind = "main" | "sub";
export type MeterForm = "round" | "st5_7" | "ct_rated";
export type ConnectionType = "gprs" | "wifi";
export type SystemCapacity = "3kwp" | "6kwp" | "8kwp" | "12kwp" | "16kwp";
export type PackageType = "with_battery" | "no_battery";
export type BatteryOption = "100ah_5kwh" | "314ah_16kwh";
export type PanelOption = "610_630wp" | "710_730wp";

/** The headed photo slots on the report, in the order they are printed. */
export type SurveyPhotoCategory =
    | "building_front"
    | "roof_view"
    | "meralco_meter"
    | "main_circuit_breaker"
    | "meralco_bill"
    | "roof_panel_design"
    | "inverter_battery"
    | "dc_conduit"
    | "ac_conduit"
    | "other";
export type RoofType = "asphalt_shingle" | "metal" | "tile" | "flat" | "other";
/**
 * Two states only — the CHECK constraint permits nothing else.
 *
 * It previously also listed "draft", "sent", "accepted", "rejected" and
 * "superseded" from the original 0001 schema. That is not cosmetic: the
 * revenue report filtered on `status in ('accepted','sent')`, which
 * typechecked cleanly against the stale union while matching zero rows
 * forever, and the Reports page showed ₱0 until 0027 caught it.
 */
export type QuoteStatus = "in_progress" | "approved";
export type FinancingOption = "cash" | "loan" | "lease" | "ppa";
export type ContractStatus = "pending_signature" | "signed" | "cancelled";
export type InstallationStatus = "scheduled" | "in_progress" | "completed" | "on_hold";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export type ChecklistItem = { item: string; checked: boolean };

// ─── Packages (Phase 5) ───────────────────────────────────────────────────

/** How a package is wired — independent of `PackageType` (survey battery option). */
export type PackageDesignType = "hybrid" | "off_grid" | "grid_tie";

export type PackageRow = Timestamps & {
    id: string;
    name: string;
    description: string | null;
    system_size_kw: number | string | null;
    base_price_php: number | string;
    design_type: PackageDesignType;
    is_active: boolean;
    sort_order: number;
    created_by: string | null;
};

export type PackageItemRow = {
    id: string;
    package_id: string;
    name?: string | null;
    description: string;
    qty: number | string;
    unit: string;
    unit_price_php: number | string;
    sort_order: number;
    created_at: string;
};

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
    /** Null until the first time a superadmin lets this account in. */
    approved_at: string | null;
    approved_by: string | null;
};

export type LeadRow = Timestamps & {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    referred_by: string | null;
    stage: LeadStage;
    assigned_sales_rep_id: string | null;
    last_activity_at: string;
    converted_at: string | null;
    notes: string | null;
    cancelled_reason: string | null;
    cancelled_at: string | null;
    /**
     * Generated column (0026): name + email + phone concatenated, trigram
     * indexed. Read by `searchLeads`'s filter, never written or mapped onto
     * the document type — Postgres maintains it.
     */
    search_text: string;
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
    // Granular Philippine address fields — nullable; pre-existing rows have
    // none, and address/city/state/zip above stay the composed source of
    // truth every other consumer (PDF, contract, Overview) already reads.
    house_unit_block_lot: string | null;
    street_name: string | null;
    subdivision: string | null;
    barangay: string | null;
    city_municipality: string | null;
    province: string | null;
    zip_code: string | null;
    /** Generated column (0026): the composed address fields, trigram indexed. */
    search_text: string;
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
    /** Superseded by survey_photos (0009); still read for old rows. */
    photo_paths: string[];

    // ─── Site Ocular Report (0009) ────────────────────────────────────────
    inspection_date: string | null;
    latitude: number | null;
    longitude: number | null;
    usage_habit: UsageHabit | null;
    // numeric() can arrive as a string depending on the PostgREST build.
    monthly_consumption_kwh: number | string | null;
    monthly_bill_php: number | string | null;

    appliance_aircon: boolean;
    appliance_aircon_note: string | null;
    appliance_tv: boolean;
    appliance_tv_note: string | null;
    appliance_ref: boolean;
    appliance_ref_note: string | null;
    appliance_washer: boolean;
    appliance_washer_note: string | null;
    appliance_others: string | null;
    recommended_vehicle: string | null;

    roof_type_note: string | null;
    support_purlins: SupportPurlin[];
    roof_area_sqm: number | string | null;
    roof_width_m: number | string | null;
    roof_length_m: number | string | null;
    roof_access: RoofAccess | null;
    mounting: MountingType[];
    roof_orientation: RoofOrientation[];
    est_dc_run_m: number | string | null;
    est_ac_run_m: number | string | null;

    meter_phase: MeterPhase | null;
    transformer_count: number | null;
    meter_kind: MeterKind | null;
    meter_form: MeterForm | null;
    service_disconnect: boolean | null;
    service_disconnect_rating: string | null;

    grounding: boolean | null;
    main_distribution_panel: string | null;
    cb_size_rating: string | null;
    wire_size: string | null;
    connection_type: ConnectionType | null;
    floor_count: number | null;

    system_capacity: SystemCapacity | null;
    package_type: PackageType | null;
    battery_option: BatteryOption | null;
    panel_option: PanelOption | null;
    report_notes: string | null;
    // The submit/approve handoff's bookkeeping columns lived here until 0029.
    // An inspection is finished when `completed_at` is set (0028); there is no
    // approver, because there is no approval step.
};

export type SurveyPhotoRow = {
    id: string;
    survey_id: string;
    category: SurveyPhotoCategory;
    path: string;
    caption: string | null;
    sort_order: number;
    created_by: string | null;
    created_at: string;
};

export type QuoteRow = Timestamps & {
    id: string;
    lead_id: string;
    version: number;
    status: QuoteStatus;
    total_php: number | string;
    quotation_no: string;
    prepared_by_id: string | null;
    panel_count?: number | null;
    panel_model?: string | null;
    inverter_type?: string | null;
    system_size_kw?: number | null;
    financing_option?: FinancingOption | null;
    valid_until: string | null;
    notes: string | null;
    created_by: string;
    sent_at: string | null;
};

export type QuoteItemRow = Timestamps & {
    id: string;
    quote_id: string;
    description: string;
    qty: number | string;
    unit: string;
    unit_price_php: number | string;
    line_total_php: number | string;
    source_package_id: string | null;
    sort_order: number;
};

export type ContractRow = Timestamps & {
    id: string;
    lead_id: string;
    quote_id: string;
    status: ContractStatus;
    signed_at: string | null;
    document_path: string | null;
    notes: string | null;
    homeowner_name: string | null;
    site_address: string | null;
    phone_number: string | null;
    system_size_kw: number | string | null;
    panel_line: string | null;
    inverter_line: string | null;
    battery_line: string | null;
    price_php: number | string | null;
    prepared_by_name: string | null;
    contract_date: string | null;
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
    /** Generated column (0026): title + description, trigram indexed. */
    search_text: string;
};

/** Overview attachments: `photo` lives in the photos bucket, `document` in documents. */
export type LeadFileKind = "photo" | "document";

export type LeadNoteRow = Timestamps & {
    id: string;
    lead_id: string;
    /** Null once the author's account has been deleted; the note survives. */
    author_id: string | null;
    body: string;
};

export type LeadFileRow = {
    id: string;
    lead_id: string;
    /** Object path under the `leads/<lead_id>/` prefix of the bucket `kind` picks. */
    path: string;
    /** The name the uploader saw. `path` is uuid-prefixed and not showable. */
    name: string;
    mime: string;
    size_bytes: number;
    kind: LeadFileKind;
    uploaded_by: string | null;
    created_at: string;
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

export type NotificationPreferencesRow = {
    user_id: string;
    lead_assigned: boolean;
    inspection_scheduled: boolean;
    installation_scheduled: boolean;
    quote_accepted: boolean;
    contract_signed: boolean;
    updated_at: string;
};

export type NotificationEvent =
    | "lead_assigned"
    | "inspection_scheduled"
    | "installation_scheduled"
    | "quote_accepted"
    | "contract_signed";

export type NotificationStatus = "sent" | "skipped" | "failed";

export type NotificationLogRow = {
    id: string;
    event: NotificationEvent;
    lead_id: string | null;
    recipient_user_id: string | null;
    status: NotificationStatus;
    error: string | null;
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
            survey_photos: TableDef<SurveyPhotoRow>;
            lead_notes: TableDef<LeadNoteRow>;
            lead_files: TableDef<LeadFileRow>;
            quotes: TableDef<QuoteRow>;
            quote_items: TableDef<QuoteItemRow>;
            contracts: TableDef<ContractRow>;
            installations: TableDef<InstallationRow>;
            service_tickets: TableDef<ServiceTicketRow>;
            packages: TableDef<PackageRow>;
            package_items: TableDef<PackageItemRow>;
            activity_log: TableDef<ActivityLogRow>;
            notification_preferences: TableDef<NotificationPreferencesRow>;
            notification_log: TableDef<NotificationLogRow>;
        };
        Views: Record<never, never>;
        Functions: {
            create_lead_with_property: {
                Args: {
                    p_first_name: string;
                    p_last_name: string;
                    p_phone: string;
                    p_address: string;
                    p_city: string;
                    p_state: string;
                    p_zip: string;
                    p_property_type: PropertyType;
                    p_email?: string | null;
                    p_referred_by?: string | null;
                    p_notes?: string | null;
                    p_assigned_sales_rep_id?: string | null;
                    p_house_unit_block_lot?: string | null;
                    p_street_name?: string | null;
                    p_subdivision?: string | null;
                    p_barangay?: string | null;
                    p_city_municipality?: string | null;
                    p_province?: string | null;
                    p_zip_code?: string | null;
                };
                Returns: string;
            };
            // `create_quote` and `revise_quote` were dropped in 0029 — both
            // uncalled, and `revise_quote` could not have worked anyway: it set
            // statuses the CHECK constraint stopped permitting. The client
            // creates and revises quotes directly (see queries/quotes.ts), so
            // it can allocate the version and quotation number.
            create_contract: {
                Args: { p_lead_id: string; p_quote_id: string; p_notes?: string | null };
                Returns: string;
            };
            update_contract_details: {
                Args: {
                    p_contract_id: string;
                    p_homeowner_name: string;
                    p_site_address: string;
                    p_phone_number: string;
                    p_system_size_kw: number | null;
                    p_panel_line: string;
                    p_inverter_line: string;
                    p_battery_line: string;
                    p_price_php: number | null;
                    p_prepared_by_name: string;
                    p_contract_date: string | null;
                };
                Returns: undefined;
            };
            // Each returns one jsonb object; the shape lives in queries/reports.ts.
            report_pipeline_summary: { Args: Record<never, never>; Returns: unknown };
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
                    p_cancelled_reason?: string | null;
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
            append_survey_photos: {
                Args: { p_survey_id: string; p_paths: string[] };
                Returns: string[] | null;
            };
            can_edit_survey: {
                Args: { p_survey_id: string };
                Returns: boolean;
            };
            complete_survey_report: {
                Args: { p_survey_id: string };
                Returns: undefined;
            };
            reopen_survey_report: {
                Args: { p_survey_id: string };
                Returns: undefined;
            };
        };
        Enums: Record<never, never>;
        CompositeTypes: Record<never, never>;
    };
};

/** Table names the app reads and writes. */
export type PublicTable = keyof Database["public"]["Tables"];
