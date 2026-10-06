import { describe, it, expect } from "vitest";
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
} from "@/lib/validations/menu";

describe("Phase 2 Menu & Category Validation Schemas", () => {
  describe("Category Schemas", () => {
    it("accepts valid category creation input", () => {
      const valid = CreateCategorySchema.safeParse({
        name: "Artisan Pizzas",
        description: "Fresh wood-fired sourdough pizzas",
        sortOrder: 10,
        isActive: true,
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.name).toBe("Artisan Pizzas");
        expect(valid.data.sortOrder).toBe(10);
      }
    });

    it("rejects empty category name", () => {
      const invalid = CreateCategorySchema.safeParse({
        name: "   ",
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.name).toBeDefined();
      }
    });

    it("rejects category name longer than 50 characters", () => {
      const invalid = CreateCategorySchema.safeParse({
        name: "A".repeat(51),
      });

      expect(invalid.success).toBe(false);
    });

    it("allows partial updates in UpdateCategorySchema", () => {
      const valid = UpdateCategorySchema.safeParse({
        isActive: false,
      });

      expect(valid.success).toBe(true);
    });
  });

  describe("Menu Item Schemas", () => {
    it("accepts valid menu item with positive price and valid decimals", () => {
      const valid = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Truffle Fries",
        description: "Crispy skin-on fries with white truffle oil",
        price: "249.50",
        imageUrl: "https://example.com/fries.jpg",
        isAvailable: true,
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.price).toBe(249.5);
      }
    });

    it("rejects zero or negative price", () => {
      const zero = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Free Item",
        price: 0,
      });

      expect(zero.success).toBe(false);

      const negative = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Bad Item",
        price: -50,
      });

      expect(negative.success).toBe(false);
    });

    it("rejects prices with more than 2 decimal places", () => {
      const invalid = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Precision Item",
        price: 199.999, // 3 decimal places
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.price).toBeDefined();
      }
    });

    it("rejects menu item with missing categoryId", () => {
      const invalid = CreateMenuItemSchema.safeParse({
        name: "Orphan Item",
        price: 100,
      });

      expect(invalid.success).toBe(false);
    });

    it("rejects invalid image URL format", () => {
      const invalid = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Photo Item",
        price: 100,
        imageUrl: "not-a-valid-url",
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.imageUrl).toBeDefined();
      }
    });

    it("accepts relative uploaded image paths", () => {
      const valid = CreateMenuItemSchema.safeParse({
        categoryId: "cat_123",
        name: "Uploaded Photo Item",
        price: 150,
        imageUrl: "/api/restaurants/rest_abc123/images/dish-uuid.webp",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.imageUrl).toBe("/api/restaurants/rest_abc123/images/dish-uuid.webp");
      }
    });

    it("allows partial updates via UpdateMenuItemSchema", () => {
      const valid = UpdateMenuItemSchema.safeParse({
        price: 320.0,
        isAvailable: false,
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.isAvailable).toBe(false);
      }
    });
  });
});
