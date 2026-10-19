/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Phone,
  Store,
  QrCode,
  Search,
  ExternalLink,
  UtensilsCrossed,
  Plus,
  Minus,
  ShoppingBag,
  X,
  Trash2,
  AlertTriangle,
  FileText,
  Loader2,
  Check,
  Receipt,
  Bell,
  Ticket,
  Tag,
  Copy,
  Star,
} from "lucide-react";
import { CustomerOrderReceiptModal, CustomerReceiptData } from "./CustomerOrderReceiptModal";
import { CustomerServiceRequestModal } from "./CustomerServiceRequestModal";


interface MenuItemData {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  useCustomTaxRate?: boolean;
  taxRate?: number | null;
}

interface MenuCategoryData {
  id: string;
  name: string;
  description: string | null;
  items: MenuItemData[];
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

export interface PublicCouponOffer {
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderSubtotal: number;
  maxDiscount: number | null;
  endDate: string | null;
}

interface PublicMenuViewProps {
  restaurant: {
    name: string;
    slug: string;
    description: string | null;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    googleReviewUrl: string | null;
    gstEnabled?: boolean;
    gstin?: string | null;
    legalName?: string | null;
    taxRate?: number;
    taxMode?: "EXCLUSIVE" | "INCLUSIVE";
    categories: MenuCategoryData[];
  };
  tableNumber?: string | null;
  tableName?: string | null;
  qrToken?: string | null;
  tableMessage?: { type: "info" | "warning"; text: string } | null;
  offers?: PublicCouponOffer[];
}

export function PublicDigitalMenuView({
  restaurant,
  tableNumber,
  tableName,
  qrToken,
  tableMessage,
  offers = [],
}: PublicMenuViewProps) {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const storageKey = `qrserve_cart_${restaurant.slug}`;

  const isHydratedRef = useRef(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrderSession, setActiveOrderSession] = useState<{
    orderNumber: string;
    accessToken: string;
    confirmationUrl: string;
  } | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [activeNoteItemId, setActiveNoteItemId] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState("");

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<CustomerReceiptData | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [customerPhoneInput, setCustomerPhoneInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    couponId: string;
    code: string;
    description: string | null;
    discountType: "PERCENTAGE" | "FIXED";
    discountValue: number;
    minOrderSubtotal: number;
    maxDiscount: number | null;
    discountAmount: number;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

  // Public offers copy state
  const [copiedOfferCode, setCopiedOfferCode] = useState<string | null>(null);
  const [offerCopiedToast, setOfferCopiedToast] = useState<string | null>(null);

  function handleCopyOffer(code: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    setCopiedOfferCode(code);
    setCouponCodeInput(code);
    setOfferCopiedToast(`Code "${code}" copied! Apply it in your cart during checkout.`);
    setTimeout(() => {
      setCopiedOfferCode(null);
    }, 2500);
    setTimeout(() => {
      setOfferCopiedToast(null);
    }, 4500);
  }

  function formatOfferDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  }

  // Safely hydrate cart and active order session asynchronously on client mount
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      isHydratedRef.current = true;
      setIsClientMounted(true);

      try {
        const savedSession = sessionStorage.getItem(`qrserve_active_order_${restaurant.slug}`);
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (parsed?.orderNumber && parsed?.accessToken) {
            setActiveOrderSession(parsed);
          }
        }
      } catch {
        // Ignore read errors
      }

      try {
        const savedCart = sessionStorage.getItem(storageKey);
        if (savedCart) {
          const parsed: CartItem[] = JSON.parse(savedCart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const itemsMap = new Map<string, MenuItemData>();
            for (const cat of restaurant.categories) {
              for (const item of cat.items) {
                itemsMap.set(item.id, item);
              }
            }
            const valid = parsed
              .filter((ci) => itemsMap.has(ci.menuItemId))
              .map((ci) => {
                const freshItem = itemsMap.get(ci.menuItemId)!;
                return {
                  ...ci,
                  name: freshItem.name,
                  price: freshItem.price,
                  quantity: Math.min(Math.max(1, ci.quantity), 50),
                  notes: typeof ci.notes === "string" ? ci.notes.slice(0, 200) : "",
                };
              });
            setCart(valid);
          }
        }
      } catch {
        // Ignore read errors
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [restaurant.slug, storageKey, restaurant.categories]);

  async function handleFetchAndOpenReceipt() {
    if (!activeOrderSession) return;
    setIsReceiptModalOpen(true);
    setReceiptLoading(true);
    setReceiptError(null);

    try {
      const res = await fetch(
        `/api/r/${restaurant.slug}/orders/${activeOrderSession.orderNumber}?token=${activeOrderSession.accessToken}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setReceiptError(json.error || "Failed to load order receipt from server.");
        setReceiptLoading(false);
        return;
      }
      setReceiptData(json.data);
    } catch (err) {
      console.error("Receipt fetch error:", err);
      setReceiptError("Network error while loading receipt.");
    } finally {
      setReceiptLoading(false);
    }
  }

  function handleDismissActiveOrder() {
    try {
      sessionStorage.removeItem(`qrserve_active_order_${restaurant.slug}`);
    } catch {
      // Ignore write errors
    }
    setActiveOrderSession(null);
  }

  // Persist cart to session storage whenever it updates after mount
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      if (cart.length > 0) {
        sessionStorage.setItem(storageKey, JSON.stringify(cart));
      } else {
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage write errors
    }
  }, [cart, storageKey]);

  // Calculations
  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const menuItemMap = useMemo(() => {
    const map = new Map<string, MenuItemData>();
    for (const cat of restaurant.categories) {
      for (const item of cat.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [restaurant.categories]);

  const cartPricingSummary = useMemo(() => {
    const isGstEnabled = Boolean(restaurant.gstEnabled);
    const defaultRate = isGstEnabled ? Number(restaurant.taxRate || 0) : 0;
    const mode = restaurant.taxMode || "EXCLUSIVE";

    // Calculate coupon discount
    let discountAmount = 0;
    if (appliedCoupon) {
      if (cartTotalAmount >= appliedCoupon.minOrderSubtotal) {
        if (appliedCoupon.discountType === "PERCENTAGE") {
          let raw = (cartTotalAmount * appliedCoupon.discountValue) / 100;
          if (appliedCoupon.maxDiscount !== null && appliedCoupon.maxDiscount !== undefined) {
            raw = Math.min(raw, appliedCoupon.maxDiscount);
          }
          discountAmount = Math.min(Math.round(raw * 100) / 100, cartTotalAmount);
        } else {
          discountAmount = Math.min(appliedCoupon.discountValue, cartTotalAmount);
        }
      }
    }

    if (!isGstEnabled) {
      const finalTotal = Math.max(0, Math.round((cartTotalAmount - discountAmount) * 100) / 100);
      return {
        isGst: false,
        rate: 0,
        mode,
        subtotal: cartTotalAmount,
        discountAmount,
        taxableAmount: finalTotal,
        taxAmount: 0,
        finalTotal,
        rateBreakdowns: [] as Array<{
          rate: number;
          taxableAmount: number;
          taxAmount: number;
        }>,
      };
    }

    let subtotal = 0;
    let taxableAmount = 0;
    let taxAmount = 0;
    let grandTotal = 0;

    const rateBuckets = new Map<
      string,
      { rate: number; taxableAmount: number; taxAmount: number }
    >();

    for (const item of cart) {
      const dbItem = menuItemMap.get(item.menuItemId);
      let appliedRate = defaultRate;
      if (
        dbItem?.useCustomTaxRate &&
        dbItem.taxRate !== null &&
        dbItem.taxRate !== undefined
      ) {
        appliedRate = Number(dbItem.taxRate);
      }
      if (appliedRate < 0) appliedRate = 0;

      const lineTotal = item.price * item.quantity;
      const lineProportion = cartTotalAmount > 0 ? lineTotal / cartTotalAmount : 0;
      const lineDiscount = Math.round(discountAmount * lineProportion * 100) / 100;

      let lineTaxable = 0;
      let lineTax = 0;
      let lineGrand = 0;

      if (mode === "INCLUSIVE") {
        const lineNet = Math.max(0, Math.round((lineTotal - lineDiscount) * 100) / 100);
        if (appliedRate > 0) {
          lineTaxable =
            Math.round((lineNet / (1 + appliedRate / 100)) * 100) / 100;
          lineTax = Math.round((lineNet - lineTaxable) * 100) / 100;
        } else {
          lineTaxable = lineNet;
          lineTax = 0;
        }
        lineGrand = lineNet;
        subtotal += lineTotal;
        taxableAmount += lineTaxable;
        taxAmount += lineTax;
        grandTotal += lineGrand;
      } else {
        const lineBase = Math.max(0, Math.round((lineTotal - lineDiscount) * 100) / 100);
        lineTaxable = lineBase;
        if (appliedRate > 0) {
          lineTax = Math.round((lineBase * (appliedRate / 100)) * 100) / 100;
        } else {
          lineTax = 0;
        }
        lineGrand = Math.round((lineBase + lineTax) * 100) / 100;

        subtotal += lineTotal;
        taxableAmount += lineTaxable;
        taxAmount += lineTax;
        grandTotal += lineGrand;
      }

      const rateKey = appliedRate.toFixed(2);
      const bucket = rateBuckets.get(rateKey) || {
        rate: appliedRate,
        taxableAmount: 0,
        taxAmount: 0,
      };
      bucket.taxableAmount += lineTaxable;
      bucket.taxAmount += lineTax;
      rateBuckets.set(rateKey, bucket);
    }

    const rateBreakdowns = Array.from(rateBuckets.values()).sort(
      (a, b) => a.rate - b.rate
    );

    return {
      isGst: true,
      rate:
        rateBreakdowns.length === 1
          ? rateBreakdowns[0].rate
          : defaultRate,
      mode,
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      finalTotal: Math.round(grandTotal * 100) / 100,
      rateBreakdowns,
    };
  }, [
    cart,
    menuItemMap,
    cartTotalAmount,
    restaurant.gstEnabled,
    restaurant.taxRate,
    restaurant.taxMode,
    appliedCoupon,
  ]);

  // Cart operations
  function handleAddToCart(item: MenuItemData) {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItemId === item.id);
      if (existing) {
        if (existing.quantity >= 50) return prev;
        return prev.map((ci) =>
          ci.menuItemId === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          notes: "",
        },
      ];
    });
  }

  function handleDecrement(itemId: string) {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItemId === itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((ci) => ci.menuItemId !== itemId);
      }
      return prev.map((ci) =>
        ci.menuItemId === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci
      );
    });
  }

  function handleRemoveItem(itemId: string) {
    setCart((prev) => prev.filter((ci) => ci.menuItemId !== itemId));
  }

  function handleSaveItemNote(itemId: string, note: string) {
    setCart((prev) =>
      prev.map((ci) =>
        ci.menuItemId === itemId ? { ...ci, notes: note.slice(0, 200) } : ci
      )
    );
    setActiveNoteItemId(null);
    setItemNoteText("");
  }

  function openItemNoteEditor(item: CartItem) {
    setActiveNoteItemId(item.menuItemId);
    setItemNoteText(item.notes || "");
  }

  async function handleApplyCoupon(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanCode = couponCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError("Please enter a coupon code.");
      return;
    }
    if (cart.length === 0) {
      setCouponError("Add items to your cart before applying a coupon.");
      return;
    }
    setCouponLoading(true);
    setCouponError(null);
    setCouponSuccess(null);

    try {
      const res = await fetch(`/api/r/${restaurant.slug}/coupons/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleanCode,
          subtotal: cartTotalAmount,
          customerPhone: customerPhoneInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setCouponError(json.error || "Failed to validate coupon.");
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon(json.data);
      setCouponSuccess(`Coupon "${json.data.code}" applied! You save ₹${Number(json.data.discountAmount).toFixed(2)}.`);
      setCouponCodeInput("");
    } catch {
      setCouponError("Network error while validating coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponSuccess(null);
    setCouponError(null);
  }

  // Submit Order to backend
  async function handleSubmitOrder() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    // Generate safe client idempotency key for this submission attempt
    const idempotencyKey = `ord_idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const payload = {
        qrToken: qrToken || null,
        tableNumber: tableNumber || null,
        customerNotes: orderNotes.trim() || null,
        couponCode: appliedCoupon?.code || null,
        customerPhone: customerPhoneInput.trim() || null,
        idempotencyKey,
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes.trim() || null,
        })),
      };

      const res = await fetch(`/api/r/${restaurant.slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setSubmitError(json.error || "Failed to submit order. Please check with your server.");
        setConfirmDialog(false);
        setSubmitting(false);
        return;
      }

      // Success: clear cart and redirect to order confirmation
      sessionStorage.removeItem(storageKey);
      setCart([]);
      setAppliedCoupon(null);
      setCouponCodeInput("");
      setCouponSuccess(null);
      setCouponError(null);
      setIsCartOpen(false);
      setConfirmDialog(false);

      const sessionOrder = {
        orderNumber: json.data.orderNumber,
        accessToken: json.data.accessToken,
        confirmationUrl:
          json.data.confirmationUrl ||
          `/r/${restaurant.slug}/orders/${json.data.orderNumber}?token=${json.data.accessToken}`,
      };
      try {
        sessionStorage.setItem(`qrserve_active_order_${restaurant.slug}`, JSON.stringify(sessionOrder));
      } catch {
        // Ignore write errors
      }
      setActiveOrderSession(sessionOrder);

      if (json.data?.confirmationUrl) {
        router.push(json.data.confirmationUrl);
      } else {
        router.push(
          `/r/${restaurant.slug}/orders/${json.data.orderNumber}?token=${json.data.accessToken}`
        );
      }
    } catch (err) {
      console.error("Order submission failed:", err);
      setSubmitError("Network error. Please verify your connection and try again.");
      setConfirmDialog(false);
      setSubmitting(false);
    }
  }

  const allItemsCount = restaurant.categories.reduce(
    (acc, cat) => acc + cat.items.length,
    0
  );

  // Filter categories and items based on search and selected category
  const filteredCategories = restaurant.categories
    .filter((cat) => selectedCategory === "all" || cat.id === selectedCategory)
    .map((cat) => {
      const items = cat.items.filter((item) => {
        if (!search.trim()) return true;
        const term = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(term) ||
          (item.description && item.description.toLowerCase().includes(term))
        );
      });
      return { ...cat, items };
    })
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative pb-28">
      {/* Active Order Session Sticky Banner */}
      {isClientMounted && activeOrderSession && (
        <aside
          aria-label="Active Order Session"
          className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-amber-500/30 px-4 py-2.5 shadow-lg"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Receipt className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-slate-300 truncate">
                Recent Order:{" "}
                <strong className="font-mono text-amber-300 font-bold tracking-wider">
                  {activeOrderSession.orderNumber}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                id="menu-view-receipt-btn"
                onClick={handleFetchAndOpenReceipt}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>View Receipt</span>
              </button>
              <button
                type="button"
                onClick={handleDismissActiveOrder}
                title="Dismiss banner"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Top Brand Banner */}
      <header className="relative w-full border-b border-slate-800 bg-slate-900/60 backdrop-blur-md">
        {restaurant.bannerUrl ? (
          <div className="h-36 sm:h-48 w-full overflow-hidden relative">
            <img
              src={restaurant.bannerUrl}
              alt={restaurant.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          </div>
        ) : (
          <div className="h-28 sm:h-36 w-full bg-gradient-to-r from-amber-900/40 via-orange-950/50 to-slate-900" />
        )}

        <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 relative z-10 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-3.5">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900 border-2 border-slate-700/80 shadow-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
                {restaurant.logoUrl ? (
                  <img
                    src={restaurant.logoUrl}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Store className="w-10 h-10 text-amber-400" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    {restaurant.name}
                  </h1>
                  {tableNumber ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <QrCode className="w-3 h-3" />
                      <span>{tableName ? `${tableNumber} (${tableName})` : `Table ${tableNumber}`}</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                      <Store className="w-3 h-3" />
                      <span>Takeaway / Counter</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  {restaurant.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{restaurant.address}</span>
                    </span>
                  )}
                  {restaurant.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{restaurant.phone}</span>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-end flex-wrap">

              {tableNumber && qrToken && (
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 shadow-md shadow-amber-500/20 transition cursor-pointer"
                  title="Call waiter or request table service"
                >
                  <Bell className="w-3.5 h-3.5 fill-current" />
                  <span>Call Waiter</span>
                </button>
              )}

              {restaurant.googleReviewUrl && (
                <a
                  href={restaurant.googleReviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition"
                >
                  <span>Google Reviews</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {restaurant.description && (
            <p className="mt-3 text-xs text-slate-300 max-w-2xl leading-relaxed">
              {restaurant.description}
            </p>
          )}

          {tableMessage && (
            <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
              <QrCode className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{tableMessage.text}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Menu Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Search & Counter Info */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, drinks, or ingredients..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            <span>{allItemsCount} menu items available</span>
          </div>
        </div>

        {/* Special Offers Section */}
        {offers && offers.length > 0 && (
          <section
            aria-label="Special Offers and Discounts"
            className="rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900 to-slate-950 p-4 sm:p-5 border border-amber-500/25 shadow-xl shadow-black/20 space-y-3.5 relative overflow-hidden"
          >
            {/* Subtle decorative glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Ticket className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-white tracking-tight">
                      Special Offers & Deals
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {offers.length} {offers.length === 1 ? "Offer" : "Offers"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Use these coupon codes during checkout to claim your dining discount
                  </p>
                </div>
              </div>
            </div>

            {/* Offer Cards: mobile-friendly scrollable carousel / desktop grid */}
            <div className="flex gap-3 overflow-x-auto pb-1.5 scrollbar-none sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
              {offers.map((offer) => (
                <div
                  key={offer.code}
                  className="min-w-[270px] sm:min-w-0 flex-1 rounded-2xl bg-slate-950/80 border border-dashed border-amber-500/30 p-3.5 flex flex-col justify-between space-y-3 hover:border-amber-500/60 transition group shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          offer.discountType === "PERCENTAGE"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {offer.discountType === "PERCENTAGE"
                          ? `${offer.discountValue}% OFF`
                          : `₹${offer.discountValue} FLAT OFF`}
                      </span>

                      {offer.endDate && (
                        <span className="text-[10px] text-slate-400">
                          Expires {formatOfferDate(offer.endDate)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="font-mono font-black text-xs text-amber-300 tracking-wider uppercase">
                          {offer.code}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyOffer(offer.code)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          copiedOfferCode === offer.code
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:text-white"
                        }`}
                        title="Copy coupon code"
                      >
                        {copiedOfferCode === offer.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    {offer.description && (
                      <p className="text-[11px] text-slate-300 line-clamp-2">
                        {offer.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>
                        {offer.minOrderSubtotal > 0
                          ? `Min order: ₹${offer.minOrderSubtotal}`
                          : "No minimum order"}
                      </span>
                      {offer.discountType === "PERCENTAGE" && offer.maxDiscount !== null && (
                        <span>Up to ₹{offer.maxDiscount}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-amber-400/90 font-medium">
                      Apply code at checkout to claim
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category Pills Navigation */}
        {restaurant.categories.length > 0 && (
          <div className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2.5 bg-slate-950/95 backdrop-blur-md overflow-x-auto scrollbar-none flex items-center gap-2 border-b border-slate-900">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              All Categories ({allItemsCount})
            </button>

            {restaurant.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat.id
                    ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {cat.name} ({cat.items.length})
              </button>
            ))}
          </div>
        )}

        {/* Menu Listings */}
        {allItemsCount === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center mx-auto">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Menu is Being Prepared</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              This restaurant has not added any active dishes to their digital menu yet. Please check back shortly.
            </p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border border-slate-800 text-slate-400 text-sm">
            No dishes found matching &ldquo;{search}&rdquo;. Try another search term.
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((category) => (
              <section key={category.id} className="space-y-3">
                <div className="border-b border-slate-800/80 pb-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span>{category.name}</span>
                    <span className="text-xs font-normal text-slate-500">
                      ({category.items.length})
                    </span>
                  </h2>
                  {category.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{category.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {category.items.map((item) => {
                    const inCart = isClientMounted
                      ? cart.find((ci) => ci.menuItemId === item.id)
                      : undefined;
                    return (
                      <div
                        key={item.id}
                        className="glass-card rounded-2xl p-4 border border-slate-800/80 hover:border-slate-700 transition flex items-start justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-bold text-white tracking-tight truncate">
                              {item.name}
                            </h4>
                          </div>

                          {item.description && (
                            <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-base font-extrabold text-amber-400 font-mono">
                                ₹{item.price.toFixed(2)}
                              </span>
                              {restaurant.gstEnabled && (() => {
                                const itemEffectiveRate =
                                  item.useCustomTaxRate &&
                                  item.taxRate !== null &&
                                  item.taxRate !== undefined
                                    ? Number(item.taxRate)
                                    : Number(restaurant.taxRate || 0);
                                return itemEffectiveRate > 0 ? (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {restaurant.taxMode === "INCLUSIVE"
                                      ? `(incl. ${itemEffectiveRate}% GST)`
                                      : `(+${itemEffectiveRate}% GST)`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">0% GST</span>
                                );
                              })()}
                            </div>

                            {/* Quantity Controls */}
                            {inCart ? (
                              <div className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/40 rounded-xl p-1 shadow-inner">
                                <button
                                  type="button"
                                  onClick={() => handleDecrement(item.id)}
                                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-6 text-center text-xs font-bold text-amber-300 font-mono">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddToCart(item)}
                                  disabled={inCart.quantity >= 50}
                                  className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center font-bold transition disabled:opacity-50 cursor-pointer"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(item)}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {item.imageUrl ? (
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex-shrink-0 relative">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = "none";
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "flex";
                              }}
                            />
                            <div className="hidden w-full h-full bg-slate-900/60 flex-col items-center justify-center text-slate-500">
                              <UtensilsCrossed className="w-6 h-6 stroke-[1.5]" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-xl bg-slate-900/40 border border-slate-800/80 flex-shrink-0 flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                            <UtensilsCrossed className="w-5 h-5 stroke-[1.5] text-slate-500 mb-1" />
                            <span className="text-[9px] text-slate-500 font-medium leading-tight">Fresh Dish</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Google Reviews Call-to-Action Section */}
        {restaurant.googleReviewUrl && restaurant.googleReviewUrl.trim().length > 0 && (
          <section
            id="google-reviews-section"
            aria-label="Google Reviews"
            className="my-10 p-6 sm:p-8 rounded-3xl border border-amber-500/25 bg-gradient-to-b from-amber-500/10 via-slate-900/70 to-slate-900/90 text-center space-y-4 shadow-xl shadow-amber-500/5 backdrop-blur-sm"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-md">
              <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
            </div>

            <div className="space-y-1.5">
              <p className="text-amber-400 text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-1.5">
                <span>⭐</span> Enjoyed your experience?
              </p>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Rate us on Google
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
                Help us improve and help fellow foodies find great food at {restaurant.name}.
              </p>
            </div>

            <div className="pt-2">
              <a
                href={restaurant.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                id="rate-us-on-google-btn"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 hover:from-amber-300 hover:to-orange-300 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/25 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <Star className="w-4 h-4 fill-slate-950 text-slate-950" />
                <span>Rate Us on Google</span>
                <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-75" />
              </a>
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {isClientMounted && cart.length > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-30 max-w-xl mx-auto px-4 animate-in slide-in-from-bottom-6">
          <div className="glass-panel bg-slate-900/95 border border-amber-500/30 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 shadow-md">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center shadow">
                  {totalCartCount}
                </span>
              </div>

              <div>
                <div className="text-xs text-slate-400">
                  {tableNumber ? `Table ${tableNumber}` : "Counter Takeaway"}
                  {cartPricingSummary.isGst && (
                    <span className="ml-1 text-[11px] text-amber-300">
                      ({cartPricingSummary.mode === "INCLUSIVE" ? "incl. GST" : cartPricingSummary.rateBreakdowns.length > 1 ? "+GST (mixed)" : `+${cartPricingSummary.rate}% GST`})
                    </span>
                  )}
                </div>
                <div className="text-base font-extrabold text-white font-mono">
                  ₹{cartPricingSummary.finalTotal.toFixed(2)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setIsCartOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              View Order
            </button>
          </div>
        </div>
      )}

      {/* Cart Drawer & Checkout Slide-Over */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Your Order</h3>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {totalCartCount} {totalCartCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tableNumber ? (
                    <span>
                      Dine-in at <strong>Table {tableNumber}</strong>
                      {tableName ? ` (${tableName})` : ""}
                    </span>
                  ) : (
                    <span>Counter Pickup / Takeaway</span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message in Drawer */}
            {submitError && (
              <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span className="flex-1">{submitError}</span>
              </div>
            )}

            {/* Drawer Items Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 divide-y divide-slate-800/60">
              {cart.map((item) => (
                <div key={item.menuItemId} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {item.name}
                      </h4>
                      <p className="text-xs font-mono text-slate-400">
                        ₹{item.price.toFixed(2)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleDecrement(item.menuItemId)}
                          className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold font-mono text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddToCart({
                              id: item.menuItemId,
                              name: item.name,
                              price: item.price,
                              description: null,
                              imageUrl: null,
                            })
                          }
                          disabled={item.quantity >= 50}
                          className="w-6 h-6 rounded bg-amber-400 text-slate-950 hover:bg-amber-300 flex items-center justify-center font-bold transition disabled:opacity-50 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.menuItemId)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Item-specific Notes */}
                  {activeNoteItemId === item.menuItemId ? (
                    <div className="space-y-1.5 pt-1">
                      <input
                        type="text"
                        value={itemNoteText}
                        onChange={(e) => setItemNoteText(e.target.value)}
                        placeholder="e.g. Extra spicy, no onions, less oil"
                        maxLength={200}
                        className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveNoteItemId(null)}
                          className="text-[11px] text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveItemNote(item.menuItemId, itemNoteText)}
                          className="text-[11px] font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded px-2.5 py-1 flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px]">
                      {item.notes ? (
                        <p className="text-amber-300/90 italic flex items-center gap-1">
                          <FileText className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          <span className="truncate">&ldquo;{item.notes}&rdquo;</span>
                        </p>
                      ) : (
                        <span className="text-slate-500">No special instructions</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openItemNoteEditor(item)}
                        className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                      >
                        {item.notes ? "Edit note" : "+ Add note"}
                      </button>
                    </div>
                  )}

                  <div className="text-right text-xs font-mono font-bold text-amber-400 pt-0.5">
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}

              {/* Order-level Instructions */}
              <div className="pt-4 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Special Instructions for the Kitchen:
                </label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Allergies, seating preferences, timing requests..."
                  maxLength={500}
                  rows={2}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none transition"
                />
              </div>
            </div>

            {/* Drawer Footer & Checkout Action */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 space-y-3">
              {/* Coupon / Promo Code Section */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 space-y-2">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-emerald-300">
                            {appliedCoupon.code}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                            APPLIED
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-400/90">
                          {cartPricingSummary.discountAmount > 0
                            ? `Saving ₹${cartPricingSummary.discountAmount.toFixed(2)} on this order`
                            : `Add items worth ₹${(appliedCoupon.minOrderSubtotal - cartPricingSummary.subtotal).toFixed(2)} more to activate`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      title="Remove coupon"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Ticket className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => {
                            setCouponCodeInput(e.target.value.toUpperCase());
                            setCouponError(null);
                          }}
                          placeholder="COUPON / PROMO CODE"
                          maxLength={30}
                          className="w-full text-xs font-mono uppercase bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={couponLoading || !couponCodeInput.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer"
                      >
                        {couponLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Apply"
                        )}
                      </button>
                    </div>
                    <input
                      type="tel"
                      value={customerPhoneInput}
                      onChange={(e) => setCustomerPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Mobile No. (optional, for member coupons)"
                      maxLength={10}
                      className="w-full text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-400 font-mono"
                    />
                    {couponError && (
                      <p className="text-[11px] text-rose-400 font-medium pl-1">
                        {couponError}
                      </p>
                    )}
                    {couponSuccess && (
                      <p className="text-[11px] text-emerald-400 font-medium pl-1">
                        {couponSuccess}
                      </p>
                    )}
                    {offers.length > 0 && (
                      <div className="pt-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
                        <span className="text-slate-400 flex-shrink-0 text-[10px]">Offers:</span>
                        {offers.map((off) => (
                          <button
                            key={off.code}
                            type="button"
                            onClick={() => {
                              setCouponCodeInput(off.code);
                              setCouponError(null);
                            }}
                            className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-950 border border-amber-500/30 text-amber-300 hover:border-amber-400 hover:text-white transition whitespace-nowrap cursor-pointer"
                          >
                            {off.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </form>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal ({totalCartCount} items)</span>
                  <span className="font-mono">₹{cartPricingSummary.subtotal.toFixed(2)}</span>
                </div>

                {cartPricingSummary.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span>Coupon Discount ({appliedCoupon?.code}):</span>
                    <span className="font-mono">-₹{cartPricingSummary.discountAmount.toFixed(2)}</span>
                  </div>
                )}

                {cartPricingSummary.isGst && cartPricingSummary.mode === "EXCLUSIVE" && (
                  <>
                    {cartPricingSummary.discountAmount > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Taxable Value:</span>
                        <span className="font-mono">₹{cartPricingSummary.taxableAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {cartPricingSummary.rateBreakdowns.length > 1 ? (
                      cartPricingSummary.rateBreakdowns.map((bucket) => (
                        <div key={bucket.rate} className="flex justify-between text-amber-300">
                          <span>GST ({bucket.rate}%):</span>
                          <span className="font-mono">+₹{bucket.taxAmount.toFixed(2)}</span>
                        </div>
                      ))
                    ) : cartPricingSummary.rateBreakdowns.length === 1 ? (
                      <div className="flex justify-between text-amber-300">
                        <span>GST ({cartPricingSummary.rateBreakdowns[0].rate}%):</span>
                        <span className="font-mono">+₹{cartPricingSummary.rateBreakdowns[0].taxAmount.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </>
                )}

                {cartPricingSummary.isGst && cartPricingSummary.mode === "INCLUSIVE" && (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Taxable Value:</span>
                      <span className="font-mono">₹{cartPricingSummary.taxableAmount.toFixed(2)}</span>
                    </div>
                    {cartPricingSummary.rateBreakdowns.length > 1 ? (
                      cartPricingSummary.rateBreakdowns.map((bucket) => (
                        <div key={bucket.rate} className="flex justify-between text-slate-400">
                          <span>Includes GST ({bucket.rate}%):</span>
                          <span className="font-mono">₹{bucket.taxAmount.toFixed(2)}</span>
                        </div>
                      ))
                    ) : cartPricingSummary.rateBreakdowns.length === 1 ? (
                      <div className="flex justify-between text-slate-400">
                        <span>Includes GST ({cartPricingSummary.rateBreakdowns[0].rate}%):</span>
                        <span className="font-mono">₹{cartPricingSummary.rateBreakdowns[0].taxAmount.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </>
                )}

                <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-800/80 text-sm font-bold text-white">
                  <div>
                    <span>Total Amount</span>
                    {cartPricingSummary.isGst && (
                      <span className="block text-[10px] font-normal text-slate-400">
                        {cartPricingSummary.mode === "INCLUSIVE" ? "All prices inclusive of GST" : "Tax calculated on discounted amount"}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xl font-extrabold text-amber-400">
                    ₹{cartPricingSummary.finalTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Confirmation Step Dialog or Direct Trigger */}
              {confirmDialog ? (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                  <p className="text-xs font-semibold text-amber-200">
                    Confirm placing this order for{" "}
                    <strong>{tableNumber ? `Table ${tableNumber}` : "Counter Takeaway"}</strong>?
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Your dishes will be sent directly to the kitchen. You can pay at the counter.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDialog(false)}
                      disabled={submitting}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitOrder}
                      disabled={submitting}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Confirm & Place</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDialog(true)}
                  disabled={cart.length === 0}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Place Order • ₹{cartPricingSummary.finalTotal.toFixed(2)}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Public Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>
          Powered by <strong className="text-slate-400">QRServe Digital Ordering</strong> • Pay directly at the counter
        </p>
      </footer>

      {/* Reusable Customer Order Receipt Modal */}
      <CustomerOrderReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={receiptData}
        isLoading={receiptLoading}
        error={receiptError}
        fullOrderUrl={activeOrderSession?.confirmationUrl}
      />

      {/* Floating Call Waiter Button on Valid Table QR */}
      {tableNumber && qrToken && (
        <button
          type="button"
          onClick={() => setServiceModalOpen(true)}
          className="fixed bottom-6 left-4 sm:left-6 z-30 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 shadow-2xl backdrop-blur-md transition flex items-center gap-2 text-xs font-bold cursor-pointer group hover:scale-105"
          title="Call waiter or request table service"
        >
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-400 group-hover:text-slate-950 transition">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <span>Call Waiter</span>
        </button>
      )}

      {/* Customer Service Request Modal */}
      {tableNumber && qrToken && (
        <CustomerServiceRequestModal
          isOpen={serviceModalOpen}
          onClose={() => setServiceModalOpen(false)}
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          tableNumber={tableNumber}
          tableName={tableName}
          qrToken={qrToken}
        />
      )}

      {/* Toast Notification when coupon code is copied */}
      {offerCopiedToast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 text-amber-300 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-semibold max-w-sm w-[90%] sm:w-auto text-center"
        >
          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{offerCopiedToast}</span>
        </div>
      )}
    </div>
  );
}
