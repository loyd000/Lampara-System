// ─── Company ──────────────────────────────────────────────────────────────
export const COMPANY_NAME = "Lampara";
export const COMPANY_TAGLINE = "Solar Installation CRM";

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
  | "active_customer";

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
];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "New Lead",
  survey_scheduled: "Survey Scheduled",
  survey_completed: "Survey Done",
  proposal_sent: "Proposal Sent",
  contract_signed: "Contract Signed",
  permitting: "Permitting",
  installation_scheduled: "Install Scheduled",
  installation_complete: "Install Complete",
  active_customer: "Active Customer",
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
};

// ─── Lead Sources ─────────────────────────────────────────────────────────
export const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  facebook_ad: "Facebook Ad",
  website_form: "Website Form",
  walk_in: "Walk-in",
  other: "Other",
};

// ─── User Roles ───────────────────────────────────────────────────────────
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales: "Sales Rep",
  surveyor: "Site Surveyor",
  installer: "Installer",
  office: "Office Staff",
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
  agricultural: "Agricultural",
};

// ─── Roof Types ───────────────────────────────────────────────────────────
export const ROOF_TYPE_LABELS: Record<string, string> = {
  asphalt_shingle: "Asphalt Shingle",
  metal: "Metal",
  tile: "Tile",
  flat: "Flat",
  other: "Other",
};
