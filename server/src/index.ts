import { randomBytes } from "node:crypto";
import cors from "cors";
import express from "express";
import { widgetsDevServer } from "skybridge/server";
import { mcp } from "./middleware.js";
import server from "./server.js";

const app = express();

app.use(express.json());

const nodeEnv = process.env.NODE_ENV || "development";

if (nodeEnv !== "production") {
  const { devtoolsStaticServer } = await import("@skybridge/devtools");
  app.use(await devtoolsStaticServer());
  app.use(await widgetsDevServer());
}

if (nodeEnv === "production") {
  app.use("/assets", cors());
  app.use("/assets", express.static("dist/assets"));
}

app.use(cors());

// Self-contained OAuth server — required by Claude.ai (MCP 2025-06-18 spec)
// Derives base URL from the request Host header so it works with any tunnel/domain.
function getBaseUrl(req: express.Request): string {
  if (process.env.MCP_SERVER_URL) return process.env.MCP_SERVER_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    resource: base,
    authorization_servers: [base],
  });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
});

// /oauth/authorize — immediately redirect back with code (Claude.ai handles the user flow)
app.get("/oauth/authorize", (req, res) => {
  const redirectUri = req.query.redirect_uri as string;
  const state = req.query.state as string | undefined;
  if (!redirectUri) {
    res.status(400).json({ error: "invalid_request", error_description: "redirect_uri required" });
    return;
  }
  const code = randomBytes(16).toString("hex");
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// /oauth/token — issue an opaque access token
app.post("/oauth/token", express.urlencoded({ extended: false }), (_req, res) => {
  res.json({
    access_token: randomBytes(32).toString("hex"),
    token_type: "bearer",
    expires_in: 86400,
  });
});

app.use(mcp(server));

app.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
