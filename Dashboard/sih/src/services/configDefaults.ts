import { 
  ThresholdSetting, 
  NotificationRule, 
  UserAccount, 
  PermissionMatrixRow,
  ModelBenchmark
} from '../types/telemetry';

export const THRESHOLD_SETTINGS: ThresholdSetting[] = [
  { id: 'th-1', metric: 'Temperature Gradient (ΔT / 10min)', current: 4.5, recommended: 3.5, unit: '°C', lastModified: '2026-09-01', modifiedBy: 'Dr. A. Sharma' },
  { id: 'th-2', metric: 'Relative Humidity Step Jump', current: 15.0, recommended: 12.0, unit: '%', lastModified: '2026-09-01', modifiedBy: 'Dr. A. Sharma' },
  { id: 'th-3', metric: 'Barometric Pressure Deviation', current: 3.0, recommended: 2.5, unit: 'hPa', lastModified: '2026-09-01', modifiedBy: 'Dr. A. Sharma' },
  { id: 'th-4', metric: 'Magnus Dew-Point Invariant Boundary (ΔTd)', current: 0.5, recommended: 0.5, unit: '°C', lastModified: '2026-09-01', modifiedBy: 'Dr. A. Sharma' },
  { id: 'th-5', metric: 'Spatial Consensus Z-Score Outlier', current: 3.0, recommended: 2.5, unit: 'σ', lastModified: '2026-09-01', modifiedBy: 'System AI' },
  { id: 'th-6', metric: 'Sensor Deadband / Flatline Duration', current: 180, recommended: 120, unit: 'sec', lastModified: '2026-09-01', modifiedBy: 'System AI' },
];

export const NOTIFICATION_RULES: NotificationRule[] = [
  { id: 'nr-1', name: 'Critical Sensor Fault & Disconnect', triggerSeverity: 'CRITICAL', email: true, sms: true, push: true, escalationDelayMin: 0, recipients: ['field-team@imd.gov.in', 'alert-ops@skyguard.ai'] },
  { id: 'nr-2', name: 'Persistent Calibration Drift (> 1 hr)', triggerSeverity: 'WARNING', email: true, sms: false, push: true, escalationDelayMin: 30, recipients: ['station-maintenance@imd.gov.in'] },
  { id: 'nr-3', name: 'Thermodynamic Invariant Breach', triggerSeverity: 'CRITICAL', email: true, sms: true, push: true, escalationDelayMin: 5, recipients: ['meteorology-desk@imd.gov.in'] },
  { id: 'nr-4', name: 'Routine Battery / Voltage Degradation', triggerSeverity: 'INFO', email: true, sms: false, push: false, escalationDelayMin: 120, recipients: ['hardware-health@imd.gov.in'] },
];

export const USER_ACCOUNTS: UserAccount[] = [
  { id: 'usr-1', name: 'Duty Operations Officer', email: 'duty.officer@skyguard.gov.in', role: 'Admin', status: 'active', lastActive: 'Active Now' },
  { id: 'usr-2', name: 'Dr. Rajesh Rao', email: 'r.rao@imd.gov.in', role: 'Operator', status: 'active', lastActive: '12m ago' },
  { id: 'usr-3', name: 'Priya Sundaram', email: 'p.sundaram@imd.gov.in', role: 'Analyst', status: 'active', lastActive: '1h ago' },
  { id: 'usr-4', name: 'Vikram Mehta', email: 'v.mehta@skyguard.ai', role: 'Viewer', status: 'active', lastActive: 'Yesterday' },
];

export const PERMISSION_MATRIX: PermissionMatrixRow[] = [
  { role: 'Admin', viewStations: true, configureStations: true, viewAlerts: true, manageAlerts: true, viewAnalytics: true, modifyThresholds: true, manageUsers: true },
  { role: 'Operator', viewStations: true, configureStations: true, viewAlerts: true, manageAlerts: true, viewAnalytics: true, modifyThresholds: false, manageUsers: false },
  { role: 'Analyst', viewStations: true, configureStations: false, viewAlerts: true, manageAlerts: false, viewAnalytics: true, modifyThresholds: false, manageUsers: false },
  { role: 'Viewer', viewStations: true, configureStations: false, viewAlerts: true, manageAlerts: false, viewAnalytics: false, modifyThresholds: false, manageUsers: false },
];

export const MODEL_BENCHMARKS: ModelBenchmark[] = [
  {
    version: 'v2.4-prod (SkyGuard Physics-Informed ML)',
    name: 'Physics-Informed LightGBM (19 features, temporal split + spatial consensus)',
    isCurrent: true,
    accuracy: 0.982,
    precision: 0.854,
    recall: 0.832,
    f1Score: 0.842,
    falsePositiveRate: 0.000,
    falseNegativeRate: 0.018,
    avgConfidence: 0.984,
    detectionLatencyMs: 1
  },
  {
    version: 'v1.0 (Rule-Based Threshold & Physical Invariants Baseline)',
    name: 'Static Bounds + Magnus Invariant + Rolling Z-Score Baseline',
    isCurrent: false,
    accuracy: 0.920,
    precision: 0.190,
    recall: 0.210,
    f1Score: 0.200,
    falsePositiveRate: 0.048,
    falseNegativeRate: 0.790,
    avgConfidence: 0.750,
    detectionLatencyMs: 0.2
  }
];
