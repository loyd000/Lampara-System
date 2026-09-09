/**
 * Application document types — the camelCase, `_id`-bearing shapes the UI works
 * with. Replaces `@/convex/_generated/dataModel`.
 *
 * The database is snake_case (see ./database.types.ts); every query in
 * ./queries/* maps rows through the `to*` functions below before handing them to
 * React. Keeping the old document shape means the components' field references,
 * `Doc<"leads">` annotations and `as Id<"users">` casts all still apply.
 *
 * `_creationTime` stays a millisecond epoch, as Convex had it, so existing
 * `new Date(log._creationTime)` calls keep working.
 */

import type {
    ActivityLogRow,
    BatteryOption,
    ConnectionType,
    ChecklistItem,
    ContractRow,
    ContractStatus,
    FinancingOption,
    InstallationRow,
    InstallationStatus,
    LeadFileKind,
    LeadFileRow,
    LeadNoteRow,
    LeadRow,
    LeadSource,
    LeadStage,
    PermitRow,
    PermitStatus,
    MeterForm,
    MeterKind,
    MeterPhase,
    MountingType,
    PackageType,
    PanelOption,
    PermitType,
    PropertyRow,
    PropertyType,
    QuoteRow,
    QuoteStatus,
    RoofAccess,
    RoofOrientation,
    RoofType,
    ServiceTicketRow,
    SupportPurlin,
    SystemCapacity,
    SurveyPhotoCategory,
    SurveyPhotoRow,
    SurveyRow,
    SurveyStatus,
    TicketPriority,
    TicketStatus,
    UsageHabit,
    UserRole,
    UserRow,
} from "./database.types.ts";

export type {
    BatteryOption,
    ChecklistItem,
    ConnectionType,
    ContractStatus,
    FinancingOption,
    InstallationStatus,
    LeadFileKind,
    LeadSource,
    LeadStage,
    MeterForm,
    MeterKind,
    MeterPhase,
    MountingType,
    PackageType,
    PanelOption,
    PermitStatus,
    PermitType,
    PropertyType,
    QuoteStatus,
    RoofAccess,
    RoofOrientation,
    RoofType,
    SupportPurlin,
    SurveyPhotoCategory,
    SurveyStatus,
    SystemCapacity,
    UsageHabit,
    TicketPriority,
    TicketStatus,
    UserRole,
};

export type TableNames =
    | "users"
    | "leads"
    | "properties"
    | "surveys"
    | "quotes"
    | "contracts"
    | "permits"
    | "installations"
    | "serviceTickets"
    | "activityLog"
    | "leadNotes"
    | "leadFiles";

/**
 * A row identifier.
 *
 * Convex used a branded string here. Postgres ids are plain uuids, and keeping
 * this a bare `string` means the `as Id<"users">` casts already scattered
 * through the components stay valid while plain strings (select values, route
 * params) flow in without ceremony.
 */
export type Id<T extends TableNames = TableNames> = string;

type Base = {
    _id: string;
    _creationTime: number;
};

export type User = Base & {
    name?: string;
    email?: string;
    role: UserRole;
    avatarUrl?: string;
    isActive: boolean;
    /** Undefined until a superadmin has approved this account at least once. */
    approvedAt?: string;
    approvedById?: string;
};

export type Lead = Base & {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    source: LeadSource;
    referredBy?: string;
    stage: LeadStage;
    assignedSalesRepId?: string;
    lastActivityAt: string;
    convertedAt?: string;
    notes?: string;
    cancelledReason?: string;
    cancelledAt?: string;
};

export type Property = Base & {
    leadId: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    propertyType: PropertyType;
    notes?: string;
};

/**
 * A site ocular inspection: the appointment plus the report filled on site.
 *
 * The report fields mirror the printed form one for one
 * (public/Ocular report sample.pdf) and are all optional — a technician fills
 * it across a visit, not in one submit.
 */
export type Survey = Base & {
    leadId: string;
    propertyId: string;
    assignedSurveyorId: string;
    scheduledAt: string;
    completedAt?: string;
    status: SurveyStatus;
    roofType?: RoofType;
    shadingNotes?: string;
    estimatedSystemSizeKw?: number;
    roofAgeYears?: number;
    additionalNotes?: string;
    /** Superseded by `photos`; still populated for pre-0009 rows. */
    photoPaths: string[];

    // ── Client details ───────────────────────────────────────────────────
    inspectionDate?: string;
    latitude?: number;
    longitude?: number;
    usageHabit?: UsageHabit;
    monthlyConsumptionKwh?: number;
    monthlyBillPhp?: number;
    applianceAircon: boolean;
    applianceAirconNote?: string;
    applianceTv: boolean;
    applianceTvNote?: string;
    applianceRef: boolean;
    applianceRefNote?: string;
    applianceWasher: boolean;
    applianceWasherNote?: string;
    applianceOthers?: string;
    /** "Recommended vehicle (Carabao, Tamaraw)" on the printed form. */
    recommendedVehicle?: string;

    // ── Roof ─────────────────────────────────────────────────────────────
    roofTypeNote?: string;
    supportPurlins: SupportPurlin[];
    roofAreaSqm?: number;
    roofWidthM?: number;
    roofLengthM?: number;
    roofAccess?: RoofAccess;
    mounting: MountingType[];
    roofOrientation: RoofOrientation[];
    estDcRunM?: number;
    estAcRunM?: number;

    // ── Electric meter ───────────────────────────────────────────────────
    meterPhase?: MeterPhase;
    transformerCount?: number;
    meterKind?: MeterKind;
    meterForm?: MeterForm;
    serviceDisconnect?: boolean;
    serviceDisconnectRating?: string;

    // ── Panel / network ──────────────────────────────────────────────────
    grounding?: boolean;
    mainDistributionPanel?: string;
    cbSizeRating?: string;
    wireSize?: string;
    connectionType?: ConnectionType;
    floorCount?: number;

    // ── System package ───────────────────────────────────────────────────
    systemCapacity?: SystemCapacity;
    packageType?: PackageType;
    batteryOption?: BatteryOption;
    panelOption?: PanelOption;
    reportNotes?: string;

    // ── Sign-off ─────────────────────────────────────────────────────────
    preparedById?: string;
    preparedAt?: string;
    approvedById?: string;
    approvedAt?: string;
};

/** One photo in one slot of the report. `url` is a short-lived signed URL. */
export type SurveyPhoto = {
    _id: string;
    surveyId: string;
    category: SurveyPhotoCategory;
    path: string;
    caption?: string;
    sortOrder: number;
    url: string | null;
};

export type Quote = Base & {
    leadId: string;
    version: number;
    status: QuoteStatus;
    panelCount: number;
    panelModel: string;
    inverterType: string;
    systemSizeKw: number;
    totalPriceUsd: number;
    financingOption: FinancingOption;
    validUntil?: string;
    notes?: string;
    createdBy: string;
    sentAt?: string;
};

export type Contract = Base & {
    leadId: string;
    quoteId: string;
    status: ContractStatus;
    signedAt?: string;
    documentPath?: string;
    notes?: string;
};

export type Permit = Base & {
    leadId: string;
    type: PermitType;
    status: PermitStatus;
    submittedAt?: string;
    approvedAt?: string;
    rejectedAt?: string;
    dueDate?: string;
    documentPath?: string;
    notes?: string;
    assignedToId?: string;
};

export type Installation = Base & {
    leadId: string;
    status: InstallationStatus;
    scheduledDate: string;
    completedAt?: string;
    assignedCrewIds: string[];
    leadInstallerNote?: string;
    materialsChecklist: ChecklistItem[];
    completionPhotoPaths: string[];
    notes?: string;
};

export type ServiceTicket = Base & {
    leadId: string;
    installationId: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    assignedToId?: string;
    resolvedAt?: string;
    scheduledVisitAt?: string;
    warrantyRelated: boolean;
};

/**
 * A note somebody chose to write about this lead.
 *
 * Deliberately not an `activity_log` row: the log is the system's own account
 * of what happened and stays machine-written, while this is prose. `updatedAt`
 * differing from `_creationTime` is what marks a note as edited.
 */
export type LeadNote = Base & {
    leadId: string;
    authorId?: string;
    body: string;
    updatedAt: string;
};

/** A photo or document attached to the lead itself (not to a report). */
export type LeadFile = Base & {
    leadId: string;
    path: string;
    name: string;
    mime: string;
    sizeBytes: number;
    kind: LeadFileKind;
    uploadedById?: string;
};

export type ActivityLogEntry = Base & {
    leadId: string;
    userId: string;
    action: string;
    details?: string;
    entityType?: string;
    entityId?: string;
};

/** Convex-compatible document lookup: `Doc<"leads">`, `Doc<"users">`, … */
export type Doc<T extends TableNames> = T extends "users"
    ? User
    : T extends "leads"
      ? Lead
      : T extends "properties"
        ? Property
        : T extends "surveys"
          ? Survey
          : T extends "quotes"
            ? Quote
            : T extends "contracts"
              ? Contract
              : T extends "permits"
                ? Permit
                : T extends "installations"
                  ? Installation
                  : T extends "serviceTickets"
                    ? ServiceTicket
                    : T extends "activityLog"
                      ? ActivityLogEntry
                      : T extends "leadNotes"
                        ? LeadNote
                        : T extends "leadFiles"
                          ? LeadFile
                          : never;

// ─── Enriched shapes returned by the query layer ──────────────────────────

export type EnrichedLead = Lead & {
    assignedRepName: string | null;
    property: { address: string; city: string; state: string } | null;
};

export type LeadDetail = Lead & { assignedRepName: string | null };

export type ActivityEntry = ActivityLogEntry & { userName: string };

export type LeadNoteEntry = LeadNote & {
    authorName: string;
    /** True when the signed-in user wrote it, so the UI can offer Edit. */
    isOwn: boolean;
    /** True when this note has been changed since it was posted. */
    edited: boolean;
};

/**
 * One row of the Overview's file list.
 *
 * The list is a **view over two tables**: files attached to the lead, and the
 * photos already uploaded against its ocular inspections. Report photos are
 * listed here, never copied here — one object, two places it is shown — which
 * is why an entry carries where it came from and whether this screen is
 * allowed to remove it.
 */
export type LeadFileEntry = {
    _id: string;
    _creationTime: number;
    kind: LeadFileKind;
    name: string;
    mime: string | null;
    /** Null for report photos, which were stored before size was recorded. */
    sizeBytes: number | null;
    path: string;
    bucket: "photos" | "documents";
    /** Short-lived signed URL, or null if the object could not be signed. */
    url: string | null;
    source: "lead" | "inspection";
    /** The report slot an inspection photo fills ("Roof View"); null otherwise. */
    sourceLabel: string | null;
    uploadedByName: string | null;
    /** Report photos are managed on the report, not from the Overview. */
    removable: boolean;
};

export type SurveyForLead = Survey & {
    surveyorName: string;
    preparedByName: string | null;
    approvedByName: string | null;
    photos: SurveyPhoto[];
    /** Legacy flat gallery — pre-0009 photos that have no slot. */
    photoUrls: string[];
};

export type SurveyForSurveyor = Survey & {
    leadName: string;
    address: string | null;
    surveyorName: string;
};

export type QuoteWithCreator = Quote & { createdByName: string };

export type ContractDetail = Contract & {
    documentUrl: string | null;
    quoteVersion: number | null;
};

export type PermitDetail = Permit & {
    documentUrl: string | null;
    assignedToName: string | null;
};

export type InstallationDetail = Installation & {
    crewNames: { id: string; name: string }[];
    photoUrls: string[];
};

export type InstallationForInstaller = Installation & {
    customerName: string;
    address: string | null;
};

export type ServiceTicketDetail = ServiceTicket & { assignedToName: string | null };

export type ServiceTicketWithCustomer = ServiceTicket & { customerName: string };

// ─── Row → document mappers ───────────────────────────────────────────────

/** `null` columns become `undefined`, matching Convex's optional fields. */
function opt<T>(value: T | null | undefined): T | undefined {
    return value ?? undefined;
}

/** numeric() columns arrive as a string on some PostgREST builds. */
function num(value: number | string | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function base(row: { id: string; created_at: string }): Base {
    return { _id: row.id, _creationTime: Date.parse(row.created_at) };
}

export function toUser(row: UserRow): User {
    return {
        ...base(row),
        name: opt(row.name),
        email: opt(row.email),
        role: row.role,
        avatarUrl: opt(row.avatar_url),
        isActive: row.is_active,
        approvedAt: opt(row.approved_at),
        approvedById: opt(row.approved_by),
    };
}

export function toLead(row: LeadRow): Lead {
    return {
        ...base(row),
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        email: opt(row.email),
        source: row.source,
        referredBy: opt(row.referred_by),
        stage: row.stage,
        assignedSalesRepId: opt(row.assigned_sales_rep_id),
        lastActivityAt: row.last_activity_at,
        convertedAt: opt(row.converted_at),
        notes: opt(row.notes),
        cancelledReason: opt(row.cancelled_reason),
        cancelledAt: opt(row.cancelled_at),
    };
}

export function toProperty(row: PropertyRow): Property {
    return {
        ...base(row),
        leadId: row.lead_id,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        propertyType: row.property_type,
        notes: opt(row.notes),
    };
}

export function toSurvey(row: SurveyRow): Survey {
    return {
        ...base(row),
        leadId: row.lead_id,
        propertyId: row.property_id,
        assignedSurveyorId: row.assigned_surveyor_id,
        scheduledAt: row.scheduled_at,
        completedAt: opt(row.completed_at),
        status: row.status,
        roofType: opt(row.roof_type),
        shadingNotes: opt(row.shading_notes),
        estimatedSystemSizeKw: opt(row.estimated_system_size_kw),
        roofAgeYears: opt(row.roof_age_years),
        additionalNotes: opt(row.additional_notes),
        photoPaths: row.photo_paths ?? [],

        inspectionDate: opt(row.inspection_date),
        latitude: opt(row.latitude),
        longitude: opt(row.longitude),
        usageHabit: opt(row.usage_habit),
        monthlyConsumptionKwh: num(row.monthly_consumption_kwh),
        monthlyBillPhp: num(row.monthly_bill_php),
        applianceAircon: row.appliance_aircon ?? false,
        applianceAirconNote: opt(row.appliance_aircon_note),
        applianceTv: row.appliance_tv ?? false,
        applianceTvNote: opt(row.appliance_tv_note),
        applianceRef: row.appliance_ref ?? false,
        applianceRefNote: opt(row.appliance_ref_note),
        applianceWasher: row.appliance_washer ?? false,
        applianceWasherNote: opt(row.appliance_washer_note),
        applianceOthers: opt(row.appliance_others),
        recommendedVehicle: opt(row.recommended_vehicle),

        roofTypeNote: opt(row.roof_type_note),
        supportPurlins: row.support_purlins ?? [],
        roofAreaSqm: num(row.roof_area_sqm),
        roofWidthM: num(row.roof_width_m),
        roofLengthM: num(row.roof_length_m),
        roofAccess: opt(row.roof_access),
        mounting: row.mounting ?? [],
        roofOrientation: row.roof_orientation ?? [],
        estDcRunM: num(row.est_dc_run_m),
        estAcRunM: num(row.est_ac_run_m),

        meterPhase: opt(row.meter_phase),
        transformerCount: opt(row.transformer_count),
        meterKind: opt(row.meter_kind),
        meterForm: opt(row.meter_form),
        serviceDisconnect: opt(row.service_disconnect),
        serviceDisconnectRating: opt(row.service_disconnect_rating),

        grounding: opt(row.grounding),
        mainDistributionPanel: opt(row.main_distribution_panel),
        cbSizeRating: opt(row.cb_size_rating),
        wireSize: opt(row.wire_size),
        connectionType: opt(row.connection_type),
        floorCount: opt(row.floor_count),

        systemCapacity: opt(row.system_capacity),
        packageType: opt(row.package_type),
        batteryOption: opt(row.battery_option),
        panelOption: opt(row.panel_option),
        reportNotes: opt(row.report_notes),

        preparedById: opt(row.prepared_by_id),
        preparedAt: opt(row.prepared_at),
        approvedById: opt(row.approved_by_id),
        approvedAt: opt(row.approved_at),
    };
}

export function toSurveyPhoto(row: SurveyPhotoRow, url: string | null): SurveyPhoto {
    return {
        _id: row.id,
        surveyId: row.survey_id,
        category: row.category,
        path: row.path,
        caption: opt(row.caption),
        sortOrder: row.sort_order,
        url,
    };
}

export function toQuote(row: QuoteRow): Quote {
    return {
        ...base(row),
        leadId: row.lead_id,
        version: row.version,
        status: row.status,
        panelCount: row.panel_count,
        panelModel: row.panel_model,
        inverterType: row.inverter_type,
        systemSizeKw: Number(row.system_size_kw),
        // numeric(12,2) can arrive as a string depending on the PostgREST build.
        totalPriceUsd: Number(row.total_price_usd),
        financingOption: row.financing_option,
        validUntil: opt(row.valid_until),
        notes: opt(row.notes),
        createdBy: row.created_by,
        sentAt: opt(row.sent_at),
    };
}

export function toContract(row: ContractRow): Contract {
    return {
        ...base(row),
        leadId: row.lead_id,
        quoteId: row.quote_id,
        status: row.status,
        signedAt: opt(row.signed_at),
        documentPath: opt(row.document_path),
        notes: opt(row.notes),
    };
}

export function toPermit(row: PermitRow): Permit {
    return {
        ...base(row),
        leadId: row.lead_id,
        type: row.type,
        status: row.status,
        submittedAt: opt(row.submitted_at),
        approvedAt: opt(row.approved_at),
        rejectedAt: opt(row.rejected_at),
        dueDate: opt(row.due_date),
        documentPath: opt(row.document_path),
        notes: opt(row.notes),
        assignedToId: opt(row.assigned_to_id),
    };
}

export function toInstallation(row: InstallationRow): Installation {
    return {
        ...base(row),
        leadId: row.lead_id,
        status: row.status,
        scheduledDate: row.scheduled_date,
        completedAt: opt(row.completed_at),
        assignedCrewIds: row.assigned_crew_ids ?? [],
        leadInstallerNote: opt(row.lead_installer_note),
        materialsChecklist: row.materials_checklist ?? [],
        completionPhotoPaths: row.completion_photo_paths ?? [],
        notes: opt(row.notes),
    };
}

export function toServiceTicket(row: ServiceTicketRow): ServiceTicket {
    return {
        ...base(row),
        leadId: row.lead_id,
        installationId: row.installation_id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        assignedToId: opt(row.assigned_to_id),
        resolvedAt: opt(row.resolved_at),
        scheduledVisitAt: opt(row.scheduled_visit_at),
        warrantyRelated: row.warranty_related,
    };
}

export function toLeadNote(row: LeadNoteRow): LeadNote {
    return {
        ...base(row),
        leadId: row.lead_id,
        authorId: opt(row.author_id),
        body: row.body,
        updatedAt: row.updated_at,
    };
}

export function toLeadFile(row: LeadFileRow): LeadFile {
    return {
        ...base(row),
        leadId: row.lead_id,
        path: row.path,
        name: row.name,
        mime: row.mime,
        sizeBytes: Number(row.size_bytes),
        kind: row.kind,
        uploadedById: opt(row.uploaded_by),
    };
}

export function toActivityLogEntry(row: ActivityLogRow): ActivityLogEntry {
    return {
        ...base(row),
        leadId: row.lead_id,
        userId: row.user_id,
        action: row.action,
        details: opt(row.details),
        entityType: opt(row.entity_type),
        entityId: opt(row.entity_id),
    };
}

/** Display name for a user row, falling back the way the Convex queries did. */
export function displayName(
    user: { name?: string | null; email?: string | null } | null | undefined,
    fallback = "Unknown",
): string {
    return user?.name ?? user?.email ?? fallback;
}
