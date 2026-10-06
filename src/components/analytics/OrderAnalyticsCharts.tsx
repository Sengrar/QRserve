"use client";

import React, { useState, useId } from "react";
import {
  TrendingUp,
  BarChart2,
  Calendar,
  Layers,
  ShoppingBag,
} from "lucide-react";
import { ChartDataPoint } from "@/lib/analytics/service";
import { formatCurrencyINR, formatCompactINR } from "@/lib/analytics/dates";

interface OrderAnalyticsChartsProps {
  dailyData: ChartDataPoint[];
  monthlyData: ChartDataPoint[];
  yearlyData: ChartDataPoint[];
  currentPresetLabel: string;
}

type ChartViewType = "daily" | "monthly" | "yearly";
type MetricType = "sales" | "orders" | "both";

export function OrderAnalyticsCharts({
  dailyData,
  monthlyData,
  yearlyData,
  currentPresetLabel,
}: OrderAnalyticsChartsProps) {
  const [activeView, setActiveView] = useState<ChartViewType>("daily");
  const [activeMetric, setActiveMetric] = useState<MetricType>("sales");
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);

  const gradientId = useId();

  const currentDataset =
    activeView === "daily"
      ? dailyData
      : activeView === "monthly"
      ? monthlyData
      : yearlyData;

  const hasData = currentDataset.some(
    (d) => d.orderCount > 0 || (d.sales ?? d.totalOrderValue ?? d.revenue) > 0
  );

  // SVG dimensions
  const width = 800;
  const height = 280;
  const paddingLeft = 60;
  const paddingRight = 24;
  const paddingTop = 28;
  const paddingBottom = 40;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Max calculations
  const maxSales = Math.max(
    ...currentDataset.map((d) => d.sales ?? d.totalOrderValue ?? d.revenue),
    100
  );
  const maxOrders = Math.max(...currentDataset.map((d) => d.orderCount), 5);

  const count = currentDataset.length || 1;
  const stepX = plotWidth / count;
  const barWidth = Math.max(Math.min(stepX * 0.55, 36), 6);

  // Y-axis ticks (4 ticks)
  const yTicks = [0, 0.33, 0.66, 1];

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-7 border border-slate-800 space-y-6">
      {/* Chart Top Controls & Toggles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              Order Volume & Sales Trends
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {activeView === "daily"
                ? currentPresetLabel
                : activeView === "monthly"
                ? "This Year Monthly"
                : "Multi-Year"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative visualization of placed orders and non-cancelled sales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Granularity Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveView("daily")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeView === "daily"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Daily</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("monthly")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeView === "monthly"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Monthly</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("yearly")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeView === "yearly"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Yearly</span>
            </button>
          </div>

          {/* Metric Filter Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveMetric("sales")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeMetric === "sales"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sales (₹)
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric("orders")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeMetric === "orders"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Orders Count
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric("both")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeMetric === "both"
                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Dual View
            </button>
          </div>
        </div>
      </div>

      {/* The Responsive Chart Area */}
      {!hasData ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-300">
            No Orders Recorded in this Period
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            There are no customer orders recorded for the selected date range. As soon as orders are
            placed at your tables, daily and monthly volume trends will appear here.
          </p>
        </div>
      ) : (
        <div className="relative w-full">
          {/* Interactive Tooltip Card */}
          {hoveredPoint && (
            <div className="absolute top-2 right-4 z-10 p-3 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md text-xs space-y-1 font-mono pointer-events-none transition-all">
              <div className="font-bold text-white font-sans text-sm pb-1 border-b border-slate-800 flex items-center justify-between gap-4">
                <span>{hoveredPoint.label}</span>
                <span className="text-[10px] text-slate-400">{hoveredPoint.key}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1">
                <span className="text-slate-400">Total Orders:</span>
                <span className="font-bold text-amber-300">{hoveredPoint.orderCount}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Total Sales:</span>
                <span className="font-bold text-emerald-400">
                  {formatCurrencyINR(hoveredPoint.sales ?? hoveredPoint.totalOrderValue ?? hoveredPoint.revenue)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Completed Sales:</span>
                <span className="font-bold text-teal-300">
                  {formatCurrencyINR(hoveredPoint.completedSales ?? hoveredPoint.completedOrderValue ?? hoveredPoint.completedRevenue)}
                </span>
              </div>
              {hoveredPoint.cancelledCount > 0 && (
                <div className="flex justify-between gap-4 text-rose-400">
                  <span>Cancelled Orders:</span>
                  <span>{hoveredPoint.cancelledCount} (Excluded)</span>
                </div>
              )}
            </div>
          )}

          {/* SVG Canvas */}
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto min-w-[620px] select-none"
              style={{ overflow: "visible" }}
            >
              <defs>
                <linearGradient id={`${gradientId}-sales`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.25" />
                </linearGradient>
                <linearGradient id={`${gradientId}-orders`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Grid Lines & Y-Axis Labels */}
              {yTicks.map((pct, idx) => {
                const y = paddingTop + plotHeight * (1 - pct);
                const val = maxSales * pct;
                const ordVal = Math.round(maxOrders * pct);

                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="rgba(51, 65, 85, 0.4)"
                      strokeDasharray={pct === 0 ? "none" : "3 3"}
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {activeMetric === "orders" ? ordVal : formatCompactINR(val)}
                    </text>
                  </g>
                );
              })}

              {/* Data Bars */}
              {currentDataset.map((d, i) => {
                const centerX = paddingLeft + i * stepX + stepX / 2;
                const barX = centerX - barWidth / 2;

                const val = d.sales ?? d.totalOrderValue ?? d.revenue;
                let barHeight = 0;
                let gradient = `url(#${gradientId}-sales)`;

                if (activeMetric === "sales" || activeMetric === "both") {
                  barHeight = maxSales > 0 ? (val / maxSales) * plotHeight : 0;
                  gradient = `url(#${gradientId}-sales)`;
                } else if (activeMetric === "orders") {
                  barHeight = maxOrders > 0 ? (d.orderCount / maxOrders) * plotHeight : 0;
                  gradient = `url(#${gradientId}-orders)`;
                }

                const barY = paddingTop + plotHeight - barHeight;
                const isHovered = hoveredPoint?.key === d.key;

                return (
                  <g
                    key={d.key}
                    onMouseEnter={() => setHoveredPoint(d)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="cursor-pointer transition-opacity"
                  >
                    {/* Hover hotspot column */}
                    <rect
                      x={paddingLeft + i * stepX}
                      y={paddingTop}
                      width={stepX}
                      height={plotHeight}
                      fill="transparent"
                      className="hover:fill-slate-800/20 transition-colors"
                    />

                    {/* The bar */}
                    {barHeight > 0 && (
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={barHeight}
                        rx={barWidth > 12 ? 4 : 2}
                        fill={gradient}
                        className={`transition-all duration-200 ${
                          isHovered ? "brightness-125 filter drop-shadow-md" : ""
                        }`}
                      />
                    )}

                    {/* X-axis Label (Sampled if many items) */}
                    {(count <= 14 || i % Math.ceil(count / 10) === 0 || i === count - 1) && (
                      <text
                        x={centerX}
                        y={height - paddingBottom + 16}
                        textAnchor="middle"
                        className={`fill-slate-400 text-[10px] font-mono ${
                          isHovered ? "fill-amber-300 font-bold" : ""
                        }`}
                      >
                        {d.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Trend Line for Dual View */}
              {activeMetric === "both" && (
                <path
                  d={currentDataset
                    .map((d, i) => {
                      const cx = paddingLeft + i * stepX + stepX / 2;
                      const cy =
                        paddingTop + plotHeight - (maxOrders > 0 ? (d.orderCount / maxOrders) * plotHeight : 0);
                      return `${i === 0 ? "M" : "L"} ${cx} ${cy}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {activeMetric === "both" &&
                currentDataset.map((d, i) => {
                  const cx = paddingLeft + i * stepX + stepX / 2;
                  const cy =
                    paddingTop + plotHeight - (maxOrders > 0 ? (d.orderCount / maxOrders) * plotHeight : 0);
                  const isHovered = hoveredPoint?.key === d.key;

                  return (
                    <circle
                      key={`pt-${d.key}`}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5 : 3}
                      fill="#f59e0b"
                      stroke="#0f172a"
                      strokeWidth="2"
                      className="transition-all"
                    />
                  );
                })}
            </svg>
          </div>
        </div>
      )}

      {/* Legend & Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            <span>Total Sales (Excludes Cancelled)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
            <span>Orders Count</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          Hover over bars for exact day-by-day sales and status details
        </div>
      </div>
    </div>
  );
}
