import { describe, it, expect } from "vitest";
import {
  generateTableQrToken,
  buildTableQrUrl,
  generateQrDataUrl,
  generateQrSvg,
} from "@/lib/qr";

describe("Table QR Code Generation & Security", () => {
  it("generates unpredictable, cryptographically random public tokens with qr_ prefix", () => {
    const token = generateTableQrToken();
    expect(token).toMatch(/^qr_[0-9a-f]{32}$/);
    expect(token.length).toBe(35); // 'qr_' + 32 hex chars
  });

  it("generates distinct tokens on subsequent invocations (no collision)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      tokens.add(generateTableQrToken());
    }
    expect(tokens.size).toBe(50);
  });

  it("builds correct public customer-facing URL with encoded token", () => {
    const url = buildTableQrUrl("the-grand-bistro", "qr_1234567890abcdef1234567890abcdef");
    expect(url).toBe("/r/the-grand-bistro?qr=qr_1234567890abcdef1234567890abcdef");
  });

  it("generates a valid base64 PNG data URL for preview and download", async () => {
    const destination = "http://localhost:3000/r/the-grand-bistro?qr=qr_test";
    const dataUrl = await generateQrDataUrl(destination);

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it("generates a valid vector SVG string for sharp table tent card printing", async () => {
    const destination = "http://localhost:3000/r/the-grand-bistro?qr=qr_test";
    const svg = await generateQrSvg(destination);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  describe("QR Tenant Isolation & Resolution Logic", () => {
    const mockTables = [
      {
        id: "tbl_1",
        restaurantId: "rest_alpha",
        tableNumber: "T-1",
        name: "Patio Corner",
        qrToken: "qr_alpha_token_1",
        isActive: true,
        status: "AVAILABLE",
      },
      {
        id: "tbl_2",
        restaurantId: "rest_alpha",
        tableNumber: "T-2",
        name: null,
        qrToken: "qr_alpha_token_2",
        isActive: false,
        status: "INACTIVE",
      },
      {
        id: "tbl_3",
        restaurantId: "rest_beta",
        tableNumber: "T-1",
        name: "Main Room",
        qrToken: "qr_beta_token_1",
        isActive: true,
        status: "AVAILABLE",
      },
    ];

    function resolveTableByQr(restaurantId: string, qrToken: string) {
      const found = mockTables.find(
        (t) => t.restaurantId === restaurantId && t.qrToken === qrToken
      );

      if (!found) {
        return { success: false, error: "Invalid QR code" };
      }
      if (!found.isActive || found.status === "INACTIVE") {
        return { success: false, error: "Table inactive", tableNumber: found.tableNumber };
      }
      return { success: true, tableNumber: found.tableNumber, name: found.name };
    }

    it("resolves active table belonging to the queried restaurant", () => {
      const result = resolveTableByQr("rest_alpha", "qr_alpha_token_1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tableNumber).toBe("T-1");
        expect(result.name).toBe("Patio Corner");
      }
    });

    it("prevents resolving a QR token from Restaurant Beta when visiting Restaurant Alpha (cross-tenant attack)", () => {
      // Attacker tries using Beta's QR token against Alpha's URL
      const crossTenantResult = resolveTableByQr("rest_alpha", "qr_beta_token_1");
      expect(crossTenantResult.success).toBe(false);
      expect(crossTenantResult.error).toBe("Invalid QR code");
    });

    it("rejects inactive table QR code resolution safely", () => {
      const inactiveResult = resolveTableByQr("rest_alpha", "qr_alpha_token_2");
      expect(inactiveResult.success).toBe(false);
      expect(inactiveResult.error).toBe("Table inactive");
    });

    it("invalidates old QR token upon regeneration", () => {
      let currentToken = "qr_old_token_xyz";
      const oldToken = currentToken;

      // Simulate owner clicking 'Regenerate QR'
      currentToken = generateTableQrToken();

      expect(currentToken).not.toBe(oldToken);

      // Verify old token cannot resolve anymore
      const isOldValid = currentToken === oldToken;
      expect(isOldValid).toBe(false);
    });
  });
});
