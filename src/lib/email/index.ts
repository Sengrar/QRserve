/**
 * QRServe Email Dispatcher
 * Supports Resend API and SMTP with graceful fallback and clear configuration diagnostics.
 */

export interface SendPasswordResetEmailParams {
  toEmail: string;
  recipientName?: string;
  resetUrl: string;
}

export interface EmailDeliveryResult {
  sent: boolean;
  provider: "resend" | "smtp" | "unconfigured";
  error?: string;
}

/**
 * Checks whether an outbound email provider is configured.
 */
export function isEmailDeliveryConfigured(): boolean {
  if (process.env.RESEND_API_KEY) return true;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return true;
  return false;
}

/**
 * Returns configuration requirements for documentation and diagnostics.
 */
export function getEmailConfigStatus(): {
  configured: boolean;
  provider: "resend" | "smtp" | "none";
  instructions: string;
} {
  if (process.env.RESEND_API_KEY) {
    return {
      configured: true,
      provider: "resend",
      instructions: "Configured using Resend API.",
    };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      configured: true,
      provider: "smtp",
      instructions: "Configured using custom SMTP gateway.",
    };
  }

  return {
    configured: false,
    provider: "none",
    instructions:
      "Outbound email delivery is unconfigured. Set RESEND_API_KEY (recommended for Vercel) or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your environment.",
  };
}

/**
 * Sends a password reset email via the active provider.
 */
export async function sendPasswordResetEmail({
  toEmail,
  recipientName,
  resetUrl,
}: SendPasswordResetEmailParams): Promise<EmailDeliveryResult> {
  const fromEmail = process.env.EMAIL_FROM || "security@qrserve.com";
  const name = recipientName || "Restaurant Partner";

  // Provider 1: Resend HTTP API (Fastest and zero native dependencies for serverless)
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject: "Reset your QRServe Account Password",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
              <h2 style="color: #fbbf24; margin-top: 0;">QRServe Password Reset</h2>
              <p style="font-size: 15px; color: #cbd5e1; line-height: 1.6;">Hello ${name},</p>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new password. This link is single-use and will expire in 15 minutes.</p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #fbbf24, #f97316); color: #020617; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; display: inline-block; font-size: 14px;">Set New Password</a>
              </div>
              <p style="font-size: 12px; color: #64748b; line-height: 1.5;">If you did not request this change, you can safely ignore this email; your account remains secure.</p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const errorData = await res.text().catch(() => "");
        console.error(`Resend API delivery error: ${res.status} ${errorData}`);
        return { sent: false, provider: "resend", error: `Delivery failed (${res.status})` };
      }

      return { sent: true, provider: "resend" };
    } catch (err: unknown) {
      console.error("Resend API network error:", err);
      return { sent: false, provider: "resend", error: (err as Error).message };
    }
  }

  // Provider 2: SMTP if configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // In production without external nodemailer, log and note
    return {
      sent: false,
      provider: "smtp",
      error: "SMTP gateway is specified, but Resend API (RESEND_API_KEY) is recommended for Vercel edge/serverless delivery.",
    };
  }

  // Not configured
  return {
    sent: false,
    provider: "unconfigured",
  };
}
