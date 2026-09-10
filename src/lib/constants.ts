// ─── Company ──────────────────────────────────────────────────────────────
export const COMPANY_NAME = "Lampara";
export const COMPANY_TAGLINE = "Solar Installation CRM";

// ─── Site Ocular Inspection ───────────────────────────────────────────────
// What the business calls a site survey. The database, queries and hooks still
// say "survey" (table `surveys`, column `assigned_surveyor_id`) — this is the
// customer-facing wording, and every visible string routes through here so a
// future rename is one edit.
export const INSPECTION_LABEL = "Site Ocular Inspection";
export const INSPECTION_LABEL_SHORT = "Ocular Inspection";
export const INSPECTION_LABEL_PLURAL = "Site Ocular Inspections";

// ─── Pipeline Stages ──────────────────────────────────────────────────────
export type Stage = 
  | "lead"
  | "survey_scheduled"
  | "survey_completed"
  | "proposal_sent"
  | "contract_signed"
  | "permitting"
  | "installation_scheduled"
  | "installation_complete"
  | "active_customer"
  | "cancelled";

export const STAGES: Stage[] = [
  "lead",
  "survey_scheduled",
  "survey_completed",
  "proposal_sent",
  "contract_signed",
  "permitting",
  "installation_scheduled",
  "installation_complete",
  "active_customer",
  "cancelled",
];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "New Lead",
  // The stage *values* keep the old names — only the labels are rebranded.
  survey_scheduled: "Inspection Scheduled",
  survey_completed: "Inspection Done",
  proposal_sent: "Proposal Sent",
  contract_signed: "Contract Signed",
  permitting: "Permitting",
  installation_scheduled: "Install Scheduled",
  installation_complete: "Install Complete",
  active_customer: "Active Customer",
  cancelled: "Cancelled",
};

export const STAGE_COLORS: Record<Stage, string> = {
  lead: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  survey_scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  survey_completed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  proposal_sent: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  contract_signed: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  permitting: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  installation_scheduled: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  installation_complete: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  active_customer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

// ─── Stage Groups ─────────────────────────────────────────────────────────
// The three buckets the business actually thinks in. Nothing is stored
// twice — a lead's `stage` is still the one source of truth — this is only
// ever a lookup from that value to the group it belongs to, and back.
export type StageGroup = "new" | "in_progress" | "completed";

export const STAGE_GROUP_LABELS: Record<StageGroup, string> = {
  new: "New Lead",
  in_progress: "In Progress",
  completed: "Completed",
};

export const STAGE_GROUPS: Record<StageGroup, Stage[]> = {
  new: ["lead"],
  in_progress: [
    "survey_scheduled",
    "survey_completed",
    "proposal_sent",
    "contract_signed",
    "permitting",
    "installation_scheduled",
    "installation_complete",
  ],
  completed: ["active_customer", "cancelled"],
};

const STAGE_TO_GROUP: Record<Stage, StageGroup> = Object.fromEntries(
  Object.entries(STAGE_GROUPS).flatMap(([group, stages]) =>
    stages.map((stage) => [stage, group as StageGroup]),
  ),
) as Record<Stage, StageGroup>;

export function groupOf(stage: Stage): StageGroup {
  return STAGE_TO_GROUP[stage];
}

// ─── User Roles ───────────────────────────────────────────────────────────
// `field` replaces the old surveyor/installer pair — one person does both the
// site ocular inspection and the installation (0008_field_role.sql). `sales`
// and `office` both fold into `admin`, and `superadmin` sits above it — the
// only role that can approve accounts and change anyone else's role
// (0013_roles_and_approval.sql).
export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  field: "Technician",
};

// ─── Permit Types ─────────────────────────────────────────────────────────
export const PERMIT_TYPE_LABELS: Record<string, string> = {
  building_permit: "Building Permit",
  electrical_permit: "Electrical Permit",
  hoa_approval: "HOA Approval",
  utility_interconnection: "Utility Interconnection",
  other: "Other",
};

export const PERMIT_STATUS_LABELS: Record<string, string> = {
  not_submitted: "Not Submitted",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

// ─── Financing ────────────────────────────────────────────────────────────
export const FINANCING_LABELS: Record<string, string> = {
  cash: "Cash",
  loan: "Loan",
  lease: "Lease",
  ppa: "Power Purchase Agreement (PPA)",
};

// ─── Quote Statuses ───────────────────────────────────────────────────────
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

// ─── Installation Statuses ────────────────────────────────────────────────
export const INSTALLATION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

// ─── Service Ticket ───────────────────────────────────────────────────────
export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// ─── Property Types ───────────────────────────────────────────────────────
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

// ─── Package Design Types ─────────────────────────────────────────────────
export const DESIGN_TYPE_LABELS: Record<string, string> = {
  hybrid: "Hybrid",
  off_grid: "Off-Grid",
  grid_tie: "Grid-Tie",
};

// ─── Roof Types ───────────────────────────────────────────────────────────
export const ROOF_TYPE_LABELS: Record<string, string> = {
  asphalt_shingle: "Asphalt Shingle",
  metal: "Metal",
  tile: "Tile",
  flat: "Flat",
  other: "Other",
};

// ═══════════════════════════════════════════════════════════════════════════
// Site Ocular Report
//
// Every group below is a tick-box block on the printed form
// (public/Ocular report sample.pdf). The keys are the stored values; the labels
// are what the form prints, so the on-screen form and the PDF stay in step.
// ═══════════════════════════════════════════════════════════════════════════

// A survey is only ever `scheduled` or `cancelled` (0012). "completed" is not
// a stored status — it is `completed_at` being set (0028) — but it is a state
// the UI shows, so it has an entry here alongside the two real ones.
export const SURVEY_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const SURVEY_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

// ─── Client details ───────────────────────────────────────────────────────
export const USAGE_HABIT_LABELS: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  both: "Both",
};

// ─── Roof ─────────────────────────────────────────────────────────────────
export const SUPPORT_PURLIN_LABELS: Record<string, string> = {
  wood: "Wood",
  steel: "Steel",
  concrete: "Concrete",
};

export const ROOF_ACCESS_LABELS: Record<string, string> = {
  ladder: "Ladder",
  scaffolding: "Scaffolding",
  both: "Both",
};

export const MOUNTING_LABELS: Record<string, string> = {
  l_foot: "L-Foot",
  u_type: "U-Type",
  tegula: "Tegula",
  hanger_bolt: "Hanger Bolt",
};

export const ORIENTATION_LABELS: Record<string, string> = {
  north: "North",
  east: "East",
  west: "West",
  south: "South",
};

// ─── Electric meter ───────────────────────────────────────────────────────
export const METER_PHASE_LABELS: Record<string, string> = {
  single: "Single Phase",
  three: "Three Phase",
};

export const METER_KIND_LABELS: Record<string, string> = {
  main: "Main Meter",
  sub: "Sub-Meter",
};

export const METER_FORM_LABELS: Record<string, string> = {
  round: "Round",
  st5_7: "ST5/7",
  ct_rated: "CT Rated",
};

// ─── Panel / network ──────────────────────────────────────────────────────
export const CONNECTION_TYPE_LABELS: Record<string, string> = {
  gprs: "GPRS (Cellular)",
  wifi: "WiFi",
};

// ─── System package ───────────────────────────────────────────────────────
export const SYSTEM_CAPACITY_LABELS: Record<string, string> = {
  "3kwp": "3kWp",
  "6kwp": "6kWp",
  "8kwp": "8kWp",
  "12kwp": "12kWp",
  "16kwp": "16kWp",
};

/** kWp per capacity option, so the quote's system size can be pre-filled. */
export const SYSTEM_CAPACITY_KW: Record<string, number> = {
  "3kwp": 3,
  "6kwp": 6,
  "8kwp": 8,
  "12kwp": 12,
  "16kwp": 16,
};

export const PACKAGE_TYPE_LABELS: Record<string, string> = {
  with_battery: "W/ Battery",
  no_battery: "No Battery",
};

export const BATTERY_OPTION_LABELS: Record<string, string> = {
  "100ah_5kwh": "100Ah 5kWh",
  "314ah_16kwh": "16kWh 314Ah",
};

export const PANEL_OPTION_LABELS: Record<string, string> = {
  "610_630wp": "610 – 630Wp",
  "710_730wp": "710 – 730Wp",
};

// ─── Photo slots ──────────────────────────────────────────────────────────
// Ordered as the report prints them. `max` is a soft cap the uploader enforces
// so a three-panel row on the page does not arrive with nine photos in it.
export type PhotoSlot = {
  key: string;
  label: string;
  hint?: string;
  max: number;
};

export const SURVEY_PHOTO_SLOTS: PhotoSlot[] = [
  { key: "building_front", label: "Building Front View", max: 3 },
  {
    key: "roof_view",
    label: "Roof View",
    hint: "Drone shot or Google Earth",
    max: 3,
  },
  { key: "meralco_meter", label: "Meralco Meter", hint: "Main panel board", max: 2 },
  {
    key: "main_circuit_breaker",
    label: "Main Circuit Breaker",
    hint: "Main panel board",
    max: 2,
  },
  { key: "meralco_bill", label: "Meralco Bill", hint: "Main panel board", max: 2 },
  { key: "roof_panel_design", label: "Roof With Panel Design", max: 2 },
  {
    key: "inverter_battery",
    label: "Inverter & Battery Location",
    hint: "With or without battery",
    max: 3,
  },
  {
    key: "dc_conduit",
    label: "DC Conduit Lines",
    hint: "From PV modules to inverter",
    max: 3,
  },
  {
    key: "ac_conduit",
    label: "AC Conduit Lines",
    hint: "Inverter to solar disconnect to service disconnect",
    max: 3,
  },
  { key: "other", label: "Other Photos", max: 12 },
];
