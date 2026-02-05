export const ALLOWED_DOMAINS = [
  "unece.org",
  "globalautoregs.com",
  "futurium.ec.europa.eu",
  "commission.europa.eu",
  "digital-strategy.ec.europa.eu",
  "ec.europa.eu",
  "eur-lex.europa.eu",
  "op.europa.eu",
  "gesetze-im-internet.de",
  "legifrance.gouv.fr",
  "legislation.gov.uk",
  "rdw.nl",
  "vca.gov.uk",
  "edpb.europa.eu",
  "bfdi.bund.de",
  "bsi.bund.de",
  "cnil.fr",
  "enisa.europa.eu",
  "wiki.unece.org",
  "www.gov.uk",
  "kba.de",
  "utac.com",
  "idiada.com",
  "vda.de"
] as const;

export const JURISDICTIONS = ["EU", "DE", "FR", "UK", "UN_ECE", "GLOBAL", "ES", "IT", "CZ", "PL"] as const;
export const SOURCE_TYPES = [
  "regulation",
  "draft",
  "guidance",
  "position_paper",
  "minutes",
  "technical_notice"
] as const;
export const ITEM_STATUSES = ["proposed", "adopted", "in_force", "repealed", "unknown"] as const;
export const TOPICS = [
  "AI_ACT",
  "GDPR",
  "DATA_ACT",
  "DCAS_R171",
  "GSR",
  "EU_NCAP_2026",
  "CYBER_SECURITY",
  "SOFTWARE_UPDATE",
  "AUTOMATED_DRIVING",
  "TYPE_APPROVAL",
  "ADAS",
  "UNECE_WP29",
  "VEHICLE_DYNAMICS",
  "DRIVABILITY",
  "POWERTRAIN",
  "CHARGING",
  "BATTERY",
  "EMISSIONS",
  "RANGE",
  "INTERIOR",
  "EXTERIOR",
  "MATERIALS"
] as const;
export const IMPACTED_AREAS = [
  "ODD",
  "Perception",
  "DMS",
  "HMI",
  "Validation",
  "Homologation",
  "Data_Governance",
  "Cybersecurity",
  "OTA",
  "Vehicle_Dynamics",
  "Drivability",
  "Powertrain",
  "Charging",
  "Battery",
  "Emissions",
  "Range",
  "Interior",
  "Exterior",
  "Materials"
] as const;
export const PRIORITIES = ["P0", "P1", "P2"] as const;


export const TRUST_TIERS = [
  "TIER_A_BINDING",
  "TIER_B_OFFICIAL_SIGNAL",
  "TIER_C_SOFT_REQ",
  "TIER_D_QUARANTINE"
] as const;

export const MONITORING_STAGES = [
  "Drafting",
  "Official",
  "Comitology",
  "Interpreting",
  "Use&Registration"
] as const;

export const EVIDENCE_STATUS = ["complete", "partial", "missing"] as const;
export const REVIEW_STATUS = ["pending", "approved", "rejected"] as const;
export const RUN_STATUS = ["queued", "running", "completed", "failed"] as const;

export type AllowedDomain = (typeof ALLOWED_DOMAINS)[number];
export type Jurisdiction = (typeof JURISDICTIONS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type Topic = (typeof TOPICS)[number];
export type ImpactedArea = (typeof IMPACTED_AREAS)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TrustTier = (typeof TRUST_TIERS)[number];
export type MonitoringStage = (typeof MONITORING_STAGES)[number];
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];
export type ReviewStatus = (typeof REVIEW_STATUS)[number];
export type RunStatus = (typeof RUN_STATUS)[number];
