#!/usr/bin/env bash
# Regenerates the TLS material the integration tests use: a throwaway CA, and a
# PKCS12 keystore for the GreenMail container holding a server certificate for
# localhost and 127.0.0.1 signed by that CA. Test-only: nothing outside
# tests/integration trusts this CA, and its private key is discarded.
#
# The keystore password is GreenMail's documented default; the file sits in a
# public repository, so it protects nothing and is not meant to.
set -euo pipefail

out="$(dirname "$0")/../tests/integration/fixtures/tls"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

# 100 years: the fixture must not expire under a test suite that outlives it.
days=36500

openssl req -x509 -new -newkey rsa:2048 -nodes -days "$days" \
  -subj '/CN=imap-mcp test CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -keyout "$work/ca.key" -out "$out/ca.pem"

openssl req -new -newkey rsa:2048 -nodes \
  -subj '/CN=localhost' \
  -keyout "$work/server.key" -out "$work/server.csr"

cat >"$work/server.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EOF

openssl x509 -req -in "$work/server.csr" -days "$days" \
  -CA "$out/ca.pem" -CAkey "$work/ca.key" -CAcreateserial -CAserial "$work/ca.srl" \
  -extfile "$work/server.ext" -out "$work/server.pem"

openssl pkcs12 -export -name greenmail \
  -inkey "$work/server.key" -in "$work/server.pem" -certfile "$out/ca.pem" \
  -passout pass:changeit -out "$out/greenmail.p12"
