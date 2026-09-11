export type WsStatus = 'live' | 'reconnecting' | 'offline';

export type Severity = 'critical' | 'warning' | 'info';

export type HealthStatus = 'healthy' | 'degraded' | 'faulty' | 'offline';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'custom';

export type ParameterType = 'T' | 'P' | 'RH' | 'vibration' | 'voltage' | 'current' | 'signal';

export type FaultType = 
  | 'sensor_drift' 
  | 'flatline' 
  | 'step_jump' 
  | 'dewpoint_violation' 
  | 'consensus_outlier' 
  | 'noise_spike'
  | 'bearing_degradation'
  | 'overheating'
  | 'power_instability';

export type AlertTriageStatus = 'new' | 'active' | 'investigating' | 'acknowledged' | 'resolved';

export interface SensorReadings {
  temperature: number; // °C
  pressure: number;    // hPa
  humidity: number;    // % (RH)
  dewPoint: number;    // °C
  vibrationRms: number;// mm/s
  voltageV: number;    // V DC
  currentA: number;    // A
  signalDbm: number;   // dBm
}

export interface SensorConfig {
  id: string;
  name: string;
  type: string;
  status: HealthStatus;
  samplingRateHz: number;
  thresholdMin: number;
  thresholdMax: number;
  unit: string;
  lastReading: number;
}

export interface StationHistoryEvent {
  id: string;
  type: 'fault' | 'alert' | 'maintenance' | 'config' | 'connectivity';
  timestamp: string;
  title: string;
  description: string;
  severity?: Severity;
  operator?: string;
}

export interface Station {
  id: string;
  name: string;
  code: string;
  sector: string;
  region: string;
  lat: number;
  lng: number;
  elevationM: number;
  status: HealthStatus;
  healthScore: number;       // 0 to 100
  uptimePct: number;         // e.g. 99.8
  modelConfidence: number;   // 0.0 to 1.0
  latencyMs: number;
  snrDb: number;
  firmware: string;
  sensorCount: number;
  onlineSensors: number;
  lastPingAt: string;
  lastSeen: string;
  lastFault: string;
  readings: SensorReadings;
  activeAlertCount: number;
  sensors: SensorConfig[];
  history: StationHistoryEvent[];
}

export interface AnomalyMarker {
  timestamp: string;
  value: number;
  faultType: FaultType;
  severity: Severity;
  confidence: number;
  label: string;
}

export interface NeighborReading {
  id: string;
  name: string;
  distanceKm: number;
  value: number;
  status: HealthStatus;
}

export interface PhysicsConsistency {
  invariant: string;
  passed: boolean;
  dewPointActual: number;
  dewPointMagnus: number;
  delta: number;
  formulaDescription: string;
  detail: string;
}

export interface TemporalPattern {
  metricName: string;
  errorScore: number;
  threshold: number;
  deltaRate: string;
  durationMin: number;
  detail: string;
}

export interface SpatialConsensus {
  consensusScore: number;
  neighborCount: number;
  divergingNeighbors: number;
  targetValue: number;
  neighborsAvg: number;
  neighbors: NeighborReading[];
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  contributionPct: number;
  direction: 'increases_risk' | 'decreases_risk';
  baselineValue: string;
  observedValue: string;
}

export interface EvidenceStep {
  step: number;
  stage: string;
  title: string;
  description: string;
  timestamp: string;
  status: 'nominal' | 'warning' | 'critical';
}

export interface RecommendedAction {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AnomalyExplanation {
  stationId: string;
  stationName: string;
  timestamp: string;
  parameter: ParameterType;
  faultType: FaultType;
  severity: Severity;
  confidence: number;
  anomalyScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  modelVersion: string;
  physicsConsistency: PhysicsConsistency;
  temporalPattern: TemporalPattern;
  spatialConsensus: SpatialConsensus;
  featureImportance: FeatureImportance[];
  evidenceTimeline: EvidenceStep[];
  recommendedActions: RecommendedAction[];
  plainLanguageSummary: string;
  suggestedRemediation: string;
  baselineVsObserved: {
    timestamps: string[];
    baseline: number[];
    actual: number[];
    anomalyStartIndex: number;
    metricLabel: string;
    unit: string;
  };
}

export interface AlertEvent {
  id: string;
  stationId: string;
  stationName: string;
  faultType: FaultType;
  severity: Severity;
  confidence: number;
  anomalyScore: number;
  parameter: ParameterType;
  triggeredAt: string;
  durationMin: number;
  status: AlertTriageStatus;
  assignedOperator: string;
  explanation: AnomalyExplanation;
  notes?: string[];
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ParameterSeriesData {
  parameter: ParameterType;
  series: TimeSeriesPoint[];
  anomalyMarkers: AnomalyMarker[];
  correctedOverlay?: TimeSeriesPoint[];
}

// AI Model Benchmark Types
export interface ModelBenchmark {
  version: string;
  name: string;
  isCurrent: boolean;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  avgConfidence: number;
  detectionLatencyMs: number;
}

// Settings Models
export interface ThresholdSetting {
  id: string;
  metric: string;
  current: number;
  recommended: number;
  unit: string;
  lastModified: string;
  modifiedBy: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  triggerSeverity: string;
  email: boolean;
  sms: boolean;
  push: boolean;
  escalationDelayMin: number;
  recipients: string[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Operator' | 'Analyst' | 'Viewer';
  status: 'active' | 'suspended';
  lastActive: string;
}

export interface PermissionMatrixRow {
  role: 'Admin' | 'Operator' | 'Analyst' | 'Viewer';
  viewStations: boolean;
  configureStations: boolean;
  viewAlerts: boolean;
  manageAlerts: boolean;
  viewAnalytics: boolean;
  modifyThresholds: boolean;
  manageUsers: boolean;
}

export type ViewType = 'overview' | 'stations' | 'alerts' | 'network-map' | 'analytics' | 'settings' | 'login';
