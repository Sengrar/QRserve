import { describe, it, expect } from "vitest";
import { CreateTableSchema, UpdateTableSchema } from "@/lib/validations/table";
import { TableStatus } from "@prisma/client";

describe("Phase 3 Table Management Validations & Rules", () => {
  describe("CreateTableSchema", () => {
    it("accepts a valid table number with default AVAILABLE status", () => {
      const parsed = CreateTableSchema.safeParse({
        tableNumber: "T-101",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tableNumber).toBe("T-101");
        expect(parsed.data.status).toBe(TableStatus.AVAILABLE);
        expect(parsed.data.isActive).toBe(true);
        expect(parsed.data.name).toBeUndefined();
      }
    });

    it("accepts table with custom name and specific status", () => {
      const parsed = CreateTableSchema.safeParse({
        tableNumber: "VIP-1",
        name: "Rooftop Cabana",
        status: TableStatus.RESERVED,
        isActive: true,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tableNumber).toBe("VIP-1");
        expect(parsed.data.name).toBe("Rooftop Cabana");
        expect(parsed.data.status).toBe(TableStatus.RESERVED);
      }
    });

    it("rejects empty table number", () => {
      const invalid = CreateTableSchema.safeParse({
        tableNumber: "   ",
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.tableNumber).toBeDefined();
      }
    });

    it("rejects table number longer than 50 characters", () => {
      const invalid = CreateTableSchema.safeParse({
        tableNumber: "T".repeat(51),
      });

      expect(invalid.success).toBe(false);
    });

    it("rejects invalid status enum values", () => {
      const invalid = CreateTableSchema.safeParse({
        tableNumber: "T-1",
        status: "BROKEN",
      });

      expect(invalid.success).toBe(false);
    });
  });

  describe("UpdateTableSchema", () => {
    it("allows partial updates to status or name", () => {
      const statusUpdate = UpdateTableSchema.safeParse({
        status: TableStatus.OCCUPIED,
      });
      expect(statusUpdate.success).toBe(true);
      if (statusUpdate.success) {
        expect(statusUpdate.data.status).toBe(TableStatus.OCCUPIED);
      }

      const nameUpdate = UpdateTableSchema.safeParse({
        name: "Window Seat 2",
      });
      expect(nameUpdate.success).toBe(true);
    });

    it("allows deactivating table", () => {
      const deactivation = UpdateTableSchema.safeParse({
        isActive: false,
        status: TableStatus.INACTIVE,
      });
      expect(deactivation.success).toBe(true);
      if (deactivation.success) {
        expect(deactivation.data.isActive).toBe(false);
      }
    });
  });

  describe("Table Status Synchronization Rules", () => {
    it("synchronizes inactive flag with TableStatus.INACTIVE", () => {
      function resolveTableState(input: { isActive?: boolean; status?: TableStatus }) {
        let active = input.isActive ?? true;
        let status = input.status ?? TableStatus.AVAILABLE;

        if (input.isActive === false || status === TableStatus.INACTIVE) {
          active = false;
          status = TableStatus.INACTIVE;
        }

        return { active, status };
      }

      const inactiveState = resolveTableState({ isActive: false, status: TableStatus.AVAILABLE });
      expect(inactiveState.active).toBe(false);
      expect(inactiveState.status).toBe(TableStatus.INACTIVE);

      const statusInactive = resolveTableState({ isActive: true, status: TableStatus.INACTIVE });
      expect(statusInactive.active).toBe(false);
      expect(statusInactive.status).toBe(TableStatus.INACTIVE);

      const activeState = resolveTableState({ isActive: true, status: TableStatus.OCCUPIED });
      expect(activeState.active).toBe(true);
      expect(activeState.status).toBe(TableStatus.OCCUPIED);
    });
  });
});
