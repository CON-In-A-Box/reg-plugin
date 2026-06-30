// shared/js/crypto.js
//
// ============================================================================
// Manager-override password hashing via the browser's built-in Web Crypto API.
// No external libraries required. Used by the options page (verifyPassword) and
// by tools/generate-password-hash.html (generatePasswordHash) to gate behavior
// behind a manager-override password whose plaintext is never stored.
//
// The stored value is a salted PBKDF2-SHA256 hash, NOT a bare SHA-256 digest.
// A published Chrome extension ships all of its source, so the hash can never
// be truly hidden — the defense is making it expensive to brute-force. PBKDF2
// at PBKDF2_ITERATIONS rounds + a random per-password salt does that.
//
// Stored format (self-describing so the iteration count can change later
// without a code change):
//
//     pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>
//
// e.g. pbkdf2-sha256$210000$<32 hex chars>$<64 hex chars>
// ============================================================================

// OWASP-recommended floor for PBKDF2-SHA256 (raise over time as hardware improves).
const PBKDF2_ITERATIONS = 210000;

/** Uint8Array → lowercase hex string. */
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Hex string → Uint8Array. */
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Derives a 256-bit PBKDF2-SHA256 key from a password + salt.
 * @param {string}     password
 * @param {Uint8Array} saltBytes
 * @param {number}     iterations
 * @returns {Promise<string>} 64-char hex of the derived key
 */
async function derivePbkdf2(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

/**
 * Generates a fresh salted PBKDF2 hash string for a new password.
 * Used by tools/generate-password-hash.html. The plaintext never leaves
 * this function — only the returned hash string is meant to be stored.
 * @param {string} password
 * @returns {Promise<string>} "pbkdf2-sha256$<iter>$<saltHex>$<hashHex>"
 */
async function generatePasswordHash(password) {
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hashHex}`;
}

/** Constant-time comparison of two equal-length hex strings. */
function constantTimeHexEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies a plaintext password against a stored pbkdf2-sha256 string.
 * Re-derives using the salt + iteration count embedded in `stored`.
 * Returns false for any malformed/empty stored value rather than throwing.
 * @param {string} password
 * @param {string} stored - "pbkdf2-sha256$<iter>$<saltHex>$<hashHex>"
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = parseInt(parts[1], 10);
  const saltHex    = parts[2];
  const hashHex    = parts[3];
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;

  const candidate = await derivePbkdf2(password, hexToBytes(saltHex), iterations);
  return constantTimeHexEqual(candidate, hashHex);
}

// end shared/js/crypto.js
