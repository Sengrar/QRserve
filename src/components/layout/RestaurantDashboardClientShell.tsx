"use client";

import React from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { RestaurantNotificationProvider } from "@/context/RestaurantNotificationContext";

const NotificationToasts = dynamic(
  () =>
    import("@/components/notifications/NotificationToasts").then(
      (mod) => mod.NotificationToasts
    ),
  { ssr: false }
);

interface RestaurantDashboardClientShellProps {
  children: React.ReactNode;
}

export function RestaurantDashboardClientShell({
  children,
}: RestaurantDashboardClientShellProps) {
  const pathname = usePathname();

  // Extract restaurantId from /restaurants/[id]/*
  const restaurantMatch = pathname.match(/^\/restaurants\/([^/]+)/);
  const currentRestaurantId = restaurantMatch ? restaurantMatch[1] : null;
  const activeRestaurantId = currentRestaurantId === "new" ? null : currentRestaurantId;

  return (
    <RestaurantNotificationProvider key={activeRestaurantId || "root"} restaurantId={activeRestaurantId}>
      {children}
      <NotificationToasts />
    </RestaurantNotificationProvider>
  );
}
