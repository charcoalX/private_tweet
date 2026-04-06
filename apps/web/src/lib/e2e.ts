/**
 * End-to-end encryption utilities using Web Crypto API.
 *
 * Algorithm: RSA-OAEP (2048-bit) + AES-256-GCM hybrid encryption.
 *   - A fresh AES-256-GCM key is generated per message.
 *   - That AES key is encrypted TWICE: once for the sender, once for the recipient.
 *   - Either party can later decrypt the message using their own RSA private key.
 *
 * Ciphertext wire format (4 base64 segments joined by "."):
 *   <encAesKeyForSender>.<encAesKeyForRecipient>.<iv>.<encContent>
 *
 * localStorage keys:
 *   e2e:pub:<userId>  — SPKI base64 public key
 *   e2e:priv:<userId> — PKCS8 base64 private key  ← never leaves this device
 *
 * Limitations:
 *   - Private key is stored only in localStorage. Clearing browser data or
 *     switching to a new device permanently loses the ability to decrypt past messages.
 *   - There is no key rotation or forward secrecy; all messages use the same key pair
 *     until the user manually regenerates.
 */

// ── Internal helpers ───────────────────────────────────────────────────────────

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

function buf2b64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b642buf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Shared init cache (prevents concurrent key generation on the same page) ────

/**
 * Module-level cache so that no matter how many components call getOrInitKeyPair()
 * for the same user on the same page, the actual crypto work only happens once.
 */
const _initCache = new Map<
  string,
  Promise<{ privateKey: CryptoKey; publicKeyB64: string } | null>
>();

/**
 * Load the stored key pair, or generate a new one if none exists.
 * Idempotent: repeated calls for the same meId return the same Promise.
 * Callers are responsible for uploading publicKeyB64 to the server afterwards.
 */
export function getOrInitKeyPair(
  meId: string
): Promise<{ privateKey: CryptoKey; publicKeyB64: string } | null> {
  if (!_initCache.has(meId)) {
    _initCache.set(meId, _doInit(meId));
  }
  return _initCache.get(meId)!;
}

async function _doInit(
  meId: string
): Promise<{ privateKey: CryptoKey; publicKeyB64: string } | null> {
  // helper so we can retry on corrupt stored keys
  async function tryLoad(): Promise<{ privateKey: CryptoKey; publicKeyB64: string }> {
    const storedPubB64 = loadPublicKeyB64(meId);
    const storedPrivB64 = localStorage.getItem(`e2e:priv:${meId}`);
    if (storedPubB64 && storedPrivB64) {
      const privKey = await loadPrivateKey(meId);
      if (!privKey) throw new Error("corrupt");
      return { privateKey: privKey, publicKeyB64: storedPubB64 };
    }
    // Nothing stored yet — generate
    const pair = await generateKeyPair();
    const pubB64 = await saveKeyPair(meId, pair);
    return { privateKey: pair.privateKey, publicKeyB64: pubB64 };
  }

  try {
    return await tryLoad();
  } catch {
    // Stored data was corrupt — wipe and regenerate
    try {
      localStorage.removeItem(`e2e:pub:${meId}`);
      localStorage.removeItem(`e2e:priv:${meId}`);
      return await tryLoad();
    } catch {
      return null; // Web Crypto unavailable (non-HTTPS?)
    }
  }
}

// ── Key generation & storage ───────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
}

/**
 * Export and persist a key pair to localStorage.
 * Returns the public key as a base64 SPKI string (to upload to the server).
 */
export async function saveKeyPair(
  userId: string,
  keyPair: CryptoKeyPair
): Promise<string> {
  const [pubBuf, privBuf] = await Promise.all([
    crypto.subtle.exportKey("spki", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  const pubB64 = buf2b64(pubBuf);
  localStorage.setItem(`e2e:pub:${userId}`, pubB64);
  localStorage.setItem(`e2e:priv:${userId}`, buf2b64(privBuf));
  return pubB64;
}

/** Returns the stored public key (base64 SPKI), or null if not found. */
export function loadPublicKeyB64(userId: string): string | null {
  return localStorage.getItem(`e2e:pub:${userId}`);
}

/**
 * Load and import the stored private key for decryption.
 * Returns null if nothing is stored or the stored value is corrupt.
 */
export async function loadPrivateKey(userId: string): Promise<CryptoKey | null> {
  try {
    const b64 = localStorage.getItem(`e2e:priv:${userId}`);
    if (!b64) return null;
    return await crypto.subtle.importKey(
      "pkcs8",
      b642buf(b64).buffer,
      RSA_PARAMS,
      false,
      ["decrypt"]
    );
  } catch {
    return null;
  }
}

// ── Encryption & decryption ────────────────────────────────────────────────────

/**
 * Returns true if `content` looks like a message encrypted by this module.
 * Format: 4 base64 segments separated by "."; segment[2] is exactly 16 chars (12-byte IV).
 */
export function isEncryptedContent(content: string): boolean {
  const parts = content.split(".");
  return (
    parts.length === 4 &&
    parts[0].length >= 300 && // RSA-2048 ciphertext ≈ 344 base64 chars
    parts[1].length >= 300 &&
    parts[2].length === 16 && // 12-byte IV → exactly 16 base64 chars
    parts[3].length > 0
  );
}

/**
 * Hybrid-encrypt `plaintext` so that both the sender and recipient can decrypt it.
 *
 * @param senderPublicKeyB64   Sender's SPKI public key (base64)
 * @param recipientPublicKeyB64 Recipient's SPKI public key (base64)
 */
export async function encryptMessage(
  senderPublicKeyB64: string,
  recipientPublicKeyB64: string,
  plaintext: string
): Promise<string> {
  const [senderPubKey, recipientPubKey] = await Promise.all([
    crypto.subtle.importKey("spki", b642buf(senderPublicKeyB64).buffer, RSA_PARAMS, false, ["encrypt"]),
    crypto.subtle.importKey("spki", b642buf(recipientPublicKeyB64).buffer, RSA_PARAMS, false, ["encrypt"]),
  ]);

  // Generate a one-time AES-256-GCM key for this message
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  // Encrypt the plaintext
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  // Encrypt the AES key for both parties
  const [encForSender, encForRecipient] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPubKey, rawAesKey),
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPubKey, rawAesKey),
  ]);

  return [
    buf2b64(encForSender),
    buf2b64(encForRecipient),
    buf2b64(iv),
    buf2b64(encContent),
  ].join(".");
}

/**
 * Decrypt a message produced by `encryptMessage`.
 *
 * @param privateKey  The caller's RSA private key
 * @param isSender    True if the caller sent this message (uses the sender's AES key copy)
 * @returns Plaintext string, or null if decryption fails
 */
export async function decryptMessage(
  privateKey: CryptoKey,
  isSender: boolean,
  ciphertext: string
): Promise<string | null> {
  try {
    const parts = ciphertext.split(".");
    if (parts.length !== 4) return null;

    const encAesKeyB64 = isSender ? parts[0] : parts[1];

    const rawAesKey = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      b642buf(encAesKeyB64)
    );

    const aesKey = await crypto.subtle.importKey(
      "raw",
      rawAesKey,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b642buf(parts[2]) },
      aesKey,
      b642buf(parts[3])
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
