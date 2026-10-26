import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { DEFAULT_CONFIG, fetchIsAdmin, fetchPlatformConfig, type PlatformConfig } from "@/lib/platformConfig";

interface Ctx {
  config: PlatformConfig;
  isAdmin: boolean;
  reload: () => Promise<void>;
}

const PlatformConfigContext = createContext<Ctx>({ config: DEFAULT_CONFIG, isAdmin: false, reload: async () => {} });

export function PlatformConfigProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id;
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [isAdmin, setIsAdmin] = useState(false);

  const reload = useCallback(async () => {
    setConfig(await fetchPlatformConfig());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPlatformConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    let alive = true;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    fetchIsAdmin().then((v) => alive && setIsAdmin(v));
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo(() => ({ config, isAdmin, reload }), [config, isAdmin, reload]);
  return <PlatformConfigContext.Provider value={value}>{children}</PlatformConfigContext.Provider>;
}

export const usePlatformConfig = () => useContext(PlatformConfigContext);
