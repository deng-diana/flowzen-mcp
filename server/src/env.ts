import { config } from "dotenv";
import { createEnv } from "@t3-oss/env-core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  config({ path: join(__dirname, "../../.env") });
  config({ path: join(process.cwd(), ".env") });
}

// Support both CLERK_PUBLISHABLE_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Clerk middleware reads process.env.CLERK_PUBLISHABLE_KEY - ensure it's set
if (clerkPublishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = clerkPublishableKey;
}

export const env = createEnv({
  server: {
    SUPABASE_URL: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_PUBLISHABLE_KEY: z.string().min(1),
    MCP_SERVER_URL: z.string().url().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    MCP_SERVER_URL: process.env.MCP_SERVER_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});
