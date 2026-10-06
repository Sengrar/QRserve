import crypto from "crypto";
import QRCode from "qrcode";

/**
 * Generates an unpredictable, cryptographically random public token for a table QR code.
 * Example format: "qr_7f8a9b1c2d3e4f5061728394a5b6c7d8"
 */
export function generateTableQrToken(): string {
  return `qr_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Returns the public customer-facing URL for a table QR code.
 */
export function buildTableQrUrl(restaurantSlug: string, qrToken: string): string {
  return `/r/${restaurantSlug}?qr=${encodeURIComponent(qrToken)}`;
}

/**
 * Generates a PNG Data URL for QR preview and direct raster download.
 */
export async function generateQrDataUrl(
  text: string,
  options?: { width?: number; margin?: number }
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: options?.width || 360,
    margin: options?.margin || 2,
    color: {
      dark: "#0f172a", // slate-900
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });
}

/**
 * Generates an SVG string for sharp, scalable vector printing and tent cards.
 */
export async function generateQrSvg(
  text: string,
  options?: { margin?: number }
): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: options?.margin || 2,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });
}
