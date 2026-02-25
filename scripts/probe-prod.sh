#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage:"
  echo "  BASE_URL=https://your-domain.alpic.live pnpm probe:prod"
  echo "  pnpm probe:prod -- https://your-domain.alpic.live"
  exit 1
fi

PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}'

check_initialize() {
  local path="$1"
  echo ""
  echo "== POST ${path} initialize =="
  local status
  status="$(curl --max-time 20 -sS -o /tmp/flowzen_probe_body.txt -w "%{http_code}" \
    -X POST "${BASE_URL}${path}" \
    -H "content-type: application/json" \
    -H "accept: application/json, text/event-stream" \
    --data "${PAYLOAD}")"
  echo "HTTP ${status}"
  if [[ "${status}" != "200" ]]; then
    echo "Unexpected status for ${path}"
    sed -n '1,40p' /tmp/flowzen_probe_body.txt
    exit 1
  fi
  sed -n '1,4p' /tmp/flowzen_probe_body.txt
}

check_oauth_endpoint() {
  local path="$1"
  local method="${2:-GET}"
  local status
  if [[ "${method}" == "POST" ]]; then
    status="$(curl --max-time 20 -sS -o /tmp/flowzen_probe_body.txt -w "%{http_code}" \
      -X POST "${BASE_URL}${path}" \
      -H "content-type: application/x-www-form-urlencoded" \
      --data "grant_type=authorization_code&code=test&redirect_uri=https%3A%2F%2Fexample.com%2Fcb")"
  else
    status="$(curl --max-time 20 -sS -o /tmp/flowzen_probe_body.txt -w "%{http_code}" \
      -X GET "${BASE_URL}${path}")"
  fi
  printf "%-48s -> HTTP %s\n" "${path}" "${status}"
}

echo "Probing production MCP server: ${BASE_URL}"

check_initialize "/"
check_initialize "/mcp"

echo ""
echo "== OAuth endpoints (public Alpic deployments usually return 404; this is expected) =="
check_oauth_endpoint "/.well-known/oauth-protected-resource"
check_oauth_endpoint "/.well-known/oauth-authorization-server"
check_oauth_endpoint "/authorize?redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=test"
check_oauth_endpoint "/oauth/token" "POST"

echo ""
echo "Probe complete."
