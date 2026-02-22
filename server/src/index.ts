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
// Our server acts as both resource server and authorization server.
const SERVER_URL = process.env.MCP_SERVER_URL ?? "https://flowzen-mcp-dfdb5406.alpic.live";

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [SERVER_URL],
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: SERVER_URL,
    authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
    token_endpoint: `${SERVER_URL}/oauth/token`,
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
