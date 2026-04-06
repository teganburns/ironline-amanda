import { useEffect, useState, type DependencyList } from "react";

export function useAsyncData<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const next = await loader();
        if (!cancelled) {
          setData(next);
        }
      } catch (nextError: any) {
        if (!cancelled) {
          setError(nextError?.message ?? "Unable to load data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [...deps, reloadToken]);

  return {
    data,
    loading,
    error,
    reload() {
      setReloadToken((value) => value + 1);
    },
    setData,
  };
}
