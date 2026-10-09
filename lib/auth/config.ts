import "server-only";

// Configuration only. Clerk remains the sole session/identity authority.
// Missing keys keep public previews available and protected content closed.
export function getClerkDevelopmentConfig() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (publishableKey && !publishableKey.startsWith("pk_test_")) {
    throw new Error(
      "Sceenyk requires a Clerk development publishable key (pk_test_).",
    );
  }
  if (secretKey && !secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Sceenyk requires a Clerk development secret key (sk_test_).",
    );
  }

  return { enabled: Boolean(publishableKey && secretKey), publishableKey };
}
