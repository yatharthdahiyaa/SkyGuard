import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
  params: Record<string, string>;
}

const RouterContext = createContext<RouterContextType>({
  path: '/',
  navigate: () => {},
  params: {}
});

export function matchRoute(pattern: string, actualPath: string): { matches: boolean; params: Record<string, string> } {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = actualPath.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matches: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return { matches: false, params: {} };
    }
  }

  return { matches: true, params };
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getInitialPath = (): string => {
    // Check window.location.hash first (e.g., #/stations/st-01)
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      return window.location.hash.slice(1);
    }
    return window.location.pathname || '/';
  };

  const [path, setPath] = useState<string>(getInitialPath);

  useEffect(() => {
    const handlePopState = () => {
      setPath(getInitialPath());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigate = (to: string) => {
    if (to === path) return;
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const params = useMemo(() => {
    // Check patterns like /stations/:stationId
    const stationMatch = matchRoute('/stations/:stationId', path);
    if (stationMatch.matches) return stationMatch.params;

    // Check patterns like /alerts/:alertId
    const alertMatch = matchRoute('/alerts/:alertId', path);
    if (alertMatch.matches) return alertMatch.params;

    return {};
  }, [path]);

  return (
    <RouterContext.Provider value={{ path, navigate, params }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => useContext(RouterContext);

export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({
  to,
  children,
  className,
  onClick,
  ...rest
}) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      navigate(to);
    }
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
};
