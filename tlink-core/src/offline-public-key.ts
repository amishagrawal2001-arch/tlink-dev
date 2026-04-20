/**
 * RSA public key baked into the app at build time so offline activation codes
 * can be verified on machines that cannot reach the license server
 * (firewalled, air-gapped, proxy-blocked, etc.).
 *
 * Source of truth: the license server's `data/offline-keys/offline-public.pem`.
 * Regenerate this constant whenever the server's keypair is rotated:
 *
 *   curl http://your-license-server:4000/api/licenses/public-key \
 *     > tlink-core/src/offline-public-key.pem
 *   # then paste the PEM contents between the back-ticks below.
 *
 * The matching private key stays on the server and must NEVER be shipped.
 */
export const OFFLINE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA99BGB14tRbTCKif6aNsC
qEOoM/pS5pM6t63Ng5uKmT5tInmxIR/Ait7nxyCHejCo779pHC1ZWQrvYeicK28O
WXYOdU7wVDU4ps1+U4VJkGhLOzZU5J7H9ZyPfvE53dqRVU7qMQq3X3BJsPYFm21H
2R1E6UCyNWSyGegzVHqfTsDaTnjfs1IqReIZnhkJIY0diwaMc94t30Bwf2Z14lmn
To3z0w3hJ2Jnzr1r5q4/l+uoY1R8Pbb4Hp54u/RW5+Aq54Am7h1XwsBS5zEWKxsM
76Na0rxI6It/v3K+TdBZEm/BwPz7BoX43svnwcv4Pe24AZnP8zmG+QCfKEzeedgN
XwIDAQAB
-----END PUBLIC KEY-----
`
