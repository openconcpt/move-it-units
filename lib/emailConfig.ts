import { z } from "zod";

export interface EmailConfig {
  resendApiKey: string;
  fromEmail: string;
  operatorEmail: string;
}

const emailConfigSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  FROM_EMAIL: z.string().trim().email(),
  OPERATOR_EMAIL: z.string().trim().email(),
});

/**
 * Validates the Resend-related env vars. Returns null (after logging) if any
 * are missing or invalid — callers must treat that as "skip sending," never
 * as a reason to fail whatever triggered the email (see lib/bookingEmail.ts).
 */
export function getEmailConfig(): EmailConfig | null {
  const parsed = emailConfigSchema.safeParse({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    OPERATOR_EMAIL: process.env.OPERATOR_EMAIL,
  });

  if (!parsed.success) {
    console.error(
      "Email config is missing or invalid — confirmation emails will not be sent",
      parsed.error.flatten().fieldErrors
    );
    return null;
  }

  return {
    resendApiKey: parsed.data.RESEND_API_KEY,
    fromEmail: parsed.data.FROM_EMAIL,
    operatorEmail: parsed.data.OPERATOR_EMAIL,
  };
}
