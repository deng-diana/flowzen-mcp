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

// OAuth discovery endpoints — required by Claude.ai (MCP 2025-06-18 spec)
const CLERK_DOMAIN = "https://clerk.flowzenai.app";
const SERVER_URL = process.env.MCP_SERVER_URL ?? "https://flowzen-mcp-dfdb5406.alpic.live";

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [CLERK_DOMAIN],
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: CLERK_DOMAIN,
    authorization_endpoint: `${CLERK_DOMAIN}/oauth/authorize`,
    token_endpoint: `${CLERK_DOMAIN}/oauth/token`,
    revocation_endpoint: `${CLERK_DOMAIN}/oauth/token/revoke`,
    userinfo_endpoint: `${CLERK_DOMAIN}/oauth/userinfo`,
    jwks_uri: `${CLERK_DOMAIN}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.use(mcp(server));

app.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
