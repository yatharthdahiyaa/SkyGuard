import React, { useState } from 'react';
import { 
  WsStatus, 
  ThresholdSetting, 
  NotificationRule, 
  UserAccount, 
  PermissionMatrixRow 
} from '../types/telemetry';
import { 
  THRESHOLD_SETTINGS, 
  NOTIFICATION_RULES, 
  USER_ACCOUNTS, 
  PERMISSION_MATRIX 
} from '../services/configDefaults';
import { 
  Sliders, 
  Bell, 
  Users, 
  ShieldCheck, 
  Radio, 
  Check, 
  Minus, 
  Plus, 
  Save, 
  RotateCcw, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Wifi, 
  Sparkles, 
  Sun, 
  Moon,
  AlertOctagon,
  Mail,
  Smartphone,
  Send,
  X,
  BellOff
} from 'lucide-react';

interface SettingsViewProps {
  connectionStatus: WsStatus;
  onChangeConnectionStatus: (status: WsStatus) => void;
  streamRateMs: number;
  onChangeStreamRate: (rate: number) => void;
  theme?: 'dark' | 'light';
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
  onToggleTheme?: () => void;
  onInjectAnomaly: () => void;
  onResetSimulation: () => void;
}

type SettingsTab = 'thresholds' | 'notifications' | 'users' | 'permissions' | 'simulator';

export const SettingsView: React.FC<SettingsViewProps> = ({
  connectionStatus,
  onChangeConnectionStatus,
  streamRateMs,
  onChangeStreamRate,
  theme,
  notificationsEnabled = true,
  onToggleNotifications,
  onToggleTheme,
  onInjectAnomaly,
  onResetSimulation
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('thresholds');
  const [thresholds, setThresholds] = useState<ThresholdSetting[]>(THRESHOLD_SETTINGS);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>(NOTIFICATION_RULES);
  const [users, setUsers] = useState<UserAccount[]>(USER_ACCOUNTS);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Invite user modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Admin' | 'Operator' | 'Analyst' | 'Viewer'>('Operator');

  // Add notification rule modal state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleSeverity, setNewRuleSeverity] = useState<'CRITICAL' | 'WARNING' | 'INFO'>('CRITICAL');
  const [newRuleEmail, setNewRuleEmail] = useState(true);
  const [newRuleSms, setNewRuleSms] = useState(false);
  const [newRulePush, setNewRulePush] = useState(true);
  const [newRuleDelay, setNewRuleDelay] = useState(5);
  const [newRuleRecipients, setNewRuleRecipients] = useState('ops-lead@aether.io');

  const handleThresholdChange = (id: string, newVal: number) => {
    setThresholds(prev => prev.map(t => t.id === id ? { ...t, current: newVal } : t));
  };

  const handleResetThresholds = () => {
    setThresholds(THRESHOLD_SETTINGS);
    triggerSaveBanner('Threshold configurations restored to system recommended factory defaults.');
  };

  const handleSaveThresholds = () => {
    triggerSaveBanner('Telemetry physical invariant thresholds saved and synced to edge RTUs.');
  };

  const triggerSaveBanner = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleToggleRule = (id: string) => {
    setNotificationRules(prev => prev.map(r => r.id === id ? { ...r, email: !r.email, sms: !r.sms, push: !r.push } : r));
  };

  const handleMuteAllRules = () => {
    setNotificationRules(prev => prev.map(r => ({ ...r, email: false, sms: false, push: false })));
    triggerSaveBanner('All escalation dispatch policies have been disabled.');
  };

  const handleEnableAllRules = () => {
    setNotificationRules(prev => prev.map(r => ({ ...r, email: true, sms: true, push: true })));
    triggerSaveBanner('All escalation dispatch policies have been enabled.');
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' } : u));
    triggerSaveBanner('User account operational status updated.');
  };

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    const created: UserAccount = {
      id: `usr-${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      status: 'active',
      lastActive: 'Just invited'
    };
    setUsers(prev => [...prev, created]);
    setInviteModalOpen(false);
    setNewUserName('');
    setNewUserEmail('');
    triggerSaveBanner(`Invitation dispatch sent to ${created.email} (${created.role}).`);
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName) return;
    const created: NotificationRule = {
      id: `nr-${Date.now()}`,
      name: newRuleName,
      triggerSeverity: newRuleSeverity,
      email: newRuleEmail,
      sms: newRuleSms,
      push: newRulePush,
      escalationDelayMin: newRuleDelay,
      recipients: newRuleRecipients.split(',').map(s => s.trim())
    };
    setNotificationRules(prev => [...prev, created]);
    setRuleModalOpen(false);
    setNewRuleName('');
    triggerSaveBanner(`Alert escalation policy "${created.name}" activated.`);
  };

  return (
    <div className="view-container settings-view-container font-mono">
      {/* View Header */}
      <div className="view-header-strip">
        <div className="view-title-group">
          <h1 className="view-title">SETTINGS &amp; SUPERVISORY CONTROL</h1>
          <p className="view-subtitle text-secondary">
            PHYSICAL INVARIANT THRESHOLDS, ESCALATION POLICIES, ACCESS CONTROLS, AND SIMULATION
          </p>
        </div>
      </div>

      {/* Save Success Alert Banner */}
      {saveSuccessMsg && (
        <div className="save-success-banner badge-healthy p-3 mb-4 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={16} />
            <span>{saveSuccessMsg}</span>
          </div>
          <button onClick={() => setSaveSuccessMsg(null)} className="text-secondary hover:text-primary">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs Navigation Strip */}
      <div className="settings-tabs-bar">
        <button
          className={`settings-tab-btn ${activeTab === 'thresholds' ? 'active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          <Sliders size={14} />
          <span>THRESHOLD CONFIGURATION</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={14} />
          <span>NOTIFICATION RULES</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={14} />
          <span>USER MANAGEMENT</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          <ShieldCheck size={14} />
          <span>ROLES &amp; PERMISSIONS</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Wifi size={14} />
          <span>SIMULATOR &amp; PREFERENCES</span>
        </button>
      </div>

      {/* Tab 1: Threshold Configuration */}
      {activeTab === 'thresholds' && (
        <div className="settings-tab-content">
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-primary font-bold text-base">PER-METRIC PHYSICAL &amp; AI THRESHOLDS</h2>
                <p className="text-secondary text-xs mt-1">
                  Adjust warning and critical limits across physical transducers. Deviations triggering alerts affect edge RTU classification.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleResetThresholds} className="btn-secondary text-xs flex items-center gap-1 px-3 py-1.5 rounded">
                  <RotateCcw size={13} />
                  <span>RESET TO RECOMMENDED</span>
                </button>
                <button onClick={handleSaveThresholds} className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5 rounded">
                  <Save size={13} />
                  <span>SAVE CONFIGURATION</span>
                </button>
              </div>
            </div>

            <div className="thresholds-table-wrap">
              <table className="station-table">
                <thead>
                  <tr>
                    <th>METRIC &amp; INVARIANT</th>
                    <th>CURRENT THRESHOLD</th>
                    <th>RECOMMENDED</th>
                    <th>UNIT</th>
                    <th>LAST MODIFIED</th>
                    <th>AUTHOR</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholds.map((t) => {
                    const isDiff = t.current !== t.recommended;
                    return (
                      <tr key={t.id}>
                        <td className="font-bold text-primary">{t.metric}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.05"
                              value={t.current}
                              onChange={(e) => handleThresholdChange(t.id, parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-right font-mono text-emerald-400"
                            />
                            <span className="text-muted text-xs">{t.unit}</span>
                          </div>
                        </td>
                        <td>
                          <span className="text-secondary">{t.recommended} {t.unit}</span>
                        </td>
                        <td className="text-muted">{t.unit}</td>
                        <td className="text-muted">{t.lastModified}</td>
                        <td className="text-secondary">{t.modifiedBy}</td>
                        <td>
                          <span className={`status-badge-inline ${isDiff ? 'badge-warning' : 'badge-healthy'}`}>
                            {isDiff ? 'MODIFIED' : 'DEFAULT'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Notification Rules */}
      {activeTab === 'notifications' && (
        <div className="settings-tab-content">
          <div className="panel p-5">
            {/* Master In-App Notifications Switch */}
            <div className="mb-5 p-4 rounded-lg border border-slate-800 bg-slate-950/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary text-sm">REAL-TIME IN-APP NOTIFICATIONS</span>
                  <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border ${
                    notificationsEnabled 
                      ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400' 
                      : 'bg-rose-950/50 border-rose-500/50 text-rose-400'
                  }`}>
                    {notificationsEnabled ? 'STATUS: ACTIVE (TOASTS ON)' : 'STATUS: MUTED (TOASTS OFF)'}
                  </span>
                </div>
                <p className="text-secondary text-xs mt-1">
                  Master switch to suppress all live telemetry anomaly popup toasts and supervisory notification banners.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {onToggleNotifications && (
                  <button
                    onClick={onToggleNotifications}
                    className={`px-3.5 py-1.5 rounded text-xs font-mono font-bold border flex items-center gap-2 transition-all ${
                      notificationsEnabled
                        ? 'bg-rose-950/40 border-rose-500/60 text-rose-300 hover:bg-rose-900/60 shadow-lg shadow-rose-950/30'
                        : 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/60 shadow-lg shadow-emerald-950/30'
                    }`}
                  >
                    {notificationsEnabled ? <BellOff size={14} /> : <Bell size={14} />}
                    <span>{notificationsEnabled ? 'TURN OFF NOTIFICATIONS' : 'TURN ON NOTIFICATIONS'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-primary font-bold text-base">INCIDENT ESCALATION &amp; DISPATCH POLICIES</h2>
                <p className="text-secondary text-xs mt-1">
                  Define automated dispatch routes for telemetry invariant breaches and station connectivity drops.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleMuteAllRules}
                  className="px-2.5 py-1 rounded text-xs font-mono border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                  title="Disable email/sms/push across all rules"
                >
                  MUTE ALL DISPATCH
                </button>
                <button
                  onClick={handleEnableAllRules}
                  className="px-2.5 py-1 rounded text-xs font-mono border border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/30"
                  title="Enable email/sms/push across all rules"
                >
                  ENABLE ALL DISPATCH
                </button>
                <button 
                  onClick={() => setRuleModalOpen(true)}
                  className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5 rounded"
                >
                  <Plus size={13} />
                  <span>ADD ESCALATION RULE</span>
                </button>
              </div>
            </div>

            <div className="notification-rules-list flex flex-col gap-3">
              {notificationRules.map((r) => (
                <div key={r.id} className="notification-rule-card border border-slate-800 bg-slate-950/40 p-4 rounded flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">{r.name}</span>
                      <span className={`status-badge-inline ${r.triggerSeverity === 'CRITICAL' ? 'badge-critical' : 'badge-warning'}`}>
                        {r.triggerSeverity}
                      </span>
                      <span className="text-xs text-muted">Delay: {r.escalationDelayMin}m</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-secondary mt-1">
                      <span className="flex items-center gap-1">
                        <Mail size={12} className={r.email ? 'text-emerald-400' : 'text-slate-600'} /> Email: {r.email ? 'ON' : 'OFF'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Smartphone size={12} className={r.sms ? 'text-emerald-400' : 'text-slate-600'} /> SMS: {r.sms ? 'ON' : 'OFF'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Send size={12} className={r.push ? 'text-emerald-400' : 'text-slate-600'} /> Push / Webhook: {r.push ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Recipients: {r.recipients.join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleToggleRule(r.id)}
                      className={`px-3 py-1 text-xs rounded border ${r.email ? 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20' : 'border-slate-700 text-slate-500'}`}
                    >
                      {r.email ? 'ACTIVE' : 'DISABLED'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: User Management */}
      {activeTab === 'users' && (
        <div className="settings-tab-content">
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-primary font-bold text-base">OPERATOR &amp; ANALYST ACCOUNTS</h2>
                <p className="text-secondary text-xs mt-1">
                  Manage certified telemetry operators, duty managers, and field data analysts.
                </p>
              </div>
              <button 
                onClick={() => setInviteModalOpen(true)}
                className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5 rounded"
              >
                <UserPlus size={13} />
                <span>INVITE USER</span>
              </button>
            </div>

            <div className="users-table-wrap">
              <table className="station-table">
                <thead>
                  <tr>
                    <th>USER</th>
                    <th>EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th>LAST ACTIVE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-800 text-primary flex items-center justify-center font-bold text-xs">
                            {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="font-bold text-primary">{u.name}</span>
                        </div>
                      </td>
                      <td className="text-secondary">{u.email}</td>
                      <td>
                        <span className={`status-badge-inline ${
                          u.role === 'Admin' ? 'badge-critical' :
                          u.role === 'Operator' ? 'badge-warning' :
                          u.role === 'Analyst' ? 'badge-neutral' : 'badge-neutral'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge-inline ${u.status === 'active' ? 'badge-healthy' : 'badge-neutral'}`}>
                          {u.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-muted">{u.lastActive}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleToggleUserStatus(u.id)}
                            className="text-xs text-secondary hover:text-primary px-2 py-1 rounded bg-slate-800/60"
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Roles & Permissions Matrix */}
      {activeTab === 'permissions' && (
        <div className="settings-tab-content">
          <div className="panel p-5">
            <div className="mb-4">
              <h2 className="text-primary font-bold text-base">SUPERVISORY ROLES &amp; CAPABILITIES MATRIX</h2>
              <p className="text-secondary text-xs mt-1">
                Fine-grained role-based access control (RBAC) across live telemetry and operational remediation commands.
              </p>
            </div>

            <div className="permissions-matrix-wrap">
              <table className="station-table">
                <thead>
                  <tr>
                    <th>ROLE</th>
                    <th className="text-center">VIEW STATIONS</th>
                    <th className="text-center">CONFIGURE STATIONS</th>
                    <th className="text-center">VIEW ALERTS</th>
                    <th className="text-center">MANAGE ALERTS</th>
                    <th className="text-center">VIEW ANALYTICS</th>
                    <th className="text-center">MODIFY THRESHOLDS</th>
                    <th className="text-center">MANAGE USERS</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MATRIX.map((row) => (
                    <tr key={row.role}>
                      <td className="font-bold text-primary">{row.role}</td>
                      <td className="text-center">{row.viewStations ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.configureStations ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.viewAlerts ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.manageAlerts ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.viewAnalytics ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.modifyThresholds ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                      <td className="text-center">{row.manageUsers ? <Check size={16} className="text-emerald-400 mx-auto" /> : <Minus size={16} className="text-slate-600 mx-auto" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Simulator & UI Preferences */}
      {activeTab === 'simulator' && (
        <div className="settings-tab-content">
          <div className="settings-cards-grid">
            {/* Connection Simulator */}
            <div className="settings-card panel">
              <div className="panel-header">
                <div className="panel-header-title">
                  <Wifi size={14} className="text-emerald-400" />
                  <span>WEBSOCKET &amp; DOWNLINK CONNECTION SIMULATOR</span>
                </div>
                <span className="badge-neutral">{connectionStatus.toUpperCase()}</span>
              </div>
              <div className="panel-body">
                <p className="settings-help-text text-secondary mb-3">
                  Verify mission control UI state indicators during downlink interruptions.
                </p>
                <div className="connection-state-buttons flex gap-2 mb-4">
                  <button
                    className={`conn-state-btn btn-live px-3 py-2 border rounded ${connectionStatus === 'live' ? 'border-emerald-500 bg-emerald-950/30 text-emerald-400' : 'border-slate-800 text-muted'}`}
                    onClick={() => onChangeConnectionStatus('live')}
                  >
                    LIVE WEBSOCKET
                  </button>
                  <button
                    className={`conn-state-btn btn-recon px-3 py-2 border rounded ${connectionStatus === 'reconnecting' ? 'border-amber-500 bg-amber-950/30 text-amber-400' : 'border-slate-800 text-muted'}`}
                    onClick={() => onChangeConnectionStatus('reconnecting')}
                  >
                    RECONNECTING LOOP
                  </button>
                  <button
                    className={`conn-state-btn btn-offline px-3 py-2 border rounded ${connectionStatus === 'offline' ? 'border-rose-500 bg-rose-950/30 text-rose-400' : 'border-slate-800 text-muted'}`}
                    onClick={() => onChangeConnectionStatus('offline')}
                  >
                    OFFLINE CACHED
                  </button>
                </div>

                <div className="stream-rate-label text-xs text-muted mb-2">TELEMETRY FRAME TICK RATE:</div>
                <div className="rate-selector-row flex gap-2">
                  {[500, 1000, 2000, 5000].map((rate) => (
                    <button
                      key={rate}
                      className={`px-3 py-1 border rounded text-xs ${streamRateMs === rate ? 'border-blue-500 text-blue-400 bg-blue-950/30' : 'border-slate-800 text-muted'}`}
                      onClick={() => onChangeStreamRate(rate)}
                    >
                      {rate}ms ({rate === 500 ? '2Hz' : rate === 1000 ? '1Hz' : `${(1000 / rate).toFixed(1)}Hz`})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Anomaly Injection Tool */}
            <div className="settings-card panel">
              <div className="panel-header">
                <div className="panel-header-title">
                  <AlertOctagon size={14} className="text-critical" />
                  <span>SYNTHETIC FAULT INJECTION ENGINE</span>
                </div>
                <span className="badge-critical">TRIGGER</span>
              </div>
              <div className="panel-body">
                <p className="settings-help-text text-secondary mb-4">
                  Inject live anomalies across RTU telemetry channels to test automated alert workflows and SHAP explainability pipelines.
                </p>
                <div className="flex gap-3">
                  <button onClick={onInjectAnomaly} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2 rounded">
                    <Sparkles size={14} />
                    <span>INJECT LIVE SENSOR ANOMALY</span>
                  </button>
                  <button onClick={onResetSimulation} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 rounded">
                    <RotateCcw size={14} />
                    <span>RESET ALL METRICS</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Theme & Display Preferences */}
            <div className="settings-card panel">
              <div className="panel-header">
                <div className="panel-header-title">
                  <Sun size={14} className="text-amber-400" />
                  <span>THEME &amp; OPERATOR DISPLAY MODE</span>
                </div>
              </div>
              <div className="panel-body">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-primary font-bold text-sm">Industrial Interface Theme</div>
                    <div className="text-secondary text-xs mt-1">Select between dark mission-control and light technical schema.</div>
                  </div>
                  <button onClick={onToggleTheme} className="btn-secondary text-xs flex items-center gap-2 px-4 py-2 rounded">
                    {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                    <span>{theme.toUpperCase()} MODE</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {inviteModalOpen && (
        <div className="modal-backdrop-fixed flex items-center justify-center p-4">
          <div className="modal-panel-card panel max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-primary font-bold text-base flex items-center gap-2">
                <UserPlus size={16} className="text-emerald-400" />
                <span>INVITE OPERATOR / ANALYST</span>
              </h3>
              <button onClick={() => setInviteModalOpen(false)} className="text-muted hover:text-primary">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleInviteUser} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-secondary mb-1 block">FULL NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Vance"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">ENTERPRISE EMAIL</label>
                <input
                  type="email"
                  required
                  placeholder="name@aether.io"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">ASSIGNED ROLE</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                >
                  <option value="Operator">Operator (Acknowledge &amp; Dispatch)</option>
                  <option value="Analyst">Analyst (View &amp; Export)</option>
                  <option value="Admin">Admin (Full Control)</option>
                  <option value="Viewer">Viewer (Read-only)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setInviteModalOpen(false)} className="btn-secondary px-3 py-1.5 text-xs rounded">
                  CANCEL
                </button>
                <button type="submit" className="btn-primary px-4 py-1.5 text-xs rounded">
                  SEND DISPATCH
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Notification Rule Modal */}
      {ruleModalOpen && (
        <div className="modal-backdrop-fixed flex items-center justify-center p-4">
          <div className="modal-panel-card panel max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-primary font-bold text-base flex items-center gap-2">
                <Bell size={16} className="text-amber-400" />
                <span>NEW ESCALATION RULE</span>
              </h3>
              <button onClick={() => setRuleModalOpen(false)} className="text-muted hover:text-primary">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateRule} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-secondary mb-1 block">RULE POLICY NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Turbine Vibration Breach"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">TRIGGER SEVERITY</label>
                <select
                  value={newRuleSeverity}
                  onChange={(e) => setNewRuleSeverity(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                >
                  <option value="CRITICAL">Critical Alerts Only</option>
                  <option value="WARNING">Warning &amp; Critical</option>
                  <option value="INFO">All Severity Levels</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">ESCALATION DELAY (MINUTES)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={newRuleDelay}
                  onChange={(e) => setNewRuleDelay(parseInt(e.target.value) || 5)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-secondary mb-1 block">NOTIFICATION RECIPIENTS (COMMA-SEPARATED)</label>
                <input
                  type="text"
                  required
                  value={newRuleRecipients}
                  onChange={(e) => setNewRuleRecipients(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-primary text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setRuleModalOpen(false)} className="btn-secondary px-3 py-1.5 text-xs rounded">
                  CANCEL
                </button>
                <button type="submit" className="btn-primary px-4 py-1.5 text-xs rounded">
                  ACTIVATE RULE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
