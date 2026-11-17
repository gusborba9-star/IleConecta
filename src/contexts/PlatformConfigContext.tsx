import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { DEFAULT_CONFIG, fetchAdminAccess, fetchIsAdmin, fetchPlatformConfig, type PlatformConfig } from "@/lib/platformConfig";
import { canModule, NO_ACCESS, type AdminAccess } from "@/lib/adminAccessCore";

interface Ctx {
  config: PlatformConfig;
  isAdmin: boolean;
  access: AdminAccess;
  /** true se a conta é dona ou tem o módulo ("dono" = só o dono). */
  can: (module: string) => boolean;
  reload: () => Promise<void>;
}

const PlatformConfigContext = createContext<Ctx>({ config: DEFAULT_CONFIG, isAdmin: false, access: NO_ACCESS, can: () => false, reload: async () => {} });

export function PlatformConfigProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id;
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [isAdmin, setIsAdmin] = useState(false);
  const [access, setAccess] = useState<AdminAccess>(NO_ACCESS);

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
      setAccess(NO_ACCESS);
      return;
    }
    fetchIsAdmin().then((v) => alive && setIsAdmin(v));
    fetchAdminAccess().then((v) => alive && setAccess(v));
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo(() => ({ config, isAdmin, access, can: (m: string) => canModule(access, m), reload }), [config, isAdmin, access, reload]);
  return <PlatformConfigContext.Provider value={value}>{children}</PlatformConfigContext.Provider>;
}

export const usePlatformConfig = () => useContext(PlatformConfigContext);
