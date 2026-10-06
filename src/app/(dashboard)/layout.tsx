import React from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SuperAdminNav } from "@/components/navigation/SuperAdminNav";
import { RestaurantAdminNav } from "@/components/navigation/RestaurantAdminNav";
import { UserRole } from "@prisma/client";
import { RestaurantDashboardClientShell } from "@/components/layout/RestaurantDashboardClientShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  return (
    <RestaurantDashboardClientShell>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {isSuperAdmin ? (
          <SuperAdminNav user={user} />
        ) : (
          <RestaurantAdminNav user={user} />
        )}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </RestaurantDashboardClientShell>
  );
}
