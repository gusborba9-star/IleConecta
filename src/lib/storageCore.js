export function createSafeStorage(storageProvider, namespace) {
  const prefix = `${namespace}:`;

  function getStorage() {
    try {
      return storageProvider();
    } catch {
      return null;
    }
  }

  function removeCorrupt(storage, key, raw) {
    try {
      if (typeof raw === "string") storage.setItem(`${prefix}recovery:${key}`, raw);
    } catch {
      // A full/unavailable storage may prevent preserving a recovery copy.
    }
    try {
      storage.removeItem(`${prefix}${key}`);
    } catch {
      // Recovery is best-effort when storage itself is failing.
    }
  }

  return {
    loadKey(key, fallback, validate = () => true) {
      const storage = getStorage();
      if (!storage) return fallback;

      let raw;
      try {
        raw = storage.getItem(`${prefix}${key}`);
      } catch {
        return fallback;
      }
      if (raw === null) return fallback;

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        removeCorrupt(storage, key, raw);
        return fallback;
      }

      try {
        if (!validate(parsed)) {
          removeCorrupt(storage, key, raw);
          return fallback;
        }
      } catch {
        removeCorrupt(storage, key, raw);
        return fallback;
      }
      return parsed;
    },

    saveKey(key, value) {
      const storage = getStorage();
      if (!storage) return false;
      try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) return false;
        storage.setItem(`${prefix}${key}`, serialized);
        return true;
      } catch {
        return false;
      }
    },

    clearAll() {
      const storage = getStorage();
      if (!storage) return false;
      try {
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(prefix)) keys.push(key);
        }
        keys.forEach((key) => storage.removeItem(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}
