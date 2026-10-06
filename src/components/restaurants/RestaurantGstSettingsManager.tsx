"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Percent,
  ShieldCheck,
  AlertTriangle,
  Star,
  ExternalLink,
  Settings,
} from "lucide-react";
import { TaxCalculationMode, MembershipRole } from "@prisma/client";

interface RestaurantGstSettingsProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    googleReviewUrl?: string | null;
    gstEnabled: boolean;
    gstin: string | null;
    legalName: string | null;
    taxRate: number;
    taxMode: TaxCalculationMode;
  };
  userRole: MembershipRole;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function RestaurantGstSettingsManager({
  restaurant,
  userRole,
}: RestaurantGstSettingsProps) {
  const router = useRouter();

  const isEditable = userRole === MembershipRole.OWNER || userRole === MembershipRole.MANAGER;

  const [gstEnabled, setGstEnabled] = useState(restaurant.gstEnabled);
  const [gstin, setGstin] = useState(restaurant.gstin || "");
  const [legalName, setLegalName] = useState(restaurant.legalName || "");
  const [taxRate, setTaxRate] = useState<string>(restaurant.taxRate?.toString() || "5.00");
  const [taxMode, setTaxMode] = useState<TaxCalculationMode>(restaurant.taxMode || TaxCalculationMode.EXCLUSIVE);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(restaurant.googleReviewUrl || "");

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derived validation
  const trimmedGstin = gstin.trim().toUpperCase();
  const isGstinInvalid = trimmedGstin.length > 0 && !GSTIN_REGEX.test(trimmedGstin);

  const numericRate = parseFloat(taxRate);
  const isTaxRateInvalid = isNaN(numericRate) || numericRate < 0 || numericRate > 28;

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditable) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    if (gstEnabled && isGstinInvalid) {
      setErrorMessage("Please enter a valid 15-character Indian GSTIN format (e.g., 27ABCDE1234F1Z5) or clear the field.");
      return;
    }

    if (gstEnabled && isTaxRateInvalid) {
      setErrorMessage("Tax rate must be between 0% and 28%.");
      return;
    }

    if (googleReviewUrl.trim()) {
      try {
        const parsed = new URL(googleReviewUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          setErrorMessage("Google Review URL must begin with http:// or https://");
          return;
        }
      } catch {
        setErrorMessage("Please enter a valid URL for Google Reviews (e.g. https://g.page/r/...)");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        gstEnabled,
        gstin: trimmedGstin || null,
        legalName: legalName.trim() || null,
        taxRate: gstEnabled ? numericRate : Number(restaurant.taxRate || 0),
        taxMode,
        googleReviewUrl: googleReviewUrl.trim() || null,
      };

      const res = await fetch(`/api/restaurants/${restaurant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "Failed to update GST settings.");
        setSaving(false);
        return;
      }

      setSuccessMessage("Restaurant settings and Google Review link have been saved successfully.");
      router.refresh();
    } catch (err) {
      console.error("Save settings error:", err);
      setErrorMessage("Network error occurred while saving settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Restaurant Settings & Google Reviews
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Configure your Google Reviews URL for public menus, business details, and GST taxation for {restaurant.name}.
            </p>
          </div>
        </div>
      </div>

      {!isEditable && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-amber-300 text-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold">Read-Only Permission</p>
            <p className="text-slate-400 mt-0.5">
              Only restaurant Owners and Managers can configure taxation settings. You are logged in with role &ldquo;{userRole}&rdquo;.
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Card 1: Google Reviews Configuration */}
        <div className="glass-card rounded-2xl p-6 border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-slate-900/60 to-slate-900/80 space-y-4 shadow-lg shadow-amber-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Public Menu Feature
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">Google Reviews Configuration</h3>
                <p className="text-xs text-slate-400">
                  Allow dining guests to tap and rate {restaurant.name} directly on your Google Business page.
                </p>
              </div>
            </div>
            {googleReviewUrl.trim() && (
              <a
                href={googleReviewUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 transition self-start sm:self-auto"
              >
                <span>Test Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <label htmlFor="google-review-url" className="text-xs font-semibold text-slate-300 block">
              Google Review URL
            </label>
            <div className="relative">
              <input
                id="google-review-url"
                type="url"
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                disabled={!isEditable}
                placeholder="https://g.page/r/your-google-review-link/review"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When configured, a <strong>&ldquo;Rate Us on Google&rdquo;</strong> button will automatically appear at the bottom of your public QR menu for customers. If left blank, the button stays hidden.
            </p>
          </div>
        </div>

        {/* Card 2: GST Registration Toggle */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-white">GST Registration Status</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Enable GST calculation if your restaurant is registered under the Goods and Services Tax Act.
                When disabled, customers will not be charged tax, and receipts will display as standard dining bills.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={gstEnabled}
                onChange={(e) => setGstEnabled(e.target.checked)}
                disabled={!isEditable}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400"></div>
            </label>
          </div>

          {gstEnabled && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* GSTIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>GSTIN (Goods and Services Tax ID)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Optional / 15 chars</span>
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    disabled={!isEditable}
                    maxLength={15}
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition ${
                      isGstinInvalid
                        ? "border-rose-500/70 focus:border-rose-400"
                        : "border-slate-800 focus:border-amber-400"
                    }`}
                  />
                  {isGstinInvalid && (
                    <p className="text-[11px] text-rose-400">
                      Standard GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 char + Z + 1 char.
                    </p>
                  )}
                </div>

                {/* Legal Entity Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Legal / Registered Business Name
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    disabled={!isEditable}
                    placeholder="e.g. Acme Hospitality Private Limited"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                  />
                  <p className="text-[10px] text-slate-500">
                    Displayed on the official customer tax invoice receipt.
                  </p>
                </div>
              </div>

              {/* Tax Rate & Quick Presets */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" />
                  <span>Applicable GST Tax Rate (%)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: "5% (Standard Restaurant)", value: "5.00" },
                    { label: "12% (Specified Service)", value: "12.00" },
                    { label: "18% (Outdoor / Hotel)", value: "18.00" },
                    { label: "0% (Exempted)", value: "0.00" },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      disabled={!isEditable}
                      onClick={() => setTaxRate(preset.value)}
                      className={`p-2.5 rounded-xl text-xs font-medium text-center border transition cursor-pointer ${
                        taxRate === preset.value
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="pt-2 max-w-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="28"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      disabled={!isEditable}
                      className="w-32 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400">% Custom Rate (0% to 28%)</span>
                  </div>
                </div>
              </div>

              {/* Tax Calculation Mode: Exclusive vs Inclusive */}
              <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
                <label className="text-xs font-semibold text-slate-300 block">
                  Menu Pricing & Tax Calculation Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      taxMode === TaxCalculationMode.EXCLUSIVE
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="taxMode"
                      value={TaxCalculationMode.EXCLUSIVE}
                      checked={taxMode === TaxCalculationMode.EXCLUSIVE}
                      onChange={() => setTaxMode(TaxCalculationMode.EXCLUSIVE)}
                      disabled={!isEditable}
                      className="mt-1 accent-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Tax Exclusive (Added at Checkout)</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Menu prices do NOT include tax. The {taxRate}% GST is calculated on top of the food subtotal at checkout.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      taxMode === TaxCalculationMode.INCLUSIVE
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="taxMode"
                      value={TaxCalculationMode.INCLUSIVE}
                      checked={taxMode === TaxCalculationMode.INCLUSIVE}
                      onChange={() => setTaxMode(TaxCalculationMode.INCLUSIVE)}
                      disabled={!isEditable}
                      className="mt-1 accent-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Tax Inclusive (Included in Menu Prices)</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Menu prices already include GST. The grand total equals the item prices, and the taxable value and tax component are extracted on receipts.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Registered Business Address Context */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-bold text-white">Restaurant Billing Details</h3>
          </div>
          <p className="text-xs text-slate-400">
            These details appear on customer tax invoices and receipts.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">
                Store Name
              </span>
              <span className="text-slate-200 font-semibold mt-0.5 block">{restaurant.name}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">
                Registered Contact Phone
              </span>
              <span className="text-slate-200 font-semibold mt-0.5 block font-mono">
                {restaurant.phone || "Not configured"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 sm:col-span-2">
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">
                Billing Address
              </span>
              <span className="text-slate-200 mt-0.5 block">
                {restaurant.address || "No address provided. You can update this in restaurant profile."}
              </span>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        {isEditable && (
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Settings...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
