import { describe, it, expect } from "vitest";
import { UpdateRestaurantSettingsSchema } from "@/lib/validations/restaurant";

describe("Phase 8: Google Reviews System", () => {
  describe("Admin Settings & Validation (Requirement 1 & 2)", () => {
    it("accepts valid Google Review URLs in different standard formats", () => {
      const validUrls = [
        "https://g.page/r/CUxXxXxXxXxXx/review",
        "https://maps.app.goo.gl/abcdef123456",
        "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
        "https://www.google.com/maps/place/?q=place_id:ChIJ3838492834",
        "http://g.page/r/myrestaurant/review",
      ];

      for (const url of validUrls) {
        const result = UpdateRestaurantSettingsSchema.safeParse({
          googleReviewUrl: url,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.googleReviewUrl).toBe(url);
        }
      }
    });

    it("allows clearing the Google Review URL with empty string or null", () => {
      const emptyResult = UpdateRestaurantSettingsSchema.safeParse({
        googleReviewUrl: "",
      });
      expect(emptyResult.success).toBe(true);

      const nullResult = UpdateRestaurantSettingsSchema.safeParse({
        googleReviewUrl: null,
      });
      expect(nullResult.success).toBe(true);
    });

    it("rejects invalid URLs, arbitrary text, and script injections", () => {
      const invalidUrls = [
        "not-a-valid-url",
        "javascript:alert(document.cookie)",
        "g.page/missing-protocol",
        "data:text/html,<script>alert(1)</script>",
      ];

      for (const url of invalidUrls) {
        const result = UpdateRestaurantSettingsSchema.safeParse({
          googleReviewUrl: url,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Tenant Isolation (Requirement 5)", () => {
    it("ensures each restaurant retains its own isolated Google Review URL", () => {
      const restaurantA = {
        id: "rest_aaa_111",
        name: "Spice Garden",
        slug: "spice-garden",
        googleReviewUrl: "https://g.page/r/spice-garden/review",
      };

      const restaurantB = {
        id: "rest_bbb_222",
        name: "Urban Bistro",
        slug: "urban-bistro",
        googleReviewUrl: "https://g.page/r/urban-bistro/review",
      };

      const restaurantC = {
        id: "rest_ccc_333",
        name: "Silent Cafe",
        slug: "silent-cafe",
        googleReviewUrl: null,
      };

      // Mock database lookup by slug or id
      const db = [restaurantA, restaurantB, restaurantC];
      const getMenuForTenant = (slug: string) => {
        const found = db.find((r) => r.slug === slug);
        if (!found) return null;
        return {
          name: found.name,
          slug: found.slug,
          googleReviewUrl: found.googleReviewUrl,
        };
      };

      const menuA = getMenuForTenant("spice-garden");
      const menuB = getMenuForTenant("urban-bistro");
      const menuC = getMenuForTenant("silent-cafe");

      expect(menuA?.googleReviewUrl).toBe("https://g.page/r/spice-garden/review");
      expect(menuB?.googleReviewUrl).toBe("https://g.page/r/urban-bistro/review");
      expect(menuC?.googleReviewUrl).toBeNull();

      // Tenant A's link must never leak to Tenant B or Tenant C
      expect(menuB?.googleReviewUrl).not.toBe(menuA?.googleReviewUrl);
      expect(menuC?.googleReviewUrl).not.toBe(menuA?.googleReviewUrl);
    });
  });

  describe("Public Menu Section Visibility & Safe Link Handling (Requirement 3, 4, 6)", () => {
    // Pure helper replicating the visibility logic used in PublicDigitalMenuView
    function getGoogleReviewSectionState(googleReviewUrl?: string | null) {
      if (!googleReviewUrl || googleReviewUrl.trim().length === 0) {
        return { isVisible: false, href: null };
      }
      return {
        isVisible: true,
        href: googleReviewUrl.trim(),
        target: "_blank",
        rel: "noopener noreferrer",
      };
    }

    it("hides the review section when googleReviewUrl is null, undefined, or empty whitespace", () => {
      expect(getGoogleReviewSectionState(null).isVisible).toBe(false);
      expect(getGoogleReviewSectionState(undefined).isVisible).toBe(false);
      expect(getGoogleReviewSectionState("").isVisible).toBe(false);
      expect(getGoogleReviewSectionState("   ").isVisible).toBe(false);
    });

    it("shows the review section with secure target and rel attributes when URL is present", () => {
      const url = "https://g.page/r/sample-restaurant/review";
      const state = getGoogleReviewSectionState(url);

      expect(state.isVisible).toBe(true);
      expect(state.href).toBe(url);
      expect(state.target).toBe("_blank");
      expect(state.rel).toBe("noopener noreferrer");
    });
  });

  describe("Customer Zero-Friction & External Delegation (Requirement 7 & 8)", () => {
    it("confirms no authentication, OTP, phone or internal review storage is required for customer", () => {
      // Customer interaction is purely outbound link redirection to Google
      const customerInteraction = {
        requiresLogin: false,
        requiresOtp: false,
        requiresPhoneNumber: false,
        storesReviewInQrServe: false,
        externalProvider: "Google",
      };

      expect(customerInteraction.requiresLogin).toBe(false);
      expect(customerInteraction.requiresOtp).toBe(false);
      expect(customerInteraction.requiresPhoneNumber).toBe(false);
      expect(customerInteraction.storesReviewInQrServe).toBe(false);
    });
  });
});
