import React, { useState } from 'react';
import { ViewType, WsStatus } from '../../types/telemetry';
import { ConnectionStatusBadge } from '../telemetry/ConnectionStatusBadge';
import { useRouter } from '../../context/RouterContext';
import { 
  LayoutDashboard, 
  Radio, 
  AlertOctagon, 
  MapPin, 
  BarChart3, 
  Settings as SettingsIcon, 
  Menu, 
  X, 
  Search, 
  Bell, 
  LogOut, 
  Sun, 
  Moon, 
  ShieldCheck, 
  ChevronRight,
  Activity,
  Cpu,
  Layers
} from '../icons';

interface AppShellProps {
  currentView?: ViewType;
  onNavigate?: (view: ViewType) => void;
  connectionStatus: WsStatus;
  lastMessageAt: string | null;
  activeCriticalAlertsCount: number;
  totalAlertsCount: number;
  stationsCount?: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onOpenCommandPalette: () => void;
  onOpenLogoutModal: () => void;
  onOpenSettingsModal: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  connectionStatus,
  lastMessageAt,
  activeCriticalAlertsCount,
  totalAlertsCount,
  stationsCount = 54,
  theme = 'light',
  onToggleTheme,
  onOpenCommandPalette,
  onOpenLogoutModal,
  onOpenSettingsModal,
  children
}) => {
  const { path, navigate } = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const navItems = [
    { id: 'overview' as ViewType, path: '/', label: 'Overview', icon: LayoutDashboard, badge: null },
    { id: 'stations' as ViewType, path: '/stations', label: 'Stations', icon: Radio, badge: `${stationsCount} RTU` },
    { 
      id: 'alerts' as ViewType, 
      path: '/alerts',
      label: 'Alerts', 
      icon: AlertOctagon, 
      badge: activeCriticalAlertsCount > 0 ? `${activeCriticalAlertsCount} CRIT` : null,
      badgeType: 'critical'
    },
    { id: 'network-map' as ViewType, path: '/map', label: 'Network Map', icon: MapPin, badge: 'MESH' },
    { id: 'analytics' as ViewType, path: '/analytics', label: 'Analytics', icon: BarChart3, badge: null },
    { id: 'settings' as ViewType, path: '/settings', label: 'Settings', icon: SettingsIcon, badge: null },
  ];

  const isNavActive = (item: typeof navItems[0]) => {
    if (item.path === '/') {
      return path === '/' || currentView === 'overview';
    }
    return path.startsWith(item.path) || currentView === item.id;
  };

  const handleNavClick = (item: typeof navItems[0]) => {
    navigate(item.path);
    if (onNavigate) onNavigate(item.id);
    setMobileMenuOpen(false);
  };

  return (
    <div className={`app-container ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div className="mobile-overlay-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* 2.1 Sidebar */}
      <aside className={`app-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand-header">
          <div className="brand-logo-cluster cursor-pointer" onClick={() => navigate('/')}>
            <div className="brand-icon-box" style={{ background: 'linear-gradient(135deg, #003366 0%, #004e99 100%)', borderColor: '#ff9933' }}>
              <Radio size={16} className="text-[#ff9933]" />
            </div>
            {!sidebarCollapsed && (
              <div className="brand-text-block">
                <div className="brand-title font-sans font-bold flex items-center gap-1.5 text-[#003366]">
                  <span>IMD SKYGUARD</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-orange-50 text-[#ea580c] border border-orange-200 rounded font-mono font-bold">AWS</span>
                </div>
                <div className="brand-subtitle font-sans text-slate-500 text-[9.5px] tracking-normal font-medium">भारत मौसम विज्ञान विभाग · MoES</div>
              </div>
            )}
          </div>
          <button 
            className="sidebar-collapse-toggle desktop-only"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <Menu size={16} />
          </button>
          <button 
            className="sidebar-close-btn mobile-only"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Line Banner */}
        {!sidebarCollapsed && (
          <div className="sidebar-status-banner font-sans">
            <div className="pulse-indicator-group">
              <span className="live-dot-pulse" style={{ backgroundColor: '#138808' }} />
              <span className="status-banner-text" style={{ color: '#138808', fontWeight: 600 }}>SYNOPTIC AWS NETWORK</span>
            </div>
            <span className="status-grid-rate font-mono text-[#ea580c] font-bold">16 NODES</span>
          </div>
        )}

        {/* Navigation List */}
        <nav className="sidebar-nav">
          <div className="nav-section-label font-mono">
            {!sidebarCollapsed && 'TELEMETRY SUBSYSTEMS'}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item);
            return (
              <button
                key={item.id}
                className={`nav-item-btn ${active ? 'nav-active' : ''}`}
                onClick={() => handleNavClick(item)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <div className="nav-icon-wrapper">
                  <Icon size={17} strokeWidth={active ? 2.3 : 1.8} />
                </div>
                {!sidebarCollapsed && (
                  <span className="nav-label font-mono">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <span className={`nav-badge font-mono ${item.badgeType === 'critical' ? 'badge-critical' : 'badge-neutral'}`}>
                    {item.badge}
                  </span>
                )}
                {active && <div className="nav-active-pip" />}
              </button>
            );
          })}
        </nav>

        {/* 2.2 Sidebar Bottom User Area */}
        <div className="sidebar-footer-user">
          <div className="user-profile-card">
            <div className="user-avatar-container">
              <div className="user-avatar font-mono" style={{ background: '#f0f7ff', color: '#003366', borderColor: '#cbd5e1' }}>DO</div>
              <span className="user-online-dot" />
            </div>
            {!sidebarCollapsed && (
              <div className="user-meta-info">
                <div className="user-name font-mono text-[#003366]">Duty Officer</div>
                <div className="user-role font-mono text-slate-500">AWS Telemetry Operations</div>
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="user-actions-group">
                <button 
                  onClick={() => navigate('/settings')} 
                  className="user-quick-action-btn"
                  title="Station Settings"
                >
                  <SettingsIcon size={14} />
                </button>
                <button 
                  onClick={onOpenLogoutModal} 
                  className="user-quick-action-btn logout"
                  title="Logout / Terminate Session"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-viewport">
        {/* 2.3 Top Navigation Bar */}
        <header className="app-top-header">
          <div className="gov-tricolor-strip" />
          <div className="header-left">
            <button 
              className="mobile-hamburger-btn mobile-only"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            {/* Global Search Button / Trigger */}
            <button 
              className="global-search-trigger font-mono"
              onClick={onOpenCommandPalette}
            >
              <Search size={14} className="text-secondary" />
              <span className="search-placeholder">Search stations, alerts, sensors...</span>
              <kbd className="search-kbd">Ctrl K</kbd>
            </button>
          </div>

          <div className="header-right">
            {/* 2.4 Connection Status Badge */}
            <ConnectionStatusBadge 
              status={connectionStatus} 
              lastMessageAt={lastMessageAt} 
            />

            {/* Network Health Indicator */}
            <div className="network-health-pill font-mono desktop-only border-slate-200 bg-slate-50/80">
              <ShieldCheck size={13} className="text-[#138808]" />
              <span className="health-grid-text text-[#003366]">IMD GRID NOMINAL</span>
              <span className="health-divider">·</span>
              <span className="health-stat text-slate-700">16 STATIONS</span>
              <span className="health-divider">·</span>
              <span className="health-stat text-[#138808] font-bold">99.98%</span>
            </div>

            {/* Active Critical Alert Counter */}
            <button 
              className={`critical-alert-counter-btn font-mono ${activeCriticalAlertsCount > 0 ? 'has-critical' : ''}`}
              onClick={() => navigate('/alerts')}
              title={`${activeCriticalAlertsCount} Active Critical Alerts`}
            >
              <AlertOctagon size={14} />
              <span>{activeCriticalAlertsCount} RED ALERT</span>
            </button>

            {/* Notification Bell with Dropdown */}
            <div className="notification-dropdown-wrapper">
              <button 
                className={`header-icon-btn ${notificationsOpen ? 'active' : ''}`}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                title="System Notifications"
              >
                <Bell size={16} />
                {totalAlertsCount > 0 && <span className="notification-counter-dot" />}
              </button>

              {notificationsOpen && (
                <div className="header-dropdown-menu panel font-mono">
                  <div className="dropdown-header">
                    <span>TELEMETRY BUS EVENTS ({totalAlertsCount})</span>
                    <button onClick={() => setNotificationsOpen(false)} className="close-dropdown-btn">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="dropdown-event-list">
                    <div className="dropdown-event-item cursor-pointer" onClick={() => { navigate('/alerts/alt-8092'); setNotificationsOpen(false); }}>
                      <div className="event-top">
                        <span className="text-critical font-bold">ALT-8092 · DEWPOINT BREACH</span>
                        <span className="text-muted">4m ago</span>
                      </div>
                      <p className="event-desc text-secondary">Sector 4 Alpine Ridge RTU violates Magnus equation.</p>
                    </div>
                    <div className="dropdown-event-item cursor-pointer" onClick={() => { navigate('/alerts/alt-8088'); setNotificationsOpen(false); }}>
                      <div className="event-top">
                        <span className="text-warning font-bold">ALT-8088 · TRANSDUCER FLATLINE</span>
                        <span className="text-muted">38m ago</span>
                      </div>
                      <p className="event-desc text-secondary">Klickitat Hydro Gateway 0.00 hPa variance detected.</p>
                    </div>
                  </div>
                  <div className="dropdown-footer">
                    <button onClick={() => { navigate('/alerts'); setNotificationsOpen(false); }} className="view-all-alerts-btn">
                      OPEN INCIDENT TRIAGE →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Quick Menu */}
            <div className="user-menu-wrapper">
              <button 
                className="header-avatar-btn"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                aria-label="User Menu"
              >
                <div className="user-avatar-small font-mono">DO</div>
              </button>

              {profileMenuOpen && (
                <div className="header-dropdown-menu profile-menu panel font-mono">
                  <div className="profile-menu-header">
                    <div className="profile-name">Duty Meteorological Officer</div>
                    <div className="profile-sub text-muted">ID: IMD-MET-4200 · Regional AWS Center</div>
                  </div>
                  <div className="profile-menu-body">
                    <button 
                      className="profile-menu-item"
                      onClick={() => { navigate('/settings'); setProfileMenuOpen(false); }}
                    >
                      <SettingsIcon size={14} />
                      <span>Telemetry Thresholds</span>
                    </button>
                    <button 
                      className="profile-menu-item text-critical"
                      onClick={() => { onOpenLogoutModal(); setProfileMenuOpen(false); }}
                    >
                      <LogOut size={14} />
                      <span>Terminate Session</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View Surface Content */}
        <main className="app-content-surface">
          {children}
        </main>
      </div>
    </div>
  );
};
