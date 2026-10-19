/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  Plus,
  Search,
  Filter,
  ExternalLink,
  Edit2,
  Trash2,
  Power,
  FolderTree,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  Loader2,
  Image as ImageIcon,
  X,
} from "lucide-react";

interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: {
    items: number;
  };
}

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number | string;
  imageUrl: string | null;
  isAvailable: boolean;
  useCustomTaxRate?: boolean;
  taxRate?: number | string | null;
  category: {
    id: string;
    name: string;
    isActive?: boolean;
  };
}

interface RestaurantMenuManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    gstEnabled?: boolean;
    taxRate?: number;
    taxMode?: "EXCLUSIVE" | "INCLUSIVE";
  };
  initialCategories: CategoryItem[];
  initialItems: MenuItem[];
}

export function RestaurantMenuManager({
  restaurant,
  initialCategories,
  initialItems,
}: RestaurantMenuManagerProps) {
  const [activeTab, setActiveTab] = useState<"items" | "categories">("items");
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  // Notification banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Category Modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState<string>("0");
  const [categoryIsActive, setCategoryIsActive] = useState(true);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  // Menu Item Modal state
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState("");
  const [itemIsAvailable, setItemIsAvailable] = useState(true);
  const [itemUseCustomTaxRate, setItemUseCustomTaxRate] = useState(false);
  const [itemCustomTaxRate, setItemCustomTaxRate] = useState("5.00");
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (itemModalOpen || categoryModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [itemModalOpen, categoryModalOpen]);

  async function refreshData() {
    setLoading(true);
    try {
      const [catRes, itemsRes] = await Promise.all([
        fetch(`/api/restaurants/${restaurant.id}/categories`),
        fetch(`/api/restaurants/${restaurant.id}/items`),
      ]);
      const catData = await catRes.json();
      const itemsData = await itemsRes.json();

      if (catData.success) setCategories(catData.data);
      if (itemsData.success) setItems(itemsData.data);
    } catch {
      setErrorMsg("Failed to refresh menu data.");
    } finally {
      setLoading(false);
    }
  }

  // --- Category Handlers ---
  function openAddCategoryModal() {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDescription("");
    setCategorySortOrder(String(categories.length * 10));
    setCategoryIsActive(true);
    setErrorMsg(null);
    setCategoryModalOpen(true);
  }

  function openEditCategoryModal(cat: CategoryItem) {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryDescription(cat.description || "");
    setCategorySortOrder(String(cat.sortOrder));
    setCategoryIsActive(cat.isActive);
    setErrorMsg(null);
    setCategoryModalOpen(true);
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryName.trim()) {
      setErrorMsg("Category name is required.");
      return;
    }
    setCategorySubmitting(true);
    setErrorMsg(null);

    const isEditing = !!editingCategory;
    const url = isEditing
      ? `/api/restaurants/${restaurant.id}/categories/${editingCategory.id}`
      : `/api/restaurants/${restaurant.id}/categories`;
    const method = isEditing ? "PATCH" : "POST";

    const parsedSortOrder = categorySortOrder === "" ? 0 : parseInt(categorySortOrder, 10);
    const safeSortOrder = isNaN(parsedSortOrder) || parsedSortOrder < 0 ? 0 : parsedSortOrder;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryName.trim(),
          description: categoryDescription.trim() || null,
          sortOrder: safeSortOrder,
          isActive: categoryIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to save category.");
        return;
      }

      setCategoryModalOpen(false);
      setSuccessMsg(isEditing ? "Category updated successfully." : "Category created successfully.");
      await refreshData();
    } catch {
      setErrorMsg("Network error while saving category.");
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleDeleteCategory(cat: CategoryItem) {
    if (
      !confirm(
        `Are you sure you want to delete category "${cat.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `/api/restaurants/${restaurant.id}/categories/${cat.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to delete category.");
        return;
      }

      setSuccessMsg(data.message || "Category deleted successfully.");
      await refreshData();
    } catch {
      setErrorMsg("Network error while deleting category.");
    }
  }

  // --- Menu Item Handlers ---
  function openAddItemModal() {
    setEditingItem(null);
    setItemName("");
    setItemDescription("");
    setItemPrice("");
    setItemCategoryId(categories[0]?.id || "");
    setItemImageUrl("");
    setItemIsAvailable(true);
    setItemUseCustomTaxRate(false);
    setItemCustomTaxRate(
      restaurant.taxRate !== undefined && restaurant.taxRate !== null
        ? String(restaurant.taxRate)
        : "5.00"
    );
    setImageUploadError(null);
    setShowManualUrlInput(false);
    setErrorMsg(null);
    setItemModalOpen(true);
  }

  function openEditItemModal(item: MenuItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemPrice(String(item.price));
    setItemCategoryId(item.categoryId);
    setItemImageUrl(item.imageUrl || "");
    setItemIsAvailable(item.isAvailable);
    setItemUseCustomTaxRate(Boolean(item.useCustomTaxRate));
    setItemCustomTaxRate(
      item.taxRate !== null && item.taxRate !== undefined
        ? String(item.taxRate)
        : restaurant.taxRate !== undefined && restaurant.taxRate !== null
        ? String(restaurant.taxRate)
        : "5.00"
    );
    setImageUploadError(null);
    setShowManualUrlInput(false);
    setErrorMsg(null);
    setItemModalOpen(true);
  }

  async function handleImageFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploadError(null);

    // Client-side validations
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setImageUploadError("Unsupported file type. Please upload a JPG, PNG, or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("File is too large. Maximum allowed size is 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Upload to server
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/restaurants/${restaurant.id}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setImageUploadError(data.error || "Failed to upload image. Please try again.");
        return;
      }

      setItemImageUrl(data.data.url);
    } catch {
      setImageUploadError("Network error while uploading image. Please check your connection.");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim() || !itemPrice || !itemCategoryId) {
      setErrorMsg("Please fill in all required fields (Name, Price, Category).");
      return;
    }

    const priceNum = parseFloat(itemPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Please enter a valid positive price.");
      return;
    }

    const parsedCustomTax = parseFloat(itemCustomTaxRate);
    if (
      itemUseCustomTaxRate &&
      (isNaN(parsedCustomTax) || parsedCustomTax < 0 || parsedCustomTax > 28)
    ) {
      setErrorMsg("Please enter a valid GST rate between 0% and 28%.");
      return;
    }

    setItemSubmitting(true);
    setErrorMsg(null);

    const isEditing = !!editingItem;
    const url = isEditing
      ? `/api/restaurants/${restaurant.id}/items/${editingItem.id}`
      : `/api/restaurants/${restaurant.id}/items`;
    const method = isEditing ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: itemCategoryId,
          name: itemName.trim(),
          description: itemDescription.trim() || null,
          price: priceNum,
          imageUrl: itemImageUrl.trim() || null,
          isAvailable: itemIsAvailable,
          useCustomTaxRate: itemUseCustomTaxRate,
          taxRate: itemUseCustomTaxRate ? parsedCustomTax : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to save menu item.");
        return;
      }

      setItemModalOpen(false);
      setSuccessMsg(isEditing ? "Menu item updated successfully." : "Menu item added successfully.");
      await refreshData();
    } catch {
      setErrorMsg("Network error while saving menu item.");
    } finally {
      setItemSubmitting(false);
    }
  }

  async function handleToggleItemAvailability(item: MenuItem) {
    const nextState = !item.isAvailable;
    try {
      const res = await fetch(
        `/api/restaurants/${restaurant.id}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAvailable: nextState }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to update availability.");
        return;
      }
      await refreshData();
    } catch {
      setErrorMsg("Network error updating item status.");
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/restaurants/${restaurant.id}/items/${item.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to delete item.");
        return;
      }
      setSuccessMsg(`"${item.name}" deleted.`);
      await refreshData();
    } catch {
      setErrorMsg("Network error while deleting item.");
    }
  }

  // Filtered Items
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategoryFilter === "all" || item.categoryId === selectedCategoryFilter;
    if (!matchesCategory) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      (item.description && item.description.toLowerCase().includes(term))
    );
  });

  const availableCount = items.filter((i) => i.isAvailable).length;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Menu & Categories</span>
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
              {restaurant.name}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Create categories, manage dishes, set prices, and control real-time availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/r/${restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition flex items-center gap-1.5"
          >
            <span>Preview Customer Menu</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Categories
          </span>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span>{categories.length}</span>
            <FolderTree className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Active dining sections</span>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Dishes
          </span>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span>{items.length}</span>
            <UtensilsCrossed className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Configured in catalogue</span>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Live & Available
          </span>
          <div className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <span>{availableCount}</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="text-[11px] text-emerald-400/80 mt-1 block">
            Visible on digital QR menu
          </span>
        </div>
      </div>

      {/* Notification Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "items"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Menu Items ({items.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "categories"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Categories ({categories.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh menu data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {activeTab === "items" ? (
            <button
              type="button"
              onClick={openAddItemModal}
              disabled={categories.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Menu Item</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openAddCategoryModal}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create Category</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: MENU ITEMS */}
      {activeTab === "items" && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items by name or description..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="all">All Categories ({items.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
              <FolderTree className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Create a Category First</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Every menu item belongs to a section or category (e.g. Starters, Main Course, Drinks).
              </p>
              <button
                type="button"
                onClick={openAddCategoryModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Category</span>
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
              <UtensilsCrossed className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Menu Items Found</h3>
              <p className="text-xs text-slate-400">
                {search ? "No items match your filter." : "Click below to add your first dish."}
              </p>
              <button
                type="button"
                onClick={openAddItemModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Menu Item</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="glass-card rounded-2xl p-4 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                          {item.category.name}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            item.isAvailable
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                          }`}
                        >
                          {item.isAvailable ? "Available" : "Sold Out"}
                        </span>
                        {restaurant.gstEnabled ? (
                          item.useCustomTaxRate ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              Custom {Number(item.taxRate || 0)}% GST
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              Default {Number(restaurant.taxRate || 0)}% GST
                            </span>
                          )
                        ) : null}
                      </div>

                      <h4 className="text-base font-bold text-white tracking-tight mt-2 truncate">
                        {item.name}
                      </h4>

                      {item.description && (
                        <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-3 text-lg font-black text-amber-400">
                        ₹{Number(item.price).toFixed(2)}
                      </div>
                    </div>

                    {item.imageUrl ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex-shrink-0">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 flex-shrink-0 flex flex-col items-center justify-center text-slate-500">
                        <ImageIcon className="w-5 h-5 stroke-[1.5]" />
                        <span className="text-[9px] text-slate-500 font-medium mt-0.5">No photo</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleToggleItemAvailability(item)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition cursor-pointer ${
                        item.isAvailable
                          ? "bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{item.isAvailable ? "Mark Sold Out" : "Mark Available"}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditItemModal(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        title="Edit Item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                        title="Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATEGORIES */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Menu Categories</h3>
              <p className="text-xs text-slate-400">
                Categories group dishes on your digital menu in custom sort order.
              </p>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
              <FolderTree className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No Categories Created</h4>
              <p className="text-xs text-slate-400">
                Create a category to begin adding items to your digital menu.
              </p>
              <button
                type="button"
                onClick={openAddCategoryModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Category</span>
              </button>
            </div>
          ) : (
            <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Order</th>
                      <th className="py-3 px-4">Category Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Dishes</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-mono text-slate-400">
                          #{cat.sortOrder}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">
                          {cat.name}
                        </td>
                        <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                          {cat.description || "—"}
                        </td>
                        <td className="py-3 px-4 font-semibold text-cyan-400">
                          {cat._count?.items ?? 0} item(s)
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              cat.isActive
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {cat.isActive ? "Active" : "Hidden"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditCategoryModal(cat)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition flex items-center gap-1 cursor-pointer"
                              title={
                                (cat._count?.items ?? 0) > 0
                                  ? "Cannot delete category containing dishes"
                                  : "Delete Category"
                              }
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Modal (Add / Edit) */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-amber-400" />
                <span>{editingCategory ? "Edit Category" : "Create New Category"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Category Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g., Starters, Pizzas, Desserts, Beverages"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="e.g., Freshly baked hand-tossed sourdough pizzas..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={categorySortOrder}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d+$/.test(val)) {
                        setCategorySortOrder(val);
                      }
                    }}
                    placeholder="0"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Visibility
                  </label>
                  <button
                    type="button"
                    onClick={() => setCategoryIsActive(!categoryIsActive)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      categoryIsActive
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    {categoryIsActive ? "Active (Visible)" : "Hidden"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={categorySubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer"
                >
                  {categorySubmitting ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Item Modal (Add / Edit) - Responsive Compact Layout */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden">
          <div className="w-full max-w-[620px] max-h-[85vh] glass-card rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 flex-shrink-0 bg-slate-900/60">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                <span>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleItemSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                {/* Dish Name & Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Dish Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="e.g., Truffle Mushroom Risotto"
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Price (₹ INR) <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      placeholder="e.g., 349.00"
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Category & Availability */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Category <span className="text-amber-400">*</span>
                    </label>
                    <select
                      required
                      value={itemCategoryId}
                      onChange={(e) => setItemCategoryId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="" disabled>Select category...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Availability
                    </label>
                    <button
                      type="button"
                      onClick={() => setItemIsAvailable(!itemIsAvailable)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        itemIsAvailable
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {itemIsAvailable ? "Available to Order" : "Sold Out / Hidden"}
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Description <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="e.g., Arborio rice cooked with wild forest mushrooms, parmesan, and cold-pressed white truffle oil..."
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* GST / Tax Rate Configuration */}
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">
                      GST / Tax Configuration
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Pricing: <strong className="text-amber-400">{restaurant.taxMode === "INCLUSIVE" ? "Inclusive" : "Exclusive"}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setItemUseCustomTaxRate(false)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition cursor-pointer ${
                        !itemUseCustomTaxRate
                          ? "bg-amber-400/15 text-amber-300 border-amber-400/40 shadow-sm"
                          : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      <div className="font-semibold text-white">Use restaurant default GST</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {restaurant.gstEnabled ? `${Number(restaurant.taxRate || 0)}% Default GST` : "GST Disabled"}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemUseCustomTaxRate(true)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition cursor-pointer ${
                        itemUseCustomTaxRate
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-sm"
                          : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      <div className="font-semibold text-white">Set custom GST for this item</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Select applicable tax rate
                      </div>
                    </button>
                  </div>

                  {itemUseCustomTaxRate && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-slate-300">
                          Custom GST Rate (%)
                        </label>
                        <div className="flex items-center gap-1">
                          {["0", "5", "12", "18", "28"].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setItemCustomTaxRate(preset)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                                itemCustomTaxRate === preset
                                  ? "bg-purple-500 text-white border-purple-400"
                                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                              }`}
                            >
                              {preset}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="28"
                          value={itemCustomTaxRate}
                          onChange={(e) => setItemCustomTaxRate(e.target.value)}
                          placeholder="e.g., 18.00"
                          className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-400 font-mono"
                        />
                        <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        Inherits restaurant pricing mode ({restaurant.taxMode === "INCLUSIVE" ? "Tax included in item price" : "Tax added at checkout"}).
                      </p>
                    </div>
                  )}
                </div>

                {/* Food Image Upload Dropzone (Compact ~105px height) */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Upload Food Image <span className="text-slate-500 font-normal">(JPG, PNG, WebP &bull; Max 5MB)</span>
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />

                  {itemImageUrl ? (
                    <div className="h-[105px] flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                        <img
                          src={itemImageUrl}
                          alt="Dish preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                          <p className="text-xs font-semibold text-white truncate">Image Attached</p>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[280px] mt-0.5">{itemImageUrl}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            type="button"
                            disabled={imageUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline cursor-pointer disabled:opacity-50"
                          >
                            {imageUploading ? "Uploading..." : "Change Image"}
                          </button>
                          <span className="text-slate-600">&bull;</span>
                          <button
                            type="button"
                            disabled={imageUploading}
                            onClick={() => {
                              setItemImageUrl("");
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="text-[11px] font-medium text-rose-400 hover:text-rose-300 underline cursor-pointer disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`h-[105px] border-2 border-dashed rounded-xl px-3 py-2 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5 ${
                        imageUploading
                          ? "border-amber-500/40 bg-amber-500/5 cursor-wait"
                          : "border-slate-800 hover:border-amber-400/50 hover:bg-slate-900/40 bg-slate-950/40"
                      }`}
                    >
                      {imageUploading ? (
                        <div className="flex flex-col items-center gap-1.5 py-1">
                          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                          <p className="text-xs text-amber-300 font-medium">Uploading &amp; securing image...</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 flex-shrink-0">
                            <UploadCloud className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">
                              Upload Food Image <span className="text-slate-400 font-normal hidden sm:inline">(Click or tap)</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              JPG, PNG, WebP &bull; Max 5MB
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {imageUploadError && (
                    <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{imageUploadError}</span>
                    </p>
                  )}

                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                      className="text-[11px] text-slate-400 hover:text-slate-300 underline cursor-pointer"
                    >
                      {showManualUrlInput ? "Hide manual URL input" : "Or enter image URL manually"}
                    </button>
                    {showManualUrlInput && (
                      <input
                        type="text"
                        value={itemImageUrl}
                        onChange={(e) => setItemImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/... or /api/restaurants/..."
                        className="w-full mt-1 px-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Fixed Modal Footer (Always visible) */}
              <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-800/80 flex-shrink-0 bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={itemSubmitting || imageUploading}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  {itemSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>Saving Dish...</span>
                    </>
                  ) : editingItem ? (
                    "Update Dish"
                  ) : (
                    "Add to Menu"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
