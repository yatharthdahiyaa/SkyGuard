import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import {
  Radio,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  Activity,
  AlertCircle
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { navigate } = useRouter();
  const [email, setEmail] = useState('duty-officer@imd.gov.in');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      if (onLoginSuccess) onLoginSuccess();
      navigate('/');
    }, 750);
  };

  const handleSsoLogin = () => {
    setError(null);
    setSsoLoading(true);
    setTimeout(() => {
      setSsoLoading(false);
      if (onLoginSuccess) onLoginSuccess();
      navigate('/');
    }, 950);
  };

  return (
    <div className="login-page-container">
      {/* Animated background blobs */}
      <div className="login-bg-overlay" />

      {/* Main IMD Authentication Card */}
      <div className="login-auth-card">

        {/* IMD Brand Header */}
        <div className="login-header-brand">
          {/* IMD Logo mark */}
          <div className="login-brand-icon-wrap">
            <Radio size={30} style={{ color: '#ff9933' }} />
          </div>

          {/* Title */}
          <h1 className="login-title font-sans">IMD SKYGUARD</h1>
          <div className="login-title-hindi font-sans">भारत मौसम विज्ञान विभाग</div>
          <p className="login-subtitle font-mono">
            AWS TELEMETRY OPERATIONS CONSOLE
          </p>

          {/* Official institution badge */}
          <div className="login-badge-strip">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: 'rgba(0, 51, 102, 0.07)',
                border: '1px solid rgba(0, 78, 153, 0.2)',
                borderRadius: '9999px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#004e99',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em'
              }}
            >
              <ShieldCheck size={12} />
              Ministry of Earth Sciences · Govt. of India · SkyGuard v2.4
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: 'rgba(220, 38, 38, 0.07)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '11.5px',
              marginBottom: '16px'
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Email / Operator ID */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              className="font-mono"
              style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}
            >
              OPERATOR IDENTIFIER / IMD ID
            </label>
            <div className="login-input-wrapper">
              <Mail size={15} className="login-input-icon" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="duty-officer@imd.gov.in"
                className="login-form-input font-mono"
              />
            </div>
          </div>

          {/* Passphrase */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label
                className="font-mono"
                style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}
              >
                SECURITY PASSPHRASE
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Contact the Duty Systems Administrator: duty-sysadmin@imd.gov.in for credential recovery.');
                }}
                style={{ fontSize: '11px', color: '#004e99', textDecoration: 'none', fontWeight: 600 }}
              >
                Forgot passphrase?
              </a>
            </div>
            <div className="login-input-wrapper">
              <Lock size={15} className="login-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter secure passphrase"
                className="login-form-input font-mono"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                className="login-input-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label
              className="font-sans"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#334155' }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: '#004e99', width: '14px', height: '14px' }}
              />
              <span>Keep session active (12 hours)</span>
            </label>
            <span
              className="font-mono"
              style={{
                fontSize: '9.5px',
                padding: '2px 7px',
                background: 'rgba(0, 78, 153, 0.07)',
                border: '1px solid rgba(0, 78, 153, 0.2)',
                borderRadius: '4px',
                color: '#004e99',
                fontWeight: 700
              }}
            >
              SEC-LEVEL 4
            </span>
          </div>

          {/* Primary login button */}
          <button
            type="submit"
            disabled={isLoading}
            className="login-submit-btn font-sans"
          >
            {isLoading ? (
              <>
                <Activity size={16} style={{ animation: 'spin-slow 1s linear infinite' }} />
                <span>AUTHENTICATING SESSION...</span>
              </>
            ) : (
              <>
                <span>ACCESS IMD SKYGUARD</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* OR divider */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            <span className="font-mono" style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          {/* IMD LDAP / eGov SSO */}
          <button
            type="button"
            disabled={ssoLoading}
            onClick={handleSsoLogin}
            className="login-sso-btn font-mono"
          >
            {ssoLoading ? (
              <>
                <Activity size={14} style={{ animation: 'spin-slow 1s linear infinite' }} />
                <span>CONNECTING TO eGov PORTAL...</span>
              </>
            ) : (
              <>
                <KeyRound size={14} style={{ color: '#004e99' }} />
                <span>SIGN IN WITH IMD LDAP / eGov PORTAL</span>
              </>
            )}
          </button>
        </form>

        {/* Card Footer — System Status */}
        <div className="login-card-footer font-sans">
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '11.5px', color: '#64748b' }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#138808',
                display: 'inline-block',
                boxShadow: '0 0 6px rgba(19, 136, 8, 0.6)'
              }}
            />
            <span>All AWS nodes operational · SkyGuard v2.4</span>
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', lineHeight: 1.4 }}
          >
            Authorized IMD personnel only · MEITY IT Act 2000 · CyberSuraksha compliant
          </div>
        </div>
      </div>
    </div>
  );
};
