import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { RestaurantGstSettingsManager } from "@/components/restaurants/RestaurantGstSettingsManager";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantSettingsPage({ params }: SettingsPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  // Verify access for OWNER, MANAGER, or STAFF (staff gets read-only)
  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
    MembershipRole.OWNER,
    MembershipRole.MANAGER,
    MembershipRole.STAFF,
  ]);

  if (!access.authorized) {
    redirect("/dashboard");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      phone: true,
      googleReviewUrl: true,
      gstEnabled: true,
      gstin: true,
      legalName: true,
      taxRate: true,
      taxMode: true,
    },
  });

  if (!restaurant) {
    notFound();
  }

  const effectiveRole = access.membershipRole || MembershipRole.STAFF;

  return (
    <RestaurantGstSettingsManager
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        address: restaurant.address,
        phone: restaurant.phone,
        googleReviewUrl: restaurant.googleReviewUrl,
        gstEnabled: restaurant.gstEnabled,
        gstin: restaurant.gstin,
        legalName: restaurant.legalName,
        taxRate: Number(restaurant.taxRate),
        taxMode: restaurant.taxMode,
      }}
      userRole={effectiveRole}
    />
  );
}
