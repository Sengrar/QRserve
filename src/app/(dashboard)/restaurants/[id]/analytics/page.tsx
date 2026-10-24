import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { MembershipRole } from "@prisma/client";
import { AnalyticsDatePreset } from "@/lib/analytics/dates";
import { getRestaurantOrderAnalytics } from "@/lib/analytics/service";
import { RestaurantOrderAnalytics } from "@/components/analytics/RestaurantOrderAnalytics";

export const dynamic = "force-dynamic";

interface AnalyticsPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}

export default async function RestaurantAnalyticsPage({
  params,
  searchParams,
}: AnalyticsPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;
  const { preset, startDate, endDate } = await searchParams;

  // Strict tenant authorization check: Owner, Manager, or Staff
  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
    MembershipRole.OWNER,
    MembershipRole.MANAGER,
    MembershipRole.STAFF,
  ]);

  if (!access.authorized) {
    redirect("/dashboard");
  }

  const validPreset: AnalyticsDatePreset =
    preset &&
    [
      "today",
      "yesterday",
      "last7days",
      "last30days",
      "thismonth",
      "lastmonth",
      "thisyear",
      "custom",
    ].includes(preset.toLowerCase())
      ? (preset.toLowerCase() as AnalyticsDatePreset)
      : "last7days";

  const [restaurant, initialData] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    getRestaurantOrderAnalytics(
      restaurantId,
      validPreset,
      startDate,
      endDate
    ),
  ]);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantOrderAnalytics
      restaurant={restaurant}
      initialData={initialData}
    />
  );
}
