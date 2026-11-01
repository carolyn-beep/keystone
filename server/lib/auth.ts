import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "../db";
import { storage } from "../storage";

/**
 * Production sign-up allowlist.
 *
 * Google sign-in auto-creates an account for any Google user unless we stop
 * it here, and every LLM-backed route is open to any signed-in user. In
 * production, only emails listed in AUTH_SIGNUP_ALLOWLIST (comma-separated,
 * case-insensitive) may create an account; with no allowlist set, sign-up is
 * closed (fail closed). Existing users are unaffected. Outside production
 * sign-up stays open so local dev and CI work without configuration.
 */
function isSignupAllowed(email: string | undefined | null): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const allowlist = (process.env.AUTH_SIGNUP_ALLOWLIST || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0 || !email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  trustedOrigins: [
    ...(process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
    process.env.BETTER_AUTH_URL || "http://localhost:5000",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    // Production: only allow sign-in for test accounts inserted directly in the DB.
    // Dev: keep signup enabled so the Dev quick login can auto-create on first use.
    disableSignUp: process.env.NODE_ENV === "production",
    autoSignIn: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  plugins: [
    admin(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isSignupAllowed(user.email)) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-up is restricted on this deployment.",
            });
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Before deleting a user, transfer ownership of their brainlifts to editors
      // or delete brainlifts that have no editors
      if (ctx.path === "/admin/remove-user") {
        const userId = ctx.body?.userId as string;
        if (!userId) return;

        try {
          const ownedBrainlifts = await storage.getBrainliftsByOwnerId(userId);

          for (const brainlift of ownedBrainlifts) {
            try {
              // Try to transfer ownership to first editor
              const transferred = await storage.transferOwnershipToFirstEditor(brainlift.id);

              if (transferred) {
                console.log(
                  `Transferred ownership of brainlift ${brainlift.id} (${brainlift.slug}) to editor`
                );
              } else {
                // No editors exist, delete the brainlift since no one else has access
                await storage.deleteBrainlift(brainlift.id);
                console.log(
                  `Deleted brainlift ${brainlift.id} (${brainlift.slug}) - no editors to transfer to`
                );
              }
            } catch (error) {
              // Unexpected error - log but don't block deletion
              console.error(
                `Failed to handle brainlift ${brainlift.id} (${brainlift.slug}):`,
                error instanceof Error ? error.message : error
              );
            }
          }
        } catch (error) {
          console.error("Error in user deletion hook:", error);
          // Don't block deletion if hook fails
        }
      }
    }),
  },
});
