import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  buildFallbackCategory,
  buildSectionOptions,
  slugifyCategoryName,
} from "../lib/categories";

const CategoriesContext = createContext(null);

export function CategoriesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState([]);
  const [hierarchy, setHierarchy] = useState({});
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const refreshCategories = useCallback(async ({ silent = false } = {}) => {
    if (!user) {
      setCategories([]);
      setHierarchy({});
      return { categories: [], hierarchy: {} };
    }

    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/categories");
      const nextCategories = data.categories || [];
      const nextHierarchy = data.hierarchy || {};
      setCategories(nextCategories);
      setHierarchy(nextHierarchy);
      setVersion((current) => current + 1);
      return { categories: nextCategories, hierarchy: nextHierarchy };
    } catch (error) {
      if (!silent) {
        toast.error(formatApiError(error?.response?.data?.detail));
      }
      throw error;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCategories([]);
      setHierarchy({});
      return;
    }
    refreshCategories({ silent: false }).catch(() => {});
  }, [authLoading, user, refreshCategories]);

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
    return categoryMap[normalized] || categoryMap[value] || buildFallbackCategory(value, overrides);
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
