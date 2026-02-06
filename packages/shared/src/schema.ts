/**
 * RegPulse Lakehouse - 数据 Schema 定义
 * 严格按照需求定义的 RegPulseItem 结构
 */

// 司法管辖区
export type Jurisdiction = 'EU' | 'DE' | 'FR' | 'UK' | 'UN_ECE' | 'GLOBAL' | 'ES' | 'IT' | 'CZ' | 'PL';

// 来源类型
export type SourceType = 
  | 'regulation' 
  | 'draft' 
  | 'guidance' 
  | 'position_paper' 
  | 'minutes' 
  | 'technical_notice';

// 状态
export type ItemStatus = 'proposed' | 'adopted' | 'in_force' | 'repealed' | 'unknown';

// 主题标签
export type Topic = 
  | 'AI_ACT' 
  | 'GDPR' 
  | 'DATA_ACT' 
  | 'DCAS_R171' 
  | 'GSR' 
  | 'EU_NCAP_2026'
  | 'CYBER_SECURITY'
  | 'SOFTWARE_UPDATE'
  | 'AUTOMATED_DRIVING'
  | 'TYPE_APPROVAL'
  | 'ADAS'
  | 'UNECE_WP29'
  | 'VEHICLE_DYNAMICS'
  | 'DRIVABILITY'
  | 'POWERTRAIN'
  | 'CHARGING'
  | 'BATTERY'
  | 'EMISSIONS'
  | 'RANGE'
  | 'INTERIOR'
  | 'EXTERIOR'
  | 'MATERIALS';

// 影响领域
export type ImpactedArea = 
  | 'ODD' 
  | 'Perception' 
  | 'DMS' 
  | 'HMI' 
  | 'Validation' 
  | 'Homologation' 
  | 'Data_Governance' 
  | 'Cybersecurity' 
  | 'OTA'
  | 'Vehicle_Dynamics'
  | 'Drivability'
  | 'Powertrain'
  | 'Charging'
  | 'Battery'
  | 'Emissions'
  | 'Range'
  | 'Interior'
  | 'Exterior'
  | 'Materials';

// 工程动作
export interface EngineeringAction {
  action: string;
  owner_role: string;
  due_date: string | null;
  artifact: string;
}

// 证据链
export interface Evidence {
  raw_file_uri: string | null;
  text_snapshot_uri: string | null;
  citations: Citation[];
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

// 优先级
export type Priority = 'P0' | 'P1' | 'P2';

// Trust tier
export type TrustTier = 'TIER_A_BINDING' | 'TIER_B_OFFICIAL_SIGNAL' | 'TIER_C_SOFT_REQ' | 'TIER_D_QUARANTINE';

// Monitoring stage
export type MonitoringStage = 'Drafting' | 'Official' | 'Comitology' | 'Interpreting' | 'Use&Registration';

// 主数据结构：RegPulseItem
export interface RegPulseItem {
  id: string;
  jurisdiction: Jurisdiction;
  source_org: string;
  source_type: SourceType;
  title: string;
  summary_1line: string;
  url: string;
  published_date: string | null;
  retrieved_at: string;
  effective_date: string | null;
  status: ItemStatus;
  topics: Topic[];
  impacted_areas: ImpactedArea[];
  engineering_actions: EngineeringAction[];
  evidence: Evidence;
  confidence: number;
  notes: string;
  priority: Priority;
  trust_tier?: TrustTier;
  monitoring_stage?: MonitoringStage;
  source_profile_id?: string;
  source_document_id?: string;
}

// 运行记录
export interface RunRecord {
  id: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  jurisdiction: Jurisdiction;
  days_window: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  meta?: Record<string, unknown>;
  job_id?: string;
}

// 配置
export interface RegPulseConfig {
  time_window_days: number;
  jurisdictions: Jurisdiction[];
  allowed_domains: string[];
  openai_api_key_configured: boolean;
  openai_model: string;
  reasoning_effort: 'low' | 'medium' | 'high';
  confidence_min: number;
  auto_schedule_enabled: boolean;
  schedule_cron: string;
}

// 统计数据
export interface DashboardStats {
  total_items: number;
  items_by_jurisdiction: Record<Jurisdiction, number>;
  items_by_status: Record<ItemStatus, number>;
  items_by_priority: Record<Priority, number>;
  last_run: RunRecord | null;
  pending_review: number;
  quarantined: number;
}

// 允许的域名（铁律）
export const ALLOWED_DOMAINS = [
  'unece.org',
  'globalautoregs.com',
  'futurium.ec.europa.eu',
  'commission.europa.eu',
  'digital-strategy.ec.europa.eu',
  'ec.europa.eu',
  'eur-lex.europa.eu',
  'op.europa.eu',
  'publications.europa.eu',
  'gesetze-im-internet.de',
  'legifrance.gouv.fr',
  'legislation.gov.uk',
  'rdw.nl',
  'vca.gov.uk',
  'edpb.europa.eu',
  'edps.europa.eu',
  'ico.org.uk',
  'bfdi.bund.de',
  'bsi.bund.de',
  'cnil.fr',
  'enisa.europa.eu',
  'wiki.unece.org',
  'www.gov.uk',
  'kba.de',
  'utac.com',
  'idiada.com',
  'vda.de',
  'euroncap.com',
  'iso.org',
  'din.de',
  'enx.com',
  'iapp.org',
  'euractiv.com',
  'globalprivacyblog.com',
  'blogs.dlapiper.com',
] as const;

// 来源机构映射
export const SOURCE_ORGS: Record<string, string> = {
  'unece.org': 'UNECE',
  'globalautoregs.com': 'GlobalAutoRegs',
  'futurium.ec.europa.eu': 'EU AI Alliance',
  'commission.europa.eu': 'European Commission',
  'digital-strategy.ec.europa.eu': 'EU Digital Strategy',
  'ec.europa.eu': 'European Commission',
  'eur-lex.europa.eu': 'EUR-Lex',
  'op.europa.eu': 'Publications Office',
  'publications.europa.eu': 'Publications Office',
  'gesetze-im-internet.de': 'Gesetze im Internet',
  'legifrance.gouv.fr': 'Legifrance',
  'legislation.gov.uk': 'UK Legislation',
  'rdw.nl': 'RDW',
  'vca.gov.uk': 'VCA',
  'edpb.europa.eu': 'EDPB',
  'edps.europa.eu': 'EDPS',
  'ico.org.uk': 'ICO',
  'bfdi.bund.de': 'BfDI',
  'bsi.bund.de': 'BSI',
  'cnil.fr': 'CNIL',
  'enisa.europa.eu': 'ENISA',
  'wiki.unece.org': 'UNECE Wiki',
  'www.gov.uk': 'UK Government',
  'kba.de': 'KBA',
  'utac.com': 'UTAC',
  'idiada.com': 'IDIADA',
  'vda.de': 'VDA',
  'euroncap.com': 'Euro NCAP',
  'iso.org': 'ISO',
  'din.de': 'DIN',
  'enx.com': 'ENX',
  'iapp.org': 'IAPP',
  'euractiv.com': 'Euractiv',
  'globalprivacyblog.com': 'Global Privacy Blog',
  'blogs.dlapiper.com': 'DLA Piper Blog',
};

// 主题标签显示名
export const TOPIC_LABELS: Record<Topic, string> = {
  'AI_ACT': 'AI Act',
  'GDPR': 'GDPR',
  'DATA_ACT': 'Data Act',
  'DCAS_R171': 'DCAS R171',
  'GSR': 'General Safety Regulation',
  'EU_NCAP_2026': 'EU NCAP 2026',
  'CYBER_SECURITY': 'Cybersecurity',
  'SOFTWARE_UPDATE': 'Software Update',
  'AUTOMATED_DRIVING': 'Automated Driving',
  'TYPE_APPROVAL': 'Type Approval',
  'ADAS': 'ADAS',
  'UNECE_WP29': 'UNECE WP.29',
  'VEHICLE_DYNAMICS': 'Vehicle Dynamics',
  'DRIVABILITY': 'Drivability',
  'POWERTRAIN': 'Powertrain',
  'CHARGING': 'Charging',
  'BATTERY': 'Battery',
  'EMISSIONS': 'Emissions',
  'RANGE': 'Range',
  'INTERIOR': 'Interior',
  'EXTERIOR': 'Exterior',
  'MATERIALS': 'Materials',
};

// 状态显示配置
export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  proposed: { label: '提议中', color: 'yellow' },
  adopted: { label: '已采纳', color: 'blue' },
  in_force: { label: '生效中', color: 'green' },
  repealed: { label: '已废止', color: 'gray' },
  unknown: { label: '未知', color: 'gray' },
};

// 优先级配置
export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; description: string }> = {
  P0: { label: 'P0 - 紧急', color: 'red', description: '即将生效/影响型式认证' },
  P1: { label: 'P1 - 高', color: 'orange', description: '影响 ADAS 高风险功能' },
  P2: { label: 'P2 - 中', color: 'blue', description: '常规跟踪' },
};
