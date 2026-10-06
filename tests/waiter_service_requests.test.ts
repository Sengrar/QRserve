import { describe, it, expect } from "vitest";
import {
  CreateServiceRequestSchema,
  UpdateServiceRequestStatusSchema,
} from "@/lib/validations/service-request";
import { ServiceRequestType, ServiceRequestStatus, UserRole, MembershipRole } from "@prisma/client";

describe("Waiter Call & Service Request System", () => {
  describe("Zod Validation Schemas", () => {
    it("validates a valid service request with all valid request types", () => {
      const types = [
        ServiceRequestType.CALL_WAITER,
        ServiceRequestType.WATER,
        ServiceRequestType.CUTLERY,
        ServiceRequestType.CLEANING,
        ServiceRequestType.OTHER,
      ];

      for (const t of types) {
        const result = CreateServiceRequestSchema.safeParse({
          qrToken: "qr_validtoken1234567890abcdef123456",
          type: t,
          message: "Please bring 2 glasses",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(t);
        }
      }
    });

    it("accepts service request without optional message", () => {
      const result = CreateServiceRequestSchema.safeParse({
        qrToken: "qr_validtoken1234567890abcdef123456",
        type: ServiceRequestType.CALL_WAITER,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBeUndefined();
      }
    });

    it("rejects request when qrToken is missing or empty", () => {
      const result = CreateServiceRequestSchema.safeParse({
        qrToken: "   ",
        type: ServiceRequestType.CALL_WAITER,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.qrToken).toBeDefined();
      }
    });

    it("rejects invalid service request type", () => {
      const result = CreateServiceRequestSchema.safeParse({
        qrToken: "qr_12345",
        type: "INVALID_TYPE",
      });
      expect(result.success).toBe(false);
    });

    it("rejects message exceeding 200 characters", () => {
      const result = CreateServiceRequestSchema.safeParse({
        qrToken: "qr_12345",
        type: ServiceRequestType.OTHER,
        message: "a".repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.message).toBeDefined();
      }
    });

    it("validates status update schema with valid statuses", () => {
      const validStatuses = [
        ServiceRequestStatus.PENDING,
        ServiceRequestStatus.IN_PROGRESS,
        ServiceRequestStatus.COMPLETED,
        ServiceRequestStatus.CANCELLED,
      ];

      for (const status of validStatuses) {
        const result = UpdateServiceRequestStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it("rejects unknown status in status update schema", () => {
      const result = UpdateServiceRequestStatusSchema.safeParse({ status: "UNKNOWN" });
      expect(result.success).toBe(false);
    });
  });

  describe("Customer Request Creation & QR Token Validation", () => {
    const mockRestaurant = {
      id: "rest_alpha",
      slug: "bistro-alpha",
      isActive: true,
      approvalStatus: "APPROVED",
      isSuspended: false,
    };

    const mockTables = [
      {
        id: "tbl_1",
        restaurantId: "rest_alpha",
        tableNumber: "T-1",
        name: "Patio Corner",
        qrToken: "qr_alpha_valid",
        isActive: true,
        status: "AVAILABLE",
      },
      {
        id: "tbl_2",
        restaurantId: "rest_alpha",
        tableNumber: "T-2",
        name: "Booth 2",
        qrToken: "qr_alpha_inactive",
        isActive: false,
        status: "INACTIVE",
      },
      {
        id: "tbl_beta",
        restaurantId: "rest_beta",
        tableNumber: "T-1",
        name: "Beta Table",
        qrToken: "qr_beta_token",
        isActive: true,
        status: "AVAILABLE",
      },
    ];

    function validateAndResolveCustomerRequest(
      restaurantId: string,
      qrToken: string,
      type: ServiceRequestType,
      message?: string
    ) {
      const table = mockTables.find(
        (t) => t.restaurantId === restaurantId && t.qrToken === qrToken
      );

      if (!table) {
        return {
          success: false,
          error: "Invalid or expired table QR code. Please scan a valid table QR to request service.",
          status: 400,
        };
      }

      if (!table.isActive || table.status === "INACTIVE") {
        return {
          success: false,
          error: `Table ${table.tableNumber} is currently marked inactive and cannot place service requests.`,
          status: 400,
        };
      }

      return {
        success: true,
        data: {
          restaurantId,
          tableId: table.id,
          tableNumber: table.tableNumber,
          tableName: table.name,
          type,
          message: message || null,
          status: ServiceRequestStatus.PENDING,
        },
      };
    }

    it("successfully creates a customer service request with a valid table QR", () => {
      const result = validateAndResolveCustomerRequest(
        mockRestaurant.id,
        "qr_alpha_valid",
        ServiceRequestType.WATER,
        "Extra chilled please"
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.tableId).toBe("tbl_1");
        expect(result.data.tableNumber).toBe("T-1");
        expect(result.data.type).toBe("WATER");
        expect(result.data.message).toBe("Extra chilled please");
        expect(result.data.status).toBe("PENDING");
      }
    });

    it("rejects service request when QR token is invalid or non-existent", () => {
      const result = validateAndResolveCustomerRequest(
        mockRestaurant.id,
        "qr_non_existent_fake",
        ServiceRequestType.CALL_WAITER
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid or expired table QR code");
    });

    it("rejects service request when table is marked inactive", () => {
      const result = validateAndResolveCustomerRequest(
        mockRestaurant.id,
        "qr_alpha_inactive",
        ServiceRequestType.CALL_WAITER
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("currently marked inactive");
    });

    it("defends against cross-tenant table QR token replay (Cross-Tenant Access Defense)", () => {
      // Attacker attempts to use Restaurant Beta's QR token against Restaurant Alpha
      const result = validateAndResolveCustomerRequest(
        mockRestaurant.id,
        "qr_beta_token", // Belongs to rest_beta!
        ServiceRequestType.CLEANING
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid or expired table QR code");
    });
  });

  describe("Duplicate Submission Protection", () => {
    interface MockRequest {
      id: string;
      restaurantId: string;
      tableId: string;
      type: ServiceRequestType;
      status: ServiceRequestStatus;
      createdAt: Date;
    }

    const existingRequests: MockRequest[] = [
      {
        id: "req_1",
        restaurantId: "rest_alpha",
        tableId: "tbl_1",
        type: ServiceRequestType.CALL_WAITER,
        status: ServiceRequestStatus.PENDING,
        createdAt: new Date(Date.now() - 20 * 1000), // 20s ago (within 60s cooldown)
      },
      {
        id: "req_2",
        restaurantId: "rest_alpha",
        tableId: "tbl_1",
        type: ServiceRequestType.WATER,
        status: ServiceRequestStatus.COMPLETED, // Completed, so new request should be allowed
        createdAt: new Date(Date.now() - 30 * 1000),
      },
      {
        id: "req_3",
        restaurantId: "rest_alpha",
        tableId: "tbl_1",
        type: ServiceRequestType.CUTLERY,
        status: ServiceRequestStatus.PENDING,
        createdAt: new Date(Date.now() - 90 * 1000), // 90s ago (exceeded 60s cooldown)
      },
    ];

    function checkDuplicateProtection(
      restaurantId: string,
      tableId: string,
      type: ServiceRequestType
    ) {
      const cooldownMs = 60 * 1000;
      const now = Date.now();

      const activeDuplicate = existingRequests.find(
        (r) =>
          r.restaurantId === restaurantId &&
          r.tableId === tableId &&
          r.type === type &&
          (r.status === ServiceRequestStatus.PENDING ||
            r.status === ServiceRequestStatus.IN_PROGRESS) &&
          now - r.createdAt.getTime() <= cooldownMs
      );

      if (activeDuplicate) {
        return {
          isDuplicate: true,
          status: 409,
          error: "A request for this service is already pending for this table. Our staff is on the way!",
        };
      }

      return { isDuplicate: false };
    }

    it("detects and blocks identical active service request within cooldown window", () => {
      // Table 1 requested CALL_WAITER 20s ago
      const check = checkDuplicateProtection("rest_alpha", "tbl_1", ServiceRequestType.CALL_WAITER);
      expect(check.isDuplicate).toBe(true);
      expect(check.status).toBe(409);
    });

    it("allows different service request type from the same table (e.g. Water while Waiter call pending)", () => {
      const check = checkDuplicateProtection("rest_alpha", "tbl_1", ServiceRequestType.CLEANING);
      expect(check.isDuplicate).toBe(false);
    });

    it("allows new request if previous request is already marked COMPLETED", () => {
      // Table 1 requested WATER, but it was already marked COMPLETED
      const check = checkDuplicateProtection("rest_alpha", "tbl_1", ServiceRequestType.WATER);
      expect(check.isDuplicate).toBe(false);
    });

    it("allows new request after cooldown window has elapsed", () => {
      // Table 1 requested CUTLERY 90s ago (> 60s cooldown)
      const check = checkDuplicateProtection("rest_alpha", "tbl_1", ServiceRequestType.CUTLERY);
      expect(check.isDuplicate).toBe(false);
    });
  });

  describe("Staff Management & Status Lifecycle Transitions", () => {
    interface ManagedRequest {
      id: string;
      restaurantId: string;
      tableId: string;
      status: ServiceRequestStatus;
    }

    const mockDbRequests: ManagedRequest[] = [
      {
        id: "req_alpha_1",
        restaurantId: "rest_alpha",
        tableId: "tbl_1",
        status: ServiceRequestStatus.PENDING,
      },
      {
        id: "req_alpha_2",
        restaurantId: "rest_alpha",
        tableId: "tbl_2",
        status: ServiceRequestStatus.IN_PROGRESS,
      },
      {
        id: "req_beta_1",
        restaurantId: "rest_beta",
        tableId: "tbl_beta",
        status: ServiceRequestStatus.PENDING,
      },
    ];

    function updateStaffRequestStatus(
      user: { id: string; role: UserRole; restaurantMemberships: { restaurantId: string; role: MembershipRole }[] },
      restaurantId: string,
      requestId: string,
      newStatus: ServiceRequestStatus
    ) {
      // 1. Authorize user membership for restaurantId
      const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
      const membership = user.restaurantMemberships.find((m) => m.restaurantId === restaurantId);

      if (!isSuperAdmin && !membership) {
        return { authorized: false, status: 403, error: "Access denied." };
      }

      // 2. Find request and enforce multi-tenant restaurantId isolation
      const target = mockDbRequests.find((r) => r.id === requestId);
      if (!target || target.restaurantId !== restaurantId) {
        return { authorized: true, found: false, status: 404, error: "Service request not found." };
      }

      target.status = newStatus;
      return { authorized: true, found: true, status: 200, data: target };
    }

    const staffUserAlpha = {
      id: "user_staff_1",
      role: UserRole.STAFF,
      restaurantMemberships: [{ restaurantId: "rest_alpha", role: MembershipRole.STAFF }],
    };

    const staffUserBeta = {
      id: "user_staff_2",
      role: UserRole.STAFF,
      restaurantMemberships: [{ restaurantId: "rest_beta", role: MembershipRole.STAFF }],
    };

    it("allows authorized staff to accept pending request (PENDING -> IN_PROGRESS)", () => {
      const res = updateStaffRequestStatus(
        staffUserAlpha,
        "rest_alpha",
        "req_alpha_1",
        ServiceRequestStatus.IN_PROGRESS
      );
      expect(res.authorized).toBe(true);
      expect(res.status).toBe(200);
      expect(res.data?.status).toBe(ServiceRequestStatus.IN_PROGRESS);
    });

    it("allows authorized staff to complete request (IN_PROGRESS -> COMPLETED)", () => {
      const res = updateStaffRequestStatus(
        staffUserAlpha,
        "rest_alpha",
        "req_alpha_2",
        ServiceRequestStatus.COMPLETED
      );
      expect(res.authorized).toBe(true);
      expect(res.status).toBe(200);
      expect(res.data?.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it("blocks unauthorized user from accessing restaurant requests", () => {
      const res = updateStaffRequestStatus(
        staffUserBeta, // Beta staff trying to operate on Alpha restaurant
        "rest_alpha",
        "req_alpha_1",
        ServiceRequestStatus.COMPLETED
      );
      expect(res.authorized).toBe(false);
      expect(res.status).toBe(403);
    });

    it("prevents cross-tenant request modification when manipulating requestId", () => {
      // Alpha staff tries to modify Beta's request (req_beta_1) while authenticated to rest_alpha
      const res = updateStaffRequestStatus(
        staffUserAlpha,
        "rest_alpha",
        "req_beta_1",
        ServiceRequestStatus.COMPLETED
      );
      expect(res.found).toBe(false);
      expect(res.status).toBe(404);
    });
  });
});
