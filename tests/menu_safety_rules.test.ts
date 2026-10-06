import { describe, it, expect } from "vitest";

describe("Phase 2 Menu Business & Safety Rules", () => {
  describe("Category Deletion Safety Guard", () => {
    it("protects categories containing dishes from accidental deletion", () => {
      // Simulating category safety evaluation
      function evaluateCategoryDeletion(category: {
        id: string;
        name: string;
        itemCount: number;
      }) {
        if (category.itemCount > 0) {
          return {
            allowed: false,
            error: `Cannot delete category "${category.name}" because it contains ${category.itemCount} menu item(s). Please move or delete the items first.`,
          };
        }
        return { allowed: true };
      }

      const categoryWithDishes = {
        id: "cat_1",
        name: "Main Course",
        itemCount: 4,
      };

      const result = evaluateCategoryDeletion(categoryWithDishes);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("contains 4 menu item(s)");

      const emptyCategory = {
        id: "cat_2",
        name: "Seasonal Specials",
        itemCount: 0,
      };

      const emptyResult = evaluateCategoryDeletion(emptyCategory);
      expect(emptyResult.allowed).toBe(true);
    });
  });

  describe("Real-time Dish Availability Filter", () => {
    it("filters out unavailable dishes for customer-facing display", () => {
      const items = [
        { id: "1", name: "Margherita Pizza", price: 399, isAvailable: true },
        { id: "2", name: "Truffle Pasta", price: 549, isAvailable: false }, // Sold out
        { id: "3", name: "Tiramisu", price: 249, isAvailable: true },
      ];

      const publicVisibleItems = items.filter((i) => i.isAvailable);

      expect(publicVisibleItems.length).toBe(2);
      expect(publicVisibleItems.map((i) => i.name)).toEqual([
        "Margherita Pizza",
        "Tiramisu",
      ]);
      expect(publicVisibleItems.some((i) => i.name === "Truffle Pasta")).toBe(false);
    });
  });

  describe("Category Sorting Order", () => {
    it("sorts categories by ascending sortOrder then by name", () => {
      const categories = [
        { id: "3", name: "Desserts", sortOrder: 30 },
        { id: "1", name: "Starters", sortOrder: 10 },
        { id: "2", name: "Beverages", sortOrder: 10 },
        { id: "4", name: "Mains", sortOrder: 20 },
      ];

      const sorted = [...categories].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });

      expect(sorted.map((c) => c.name)).toEqual([
        "Beverages",
        "Starters",
        "Mains",
        "Desserts",
      ]);
    });
  });
});
