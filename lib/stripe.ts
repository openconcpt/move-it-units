import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(secretKey);

/**
 * Finds a Stripe Customer by exact email match, creating one if none exists.
 * Used so repeat bookings from the same customer reuse one Stripe Customer
 * (and its saved payment methods) instead of accumulating duplicates.
 */
export async function getOrCreateStripeCustomer(
  stripeClient: Stripe,
  email: string,
  name: string
): Promise<Stripe.Customer> {
  const existing = await stripeClient.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    return existing.data[0];
  }
  return stripeClient.customers.create({ email, name });
}
