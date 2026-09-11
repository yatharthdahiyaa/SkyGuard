import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import { 
  Cpu, 
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
  const [email, setEmail] = useState('operator@aether.io');
  const [password, setPassword] = useState('••••••••••••');
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
    }, 700);
  };

  const handleSsoLogin = () => {
    setError(null);
    setSsoLoading(true);
    setTimeout(() => {
      setSsoLoading(false);
      if (onLoginSuccess) onLoginSuccess();
      navigate('/');
    }, 900);
  };

  return (
    <div className="login-page-container font-mono">
      {/* Background Grid Accent */}
      <div className="login-bg-overlay" />

      {/* Main Authentication Card */}
      <div className="login-auth-card panel">
        {/* Header Branding */}
        <div className="login-header-brand">
          <div className="brand-logo-cluster justify-center mb-2">
            <div className="brand-icon-box p-2 bg-slate-900 border border-emerald-500/40 rounded-lg">
              <Cpu size={28} className="text-emerald-400 animate-pulse" />
            </div>
          </div>
          <h1 className="login-title text-xl font-bold text-primary tracking-wider">AETHER</h1>
          <p className="login-subtitle text-xs text-secondary mt-1">
            INDUSTRIAL INTELLIGENCE MISSION CONTROL
          </p>
          <div className="login-badge-strip mt-2">
            <span className="badge-neutral text-xs">PACIFIC NORTHWEST TELEMETRY CLUSTER · v4.2.0-CORE</span>
          </div>
        </div>

        {error && (
          <div className="login-error-alert badge-critical p-3 rounded text-xs flex items-center gap-2 mb-4">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="login-form flex flex-col gap-4 mt-4">
          <div className="form-group">
            <label className="form-label text-xs text-secondary block mb-1">
              OPERATOR IDENTIFIER / EMAIL
            </label>
            <div className="input-with-icon relative">
              <Mail size={15} className="input-icon-left text-muted absolute left-3 top-3" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@aether.io"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded font-mono text-primary text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="form-group">
            <div className="flex items-center justify-between mb-1">
              <label className="form-label text-xs text-secondary block">
                SECURITY PASSPHRASE / KEY
              </label>
              <a 
                href="#forgot" 
                onClick={(e) => { e.preventDefault(); alert('Please contact Duty Systems Administrator (duty-ops@skyguard.gov.in) for credentials recovery.'); }}
                className="text-xs text-emerald-400 hover:underline"
              >
                Forgot key?
              </a>
            </div>
            <div className="input-with-icon relative">
              <Lock size={15} className="input-icon-left text-muted absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded font-mono text-primary text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                className="password-toggle-btn absolute right-3 top-3 text-muted hover:text-primary"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500"
              />
              <span>Remember station session (12h)</span>
            </label>
            <span className="text-xs text-muted">SEC-LEVEL 4</span>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-2.5 rounded text-sm font-bold flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <>
                <Activity size={16} className="animate-spin text-primary" />
                <span>AUTHENTICATING TELEMETRY SESSION...</span>
              </>
            ) : (
              <>
                <span>ACCESS MISSION CONTROL</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>

          <div className="divider-or-row flex items-center gap-3 my-1">
            <div className="h-px bg-slate-800 flex-1" />
            <span className="text-xs text-muted">OR</span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>

          {/* Industrial SSO Button */}
          <button
            type="button"
            disabled={ssoLoading}
            onClick={handleSsoLogin}
            className="btn-secondary w-full py-2 rounded text-xs flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-600"
          >
            {ssoLoading ? (
              <>
                <Activity size={14} className="animate-spin" />
                <span>CONNECTING SAML IDENTITY PROVIDER...</span>
              </>
            ) : (
              <>
                <KeyRound size={14} className="text-blue-400" />
                <span>SIGN IN WITH INDUSTRIAL SSO (SAML 2.0)</span>
              </>
            )}
          </button>
        </form>

        {/* Card Footer System Status */}
        <div className="login-card-footer mt-6 pt-4 border-t border-slate-800/80 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <span className="status-dot healthy" />
            <span>All systems operational · v4.2.0-core</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Authorized telemetry engineering access only · NIST SP 800-82 Rev 3
          </div>
        </div>
      </div>
    </div>
  );
};
