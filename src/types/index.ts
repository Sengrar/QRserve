import {
  UserRole,
  ApprovalStatus,
  MembershipRole,
  SubscriptionPlan,
  SubscriptionStatus,
  PaymentMethod,
  PaymentRequestStatus,
} from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sessionId?: string;
}

export interface RestaurantStatusSummary {
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  isActive: boolean;
  isSuspended: boolean;
  canAcceptOrders: boolean;
}

export interface RestaurantWithMembership {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  googleReviewUrl: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  isActive: boolean;
  isSuspended: boolean;
  role: MembershipRole;
  createdAt: Date;
}

export interface SubscriptionDetails {
  id: string;
  restaurantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  tableLimit: number;
  amount: number | string;
  amountPaise: number;
  startDate: string | Date;
  endDate: string | Date;
  notes?: string | null;
}

export interface SubscriptionPaymentRequestItem {
  id: string;
  plan: SubscriptionPlan;
  tableCount: number;
  amount: number | string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  utrReference: string;
  proofUrl?: string | null;
  status: PaymentRequestStatus;
  adminNotes?: string | null;
  reviewedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface SystemPaymentConfigDetails {
  id: string;
  upiId: string;
  payeeName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;
  instructions?: string | null;
}

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string[]>;
  message?: string;
};
