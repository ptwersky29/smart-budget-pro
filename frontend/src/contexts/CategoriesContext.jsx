import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";
import { cacheGetEntry } from "../lib/cache";
import { useAuth } from "./AuthContext";
import {
  buildFallbackCategory,
  buildSectionOptions,
  slugifyCategoryName,
  withCategoryEmoji,
} from "../lib/categories";

const CategoriesContext = createContext(null);

export function CategoriesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  // /auth/me may replace a cached profile object with a fresh object for the
  // same account. Use stable identity for category loading and deduplication.
  const userKey = user ? String(user.user_id || user.id || user.email || "authenticated") : null;
  const inFlightRef = useRef(new Map());
  const previousUserKeyRef = useRef(userKey);
  const cachedCategories = cacheGetEntry("/categories", {})?.data;
  const [categories, setCategories] = useState(() =>
    (cachedCategories?.categories || []).map(withCategoryEmoji)
  );
  const [hierarchy, setHierarchy] = useState(() => cachedCategories?.hierarchy || {});
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const refreshCategories = useCallback(async ({ silent = false } = {}) => {
    if (!userKey) {
      setCategories([]);
      setHierarchy({});
      setLoading(false);
      return { categories: [], hierarchy: {} };
    }

    // Avoid duplicate startup requests when auth refreshes the profile object
    // or React replays an effect. One request per signed-in account at a time.
    const existing = inFlightRef.current.get(userKey);
    if (existing) return existing;

    const request = (async () => {
      const hasCached = Boolean(cacheGetEntry("/categories", {})?.data);
      if (!hasCached) setLoading(true);
      try {
        const { data } = await api.swrGet("/categories", {}, 5 * 60_000).fresh;
        const nextCategories = (data.categories || []).map(withCategoryEmoji);
        const nextHierarchy = data.hierarchy || {};
        setCategories(nextCategories);
        setHierarchy(nextHierarchy);
        setVersion((current) => current + 1);
        return { categories: nextCategories, hierarchy: nextHierarchy };
      } catch (error) {
        const message = formatApiError(error);
        // Category loading is optional during shell startup. Keep cached or
        // built-in categories visible; explicit refreshes can still show errors.
        if (!silent) toast.error(message);
        throw error;
      } finally {
        setLoading(false);
      }
    })();

    inFlightRef.current.set(userKey, request);
    try {
      return await request;
    } finally {
      if (inFlightRef.current.get(userKey) === request) {
        inFlightRef.current.delete(userKey);
      }
    }
  }, [userKey]);

  useEffect(() => {
    if (authLoading) return;
    if (!userKey) {
      setCategories([]);
      setHierarchy({});
      setLoading(false);
      previousUserKeyRef.current = null;
      return;
    }
    if (previousUserKeyRef.current && previousUserKeyRef.current !== userKey) {
      setCategories([]);
      setHierarchy({});
    }
    previousUserKeyRef.current = userKey;
    // A failed optional categories request must not cover the app with a
    // generic toast each time it opens. The picker offers a retryable fallback.
    refreshCategories({ silent: true }).catch(() => {});
  }, [authLoading, userKey, refreshCategories]);

  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach((category) => {
      if (category?.name) map[category.name] = category;
    });
    return map;
  }, [categories]);

  const groupedCategories = useMemo(() => {
    const groups = {};
    categories.forEach((category) => {
      const section = category.section || "🧩 Ungrouped";
      if (!groups[section]) groups[section] = [];
      groups[section].push(category);
    });
    Object.values(groups).forEach((items) => {
      items.sort((a, b) => (a.label || a.name || "").localeCompare(b.label || b.name || ""));
    });
    return groups;
  }, [categories]);

  const resolveCategory = useCallback((value, overrides = {}) => {
    if (!value) return buildFallbackCategory("uncategorized", overrides);
    const normalized = slugifyCategoryName(value);
    const stored = categoryMap[normalized] || categoryMap[value];
    return stored ? withCategoryEmoji({ ...stored, ...overrides }) : buildFallbackCategory(value, overrides);
  }, [categoryMap]);

  const getReplacementOptions = useCallback((currentName) => {
    return categories.filter((category) => !category.is_archived && category.name !== currentName);
  }, [categories]);

  const mutateAndRefresh = useCallback(async (requestFn) => {
    const result = await requestFn();
    api.invalidate("/categories");
    api.invalidate("/transactions");
    api.invalidate("/budgets");
    api.invalidate("/dashboard/overview");
    await refreshCategories({ silent: true });
    return result;
  }, [refreshCategories]);

  const createCategory = useCallback(async (payload) => {
    return mutateAndRefresh(async () => {
      const { data } = await api.post("/categories", payload);
      return data?.category || data;
    });
  }, [mutateAndRefresh]);

  const updateCategory = useCallback(async (categoryId, payload) => {
    return mutateAndRefresh(async () => {
      const { data } = await api.patch(`/categories/${categoryId}`, payload);
      return data?.category || data;
    });
  }, [mutateAndRefresh]);

  const deleteCategory = useCallback(async (categoryId) => {
    return mutateAndRefresh(async () => {
      const { data } = await api.delete(`/categories/${categoryId}`);
      return data;
    });
  }, [mutateAndRefresh]);

  const reassignDeleteCategory = useCallback(async (categoryId, payload) => {
    return mutateAndRefresh(async () => {
      const { data } = await api.post(`/categories/${categoryId}/reassign-delete`, payload);
      return data;
    });
  }, [mutateAndRefresh]);

  const sectionOptions = useMemo(() => buildSectionOptions(categories), [categories]);

  const value = useMemo(() => ({
    categories,
    categoryMap,
    groupedCategories,
    hierarchy,
    loading,
    version,
    sectionOptions,
    resolveCategory,
    getReplacementOptions,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reassignDeleteCategory,
    slugifyCategoryName,
  }), [
    categories,
    categoryMap,
    groupedCategories,
    hierarchy,
    loading,
    version,
    sectionOptions,
    resolveCategory,
    getReplacementOptions,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reassignDeleteCategory,
  ]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error("useCategories must be used within CategoriesProvider");
  }
  return context;
}
