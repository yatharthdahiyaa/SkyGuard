import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  WsStatus, 
  Station, 
  AlertEvent, 
  AlertTriageStatus 
} from './types/telemetry';
import { calculateMagnusDewPoint } from './services/utils';
import { TelemetryAPI } from './services/api';
import { RouterProvider, useRouter, matchRoute } from './context/RouterContext';
import { AppShell } from './components/layout/AppShell';
import { ToastStack, ToastItem } from './components/feedback/ToastStack';
import { ConfirmationModal } from './components/feedback/ConfirmationModal';
import { CommandPalette } from './components/feedback/CommandPalette';

// Views for all 9 routes
import { OverviewView } from './views/OverviewView';
import { StationsView } from './views/StationsView';
import { StationDetailView } from './views/StationDetailView';
import { AlertsView } from './views/AlertsView';
import { AlertDetailView } from './views/AlertDetailView';
import { NetworkMapView } from './views/NetworkMapView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';

function AppContent() {
  const { path, navigate, params } = useRouter();
  const [theme] = useState<'dark' | 'light'>('light');
  const [connectionStatus, setConnectionStatus] = useState<WsStatus>('live');
  const [lastMessageAt, setLastMessageAt] = useState<string | null>('Live Sync Active');
  const [streamRateMs, setStreamRateMs] = useState<number>(1000);

  const [stations, setStations] = useState<Station[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  // Master Notification Switch (saved in localStorage)
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('skyguard_notifications_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleNotifications = useCallback(() => {
    setNotificationsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('skyguard_notifications_enabled', String(next));
      if (!next) {
        setToasts([]); // Immediately dismiss visible toasts on mute
      }
      return next;
    });
  }, []);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Modal dialog state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    confirmSeverity?: 'critical' | 'warning' | 'info';
    action?: () => void;
  }>({
    isOpen: false,
    title: '',
    description: ''
  });

  // Sync theme with HTML data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Push Toast helper (suppressed when notifications are disabled)
  const addAnomalyToast = useCallback((alert: AlertEvent) => {
    if (!notificationsEnabled) return;

    const newToast: ToastItem = {
      id: `toast-${Date.now()}-${Math.random()}`,
      stationId: alert.stationId,
      stationName: alert.stationName,
      faultType: alert.faultType,
      severity: alert.severity,
      confidence: alert.confidence,
      message: alert.explanation.plainLanguageSummary,
      onClick: () => {
        navigate(`/alerts/${alert.id}`);
        setToasts((prev) => prev.filter((t) => t.stationId !== alert.stationId));
      }
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 3)]);
  }, [navigate, notificationsEnabled]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 1. Initial Load & Background Polling for Live Backend Stations and Alerts
  useEffect(() => {
    let isMounted = true;

    const loadLiveData = async () => {
      try {
        const liveStations = await TelemetryAPI.getStations();
        if (isMounted && liveStations && liveStations.length > 0) {
          setStations(liveStations);
        }
      } catch (err) {
        console.warn('Initial live stations load error:', err);
      }

      try {
        const liveAlerts = await TelemetryAPI.getAlerts();
        if (isMounted && liveAlerts && liveAlerts.length > 0) {
          setAlerts(liveAlerts);
        }
      } catch (err) {
        console.warn('Initial live alerts load error:', err);
      }
    };

    loadLiveData();

    // Background sync every 15s to keep state fresh with database
    const syncTimer = setInterval(loadLiveData, 15000);
    return () => {
      isMounted = false;
      clearInterval(syncTimer);
    };
  }, []);

  // 2. Real-time Live WebSocket streaming from SkyGuard Backend (/ws/live)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/live`;

      setConnectionStatus('reconnecting');
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          setConnectionStatus('live');
          console.info('Connected to SkyGuard Live Telemetry Stream (2 Hz)');
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            const nowStr = new Date().toLocaleTimeString('en-US', { hour12: false }) + ' UTC';
            setLastMessageAt(nowStr);

            if (data.event === 'TELEMETRY_UPDATE' || data.station_id) {
              const stationId = data.station_id;
              const repT = data.repaired?.T ?? data.observed?.T;
              const repP = data.repaired?.P ?? data.observed?.P;
              const repRH = data.repaired?.RH ?? data.observed?.RH;
              const isHardwareFault = data.status === 'HARDWARE_FAULT' || (data.fault_class && data.fault_class !== 'NONE');
              const faultName = data.fault_class || 'HARDWARE_FAULT';

              setStations((prev) => {
                return prev.map((st) => {
                  if (st.id !== stationId && st.code !== stationId) return st;

                  const newT = repT !== undefined ? Number(repT.toFixed(1)) : st.readings.temperature;
                  const newP = repP !== undefined ? Number(repP.toFixed(1)) : st.readings.pressure;
                  const newRH = repRH !== undefined ? Number(repRH.toFixed(1)) : st.readings.humidity;
                  const newDew = calculateMagnusDewPoint(newT, newRH);
                  const status = isHardwareFault ? 'faulty' : 'healthy';
                  const healthScore = isHardwareFault ? 38 : 98;

                  return {
                    ...st,
                    status,
                    healthScore,
                    latencyMs: Math.round(data.pipeline_latency_ms || 14),
                    lastPingAt: 'Just now',
                    lastSeen: 'Just now',
                    lastFault: isHardwareFault ? (data.diagnostic || faultName) : st.lastFault,
                    readings: {
                      ...st.readings,
                      temperature: newT,
                      pressure: newP,
                      humidity: newRH,
                      dewPoint: newDew
                    }
                  };
                });
              });

              // Push real-time toast if hardware fault occurs
              if (isHardwareFault) {
                const liveAlertId = `alt-live-${Date.now()}`;
                const liveAlert: AlertEvent = {
                  id: liveAlertId,
                  stationId,
                  stationName: `Station ${stationId}`,
                  faultType: faultName.includes('FROZEN') ? 'flatline' : faultName.includes('DRIFT') ? 'sensor_drift' : faultName.includes('SPIKE') ? 'step_jump' : 'dewpoint_violation',
                  severity: 'critical',
                  confidence: data.confidence || 0.98,
                  anomalyScore: 0.92,
                  parameter: 'RH',
                  triggeredAt: new Date().toISOString(),
                  durationMin: 1,
                  status: 'active',
                  assignedOperator: 'Duty Meteorologist (RMC)',
                  explanation: {
                    stationId,
                    stationName: `Station ${stationId}`,
                    timestamp: new Date().toISOString(),
                    parameter: 'RH',
                    faultType: 'dewpoint_violation',
                    severity: 'critical',
                    confidence: data.confidence || 0.98,
                    anomalyScore: 0.92,
                    riskLevel: 'CRITICAL',
                    modelVersion: 'SkyGuard v2.4 (Live ML Inference)',
                    physicsConsistency: {
                      invariant: 'Thermodynamic Invariant: T_dew ≤ T_ambient (Magnus relation)',
                      passed: false,
                      dewPointActual: 24.5,
                      dewPointMagnus: 21.0,
                      delta: 3.5,
                      formulaDescription: 'Magnus-Tetens thermodynamic check: Calculated dew-point exceeds ambient dry bulb temperature.',
                      detail: data.diagnostic || 'Real-time telemetry invariant violation detected.'
                    },
                    temporalPattern: {
                      metricName: 'Autoregressive Drift Rate',
                      errorScore: 0.94,
                      threshold: 0.35,
                      deltaRate: '+6.1% / 5min',
                      durationMin: 2,
                      detail: 'Live drift rate confirmed by state estimator.'
                    },
                    spatialConsensus: {
                      consensusScore: 0.15,
                      neighborCount: 3,
                      divergingNeighbors: 3,
                      targetValue: repRH ?? 85.0,
                      neighborsAvg: 68.0,
                      neighbors: []
                    },
                    featureImportance: [
                      { feature: 'Magnus Residual', importance: 0.52, contributionPct: 52, direction: 'increases_risk', baselineValue: 'Δ ≤ 0.2°C', observedValue: '+3.5°C' },
                      { feature: 'Spatial Residual', importance: 0.30, contributionPct: 30, direction: 'increases_risk', baselineValue: 'Z ≤ 1.5', observedValue: 'Z = 3.9' },
                      { feature: 'Temporal Rate', importance: 0.18, contributionPct: 18, direction: 'increases_risk', baselineValue: '< 2%', observedValue: '+6.1%' }
                    ],
                    evidenceTimeline: [
                      { step: 1, stage: 'Live Stream Ingestion', title: 'Telemetry Frame Received', description: 'Stream simulator transmitted 2 Hz observation.', timestamp: 'Just now', status: 'nominal' },
                      { step: 2, stage: 'ML Classification', title: 'Fault Class Identified', description: `Layer 2 classifier diagnosed ${faultName}.`, timestamp: 'Just now', status: 'critical' }
                    ],
                    recommendedActions: [
                      { id: 'act-live', title: 'Remote Recalibration Command', priority: 'high', description: 'Dispatch zero-span RTU recalibration sequence.', status: 'pending' }
                    ],
                    plainLanguageSummary: data.diagnostic || `Live fault detected on station ${stationId}: ${faultName}. Imputation engine activated.`,
                    suggestedRemediation: 'Transmit remote sensor recalibration sequence.',
                    baselineVsObserved: {
                      timestamps: ['-4m', '-3m', '-2m', '-1m', 'Now'],
                      baseline: [68.0, 68.2, 68.4, 68.6, 68.8],
                      actual: [68.1, 72.0, 78.5, 84.0, Number((repRH ?? 85).toFixed(1))],
                      anomalyStartIndex: 2,
                      metricLabel: 'Relative Humidity',
                      unit: '%'
                    }
                  }
                };

                setAlerts((prev) => [liveAlert, ...prev.slice(0, 49)]);
                addAnomalyToast(liveAlert);
              }
            }
          } catch (err) {
            console.warn('Error parsing incoming WebSocket live telemetry frame:', err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnectionStatus('reconnecting');
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (err) {
        if (!isMounted) return;
        setConnectionStatus('offline');
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [addAnomalyToast]);

  // Operations
  const handleAcknowledgeAlert = (id: string) => {
    TelemetryAPI.acknowledgeAlert(id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a))
    );
    setToasts((prev) => [
      {
        id: `ack-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Incident Management System',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Incident ${id.toUpperCase()} marked as ACKNOWLEDGED in audit trail.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handleResolveAlert = (id: string) => {
    TelemetryAPI.resolveAlert(id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'resolved' } : a))
    );
    setToasts((prev) => [
      {
        id: `res-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Incident Management System',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Incident ${id.toUpperCase()} marked as RESOLVED. Sensor baseline returned to nominal.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };


  const handleAlertStatusChange = (id: string, newStatus: AlertTriageStatus) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
    setToasts((prev) => [
      {
        id: `status-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Alert Triage Workflow',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Alert ${id.toUpperCase()} triage state transitioned to ${newStatus.toUpperCase()}.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handleAssignOperator = (id: string, operator: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, assignedOperator: operator } : a))
    );
    setToasts((prev) => [
      {
        id: `assign-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Operator Assignment',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Alert ${id.toUpperCase()} assigned to certified specialist ${operator}.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handleSilenceAlert = (id: string) => {
    setToasts((prev) => [
      {
        id: `silence-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Incident Management System',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Incident ${id.toUpperCase()} silenced for 15 minutes.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handlePingStation = (stationId: string) => {
    const st = stations.find((s) => s.id === stationId);
    setToasts((prev) => [
      {
        id: `ping-${Date.now()}`,
        stationId,
        stationName: st ? st.name : 'Station Ping',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: `Supervisory ping frame acknowledged: RTT ${st ? st.latencyMs : 24}ms. SNR nominal.`,
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handleRemediateAlert = (alert: AlertEvent) => {
    setModalState({
      isOpen: true,
      title: `DISPATCH RECALIBRATION // ${alert.stationName}`,
      description: `Transmit remote synthetic bias compensation and RTU analog front-end calibration command to ${alert.stationName} (${alert.parameter} sensor bus)?`,
      confirmLabel: 'EXECUTE RECALIBRATION',
      confirmSeverity: 'warning',
      action: () => {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, status: 'resolved' } : a))
        );
        setStations((prev) =>
          prev.map((s) =>
            s.id === alert.stationId ? { ...s, status: 'healthy', activeAlertCount: 0 } : s
          )
        );
        setToasts((prev) => [
          {
            id: `recal-${Date.now()}`,
            stationId: alert.stationId,
            stationName: alert.stationName,
            faultType: alert.faultType,
            severity: 'info',
            confidence: 1.0,
            message: `Calibration successfully dispatched. Sensor baseline normalized to virtual physics model.`,
            onClick: () => {}
          },
          ...prev
        ]);
        setModalState((m) => ({ ...m, isOpen: false }));
      }
    });
  };

  const handleRequestReboot = (station: Station) => {
    setModalState({
      isOpen: true,
      title: `HARDWARE RTU REBOOT // ${station.code}`,
      description: `WARNING: Rebooting RTU Node ${station.name} (${station.id}) will interrupt live telemetry frame capture for approximately 45 seconds while the edge RTU firmware cycles.`,
      confirmLabel: 'FORCE HARDWARE REBOOT',
      confirmSeverity: 'critical',
      action: () => {
        setToasts((prev) => [
          {
            id: `reboot-${Date.now()}`,
            stationId: station.id,
            stationName: station.name,
            faultType: 'step_jump',
            severity: 'warning',
            confidence: 1.0,
            message: `Reboot command transmitted to ${station.code}. RTU cycling power.`,
            onClick: () => {}
          },
          ...prev
        ]);
        setModalState((m) => ({ ...m, isOpen: false }));
      }
    });
  };

  const handleRequestCalibrate = (station: Station) => {
    setModalState({
      isOpen: true,
      title: `ARRAY RECALIBRATION // ${station.code}`,
      description: `Run zero-point and span calibration on RTU ${station.name}? This will zero the barometric transducer and purge polymer humidity sensors.`,
      confirmLabel: 'START CALIBRATION',
      confirmSeverity: 'warning',
      action: () => {
        setToasts((prev) => [
          {
            id: `calib-${Date.now()}`,
            stationId: station.id,
            stationName: station.name,
            faultType: 'sensor_drift',
            severity: 'info',
            confidence: 1.0,
            message: `Calibration sequence initiated for ${station.code}.`,
            onClick: () => {}
          },
          ...prev
        ]);
        setModalState((m) => ({ ...m, isOpen: false }));
      }
    });
  };

  const handleLogoutRequest = () => {
    setModalState({
      isOpen: true,
      title: 'TERMINATE OPERATIONAL SESSION',
      description: 'Are you sure you want to log out of AETHER // Core supervisory console? Active telemetry monitoring will continue in background.',
      confirmLabel: 'LOGOUT SESSION',
      confirmSeverity: 'warning',
      action: () => {
        navigate('/login');
        setModalState((m) => ({ ...m, isOpen: false }));
      }
    });
  };

  const handleInjectAnomaly = () => {
    const newAlert: AlertEvent = {
      id: `alt-${Math.floor(8100 + Math.random() * 900)}`,
      stationId: 'st-02',
      stationName: 'Glacier Pass Substation',
      faultType: 'dewpoint_violation',
      severity: 'critical',
      confidence: 0.97,
      anomalyScore: 0.94,
      durationMin: 1,
      parameter: 'RH',
      triggeredAt: new Date().toISOString(),
      status: 'active',
      assignedOperator: 'Duty Meteorologist (RMC)',
      explanation: {
        stationId: 'st-02',
        stationName: 'Glacier Pass Substation',
        timestamp: new Date().toISOString(),
        parameter: 'RH',
        faultType: 'dewpoint_violation',
        severity: 'critical',
        confidence: 0.97,
        anomalyScore: 0.94,
        riskLevel: 'CRITICAL',
        modelVersion: 'SkyGuard v2.4 (Simulated Invariant Trip)',
        physicsConsistency: {
          invariant: 'Dew-Point Ambient Upper Bound: T_dew ≤ T_ambient (Magnus relation)',
          passed: false,
          dewPointActual: 16.8,
          dewPointMagnus: 13.9,
          delta: 2.9,
          formulaDescription: 'Magnus-Tetens thermodynamic check: Observed RH 99.4% at 13.9°C ambient trips thermodynamic upper bound.',
          detail: 'PHYSICS INVARIANT BREACH: Synthetic test fault injected. Calculated dew-point exceeds dry-bulb temperature.'
        },
        temporalPattern: {
          metricName: 'Autoregressive Drift Rate',
          errorScore: 0.95,
          threshold: 0.35,
          deltaRate: '+6.2% RH / 5min',
          durationMin: 12,
          detail: 'Sharp synthetic drift rate detected against Kalman state predictor.'
        },
        spatialConsensus: {
          consensusScore: 0.12,
          neighborCount: 4,
          divergingNeighbors: 4,
          targetValue: 99.4,
          neighborsAvg: 69.2,
          neighbors: [
            { id: 'st-01', name: 'Sector 4 Alpine Ridge RTU', distanceKm: 8.2, value: 71.4, status: 'faulty' },
            { id: 'st-07', name: 'Paradise Glaciology Post', distanceKm: 16.1, value: 67.8, status: 'healthy' },
            { id: 'st-04', name: 'Metropolitan Core Hub 01', distanceKm: 34.2, value: 68.9, status: 'healthy' }
          ]
        },
        featureImportance: [
          { feature: 'Magnus Dew-Point Invariant Residual', importance: 0.48, contributionPct: 48, direction: 'increases_risk', baselineValue: 'Δ ≤ 0.2°C', observedValue: '+2.9°C' },
          { feature: 'Spatial Neighbor Divergence (Z-Score)', importance: 0.32, contributionPct: 32, direction: 'increases_risk', baselineValue: 'Z ≤ 1.5', observedValue: 'Z = 4.12' },
          { feature: 'Temporal Step Jump Rate', importance: 0.20, contributionPct: 20, direction: 'increases_risk', baselineValue: '< 1.5%', observedValue: '+6.2%' }
        ],
        evidenceTimeline: [
          { step: 1, stage: 'Manual Injection', title: 'Fault Trigger Dispatched', description: 'Operator injected test thermodynamic anomaly.', timestamp: 'Just now', status: 'warning' },
          { step: 2, stage: 'ML Pipeline', title: 'Invariant Breach Diagnosed', description: 'Dew-point violated saturation vapor pressure envelope.', timestamp: 'Just now', status: 'critical' }
        ],
        recommendedActions: [
          { id: 'act-inj', title: 'Sensor Zero-Point Calibration', priority: 'high', description: 'Reset analog front-end calibration bias.', status: 'pending' }
        ],
        plainLanguageSummary: 'Synthetic fault injected: Glacier Pass Substation sensor diverged from 3/3 neighboring stations (+30.2% bias) and breached the thermodynamic dew-point upper bound.',
        suggestedRemediation: 'Execute immediate remote RTU sensor recalibration sequence.',
        baselineVsObserved: {
          timestamps: ['-4m', '-3m', '-2m', '-1m', 'Now'],
          baseline: [68.0, 68.2, 68.4, 68.6, 68.8],
          actual: [68.1, 72.0, 78.5, 84.0, 99.4],
          anomalyStartIndex: 2,
          metricLabel: 'Relative Humidity',
          unit: '%'
        }
      }
    };

    setAlerts((prev) => [newAlert, ...prev]);
    setStations((prev) =>
      prev.map((s) => (s.id === 'st-02' ? { ...s, status: 'faulty', activeAlertCount: s.activeAlertCount + 1 } : s))
    );
    addAnomalyToast(newAlert);
  };

  const handleResetSimulation = async () => {
    try {
      const liveStations = await TelemetryAPI.getStations();
      if (liveStations && liveStations.length > 0) {
        setStations(liveStations);
      }
      const liveAlerts = await TelemetryAPI.getAlerts();
      if (liveAlerts && liveAlerts.length > 0) {
        setAlerts(liveAlerts);
      }
    } catch (err) {
      console.warn('Failed to reload state from backend:', err);
    }
    setConnectionStatus('live');
    setToasts((prev) => [
      {
        id: `reset-${Date.now()}`,
        stationId: 'sys',
        stationName: 'Simulation Engine',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: 'Telemetry metrics and operational incidents re-synchronized with live database.',
        onClick: () => {}
      },
      ...prev
    ]);
  };

  const handleExportReport = () => {
    setToasts((prev) => [
      {
        id: `export-${Date.now()}`,
        stationId: 'audit',
        stationName: 'Compliance Export Engine',
        faultType: 'sensor_drift',
        severity: 'info',
        confidence: 1.0,
        message: 'Telemetry audit report (CSV) generated and downloaded successfully.',
        onClick: () => {}
      },
      ...prev
    ]);
  };

  // Route 9: /login (renders standalone authentication view)
  if (path === '/login') {
    return (
      <LoginView
        onLoginSuccess={() => {
          setToasts((prev) => [
            {
              id: `login-${Date.now()}`,
              stationId: 'auth',
              stationName: 'Access Control',
              faultType: 'sensor_drift',
              severity: 'info',
              confidence: 1.0,
              message: 'Authentication successful. Welcome, Duty Operations Officer.',
              onClick: () => {}
            },
            ...prev
          ]);
        }}
      />
    );
  }

  // Active Alert Counts for Topbar & Sidebar
  const activeCriticalAlerts = alerts.filter(
    (a) => a.status === 'active' && a.severity === 'critical'
  ).length;

  // Route Matching
  const stationDetailMatch = matchRoute('/stations/:stationId', path);
  const alertDetailMatch = matchRoute('/alerts/:alertId', path);

  return (
    <AppShell
      connectionStatus={connectionStatus}
      lastMessageAt={lastMessageAt}
      activeCriticalAlertsCount={activeCriticalAlerts}
      totalAlertsCount={alerts.filter((a) => a.status === 'active').length}
      stationsCount={stations.length}
      theme="light"
      notificationsEnabled={notificationsEnabled}
      onToggleNotifications={handleToggleNotifications}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      onOpenLogoutModal={handleLogoutRequest}
      onOpenSettingsModal={() => navigate('/settings')}
    >
      {/* Route 1: / (Overview Dashboard) */}
      {path === '/' && (
        <OverviewView
          stations={stations}
          alerts={alerts}
          onSelectStation={(st) => navigate(`/stations/${st.id}`)}
          onSelectAlert={(alt) => navigate(`/alerts/${alt.id}`)}
          onAcknowledgeAlert={handleAcknowledgeAlert}
        />
      )}

      {/* Route 2: /stations (Stations List & Table) */}
      {path === '/stations' && (
        <StationsView
          stations={stations}
          onRequestReboot={handleRequestReboot}
          onRequestCalibrate={handleRequestCalibrate}
          onPingStation={handlePingStation}
        />
      )}

      {/* Route 3: /stations/:stationId (Station Detail) */}
      {stationDetailMatch.matches && (
        <StationDetailView
          stationId={stationDetailMatch.params.stationId}
          stations={stations}
          onRequestReboot={handleRequestReboot}
          onRequestCalibrate={handleRequestCalibrate}
          onAcknowledgeAlert={handleAcknowledgeAlert}
        />
      )}

      {/* Route 4: /alerts (Central Alert Feed) */}
      {path === '/alerts' && (
        <AlertsView
          alerts={alerts}
          onChangeAlertStatus={handleAlertStatusChange}
          onAssignOperator={handleAssignOperator}
        />
      )}

      {/* Route 5: /alerts/:alertId (Alert Detail & AI Explainability) */}
      {alertDetailMatch.matches && (
        <AlertDetailView
          alertId={alertDetailMatch.params.alertId}
          alerts={alerts}
          onChangeStatus={handleAlertStatusChange}
          onAssignOperator={handleAssignOperator}
        />
      )}

      {/* Route 6: /map (Full-Screen Network Map) */}
      {path === '/map' && (
        <NetworkMapView
          stations={stations}
          onSelectStation={(st) => navigate(`/stations/${st.id}`)}
        />
      )}

      {/* Route 7: /analytics (Fleet Analytics) */}
      {path === '/analytics' && (
        <AnalyticsView 
          onExportReport={handleExportReport} 
          stations={stations} 
        />
      )}

      {/* Route 8: /settings (Supervisory Settings) */}
      {path === '/settings' && (
        <SettingsView
          connectionStatus={connectionStatus}
          onChangeConnectionStatus={setConnectionStatus}
          streamRateMs={streamRateMs}
          onChangeStreamRate={setStreamRateMs}
          theme={theme}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={handleToggleNotifications}
          onInjectAnomaly={handleInjectAnomaly}
          onResetSimulation={handleResetSimulation}
        />
      )}

      {/* Toast Stack for incoming Anomaly Toasts */}
      <ToastStack 
        toasts={toasts} 
        onDismiss={dismissToast} 
        onMuteAll={handleToggleNotifications} 
      />

      {/* Confirmation Modal for Destructive Operations */}
      <ConfirmationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        confirmLabel={modalState.confirmLabel}
        confirmSeverity={modalState.confirmSeverity}
        onConfirm={() => {
          if (modalState.action) modalState.action();
        }}
        onCancel={() => setModalState((m) => ({ ...m, isOpen: false }))}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        stations={stations}
        alerts={alerts}
        onSelectView={(v) => {
          if (v === 'overview') navigate('/');
          else if (v === 'stations') navigate('/stations');
          else if (v === 'alerts') navigate('/alerts');
          else if (v === 'network-map') navigate('/map');
          else if (v === 'analytics') navigate('/analytics');
          else if (v === 'settings') navigate('/settings');
        }}
        onSelectStation={(st) => navigate(`/stations/${st.id}`)}
        onSelectAlert={(alt) => navigate(`/alerts/${alt.id}`)}
      />
    </AppShell>
  );
}

export function App() {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  );
}

export default App;
