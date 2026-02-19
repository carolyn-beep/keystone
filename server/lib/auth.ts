import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "../db";
import { storage } from "../storage";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  trustedOrigins: [
    ...(process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
    process.env.BETTER_AUTH_URL || "http://localhost:5000",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
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
