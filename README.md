# ReqSeal

**ReqSeal is a lightweight request freshness and replay-protection layer for HTTP APIs.**
It ensures that every incoming request carries a short-lived, one-time key derived from the current timestamp.

> ⚠️ **Important:** ReqSeal is **not a cryptographic authentication system**, does **not sign request payloads**, and should be treated as **defense-in-depth**, not as your primary security mechanism.

---

## What ReqSeal Actually Does

ReqSeal protects against **basic replay attacks** by enforcing:

1. **Time-bounded requests**
2. **Optional one-time use per request**
3. **Stateless verification (minus a short replay cache)**

It works by:

* Encoding the **current timestamp** using a shared **encoding matrix**
* Sending this encoded value in a request header (`x-reqseal-key`)
* On the server:

  * Decoding the timestamp
  * Verifying it falls within an allowed time window
  * Optionally rejecting reused keys via a replay cache

---

## ✅ What ReqSeal Is Good For

* Preventing **simple replay attacks**
* Enforcing **request freshness**
* Adding a **lightweight anti-bot / anti-script layer**
* APIs where:

  * You **control both client and server**
  * You want something **stateless, fast, and simple**
* Situations where:

  * You already have **TLS + authentication**
  * You want **extra protection at minimal cost**

---

## ❌ What ReqSeal Is *Not*

ReqSeal **does NOT**:

* Replace authentication (JWT, OAuth, sessions, etc.)
* Cryptographically sign or protect:

  * HTTP method
  * URL path
  * Query params
  * Request body
* Prevent Man-in-the-Middle attacks (TLS is still required)
* Provide formal cryptographic guarantees

It also uses a **custom encoding scheme**, not standard cryptographic primitives. This means:

* There are **no formal security proofs**
* It should **not be treated as cryptography**
* Security relies mostly on:

  * Secret matrix
  * Time window
  * Replay cache

---

## Core Security Model

| Threat                  | Protected? | Notes                    |
| ----------------------- | ---------- | ------------------------ |
| Simple replay attack    | ✅          | If replay cache enabled  |
| Stolen key reused later | ✅          | Only within allowed skew |
| MITM attack             | ❌          | TLS required             |
| Request tampering       | ❌          | No request signing       |
| Credential theft        | ❌          | Not an auth system       |
| Bot abuse               | ⚠️         | Helps slightly           |

---

## Architecture Overview

Client:

1. Generate a ReqSeal key using current timestamp
2. Send key in request header

Server:

1. Decode timestamp from key
2. Validate time window
3. Check replay cache
4. Accept or reject request

All operations are **constant-time per request (O(1))**.

---

## Example Middleware Usage

```js
app.use(
  reqSeal({
    matrix: encodingMatrix,
    allowedSkewMs: 30_000, // 30 seconds
    cache: createInMemoryReplayCache()
  })
);
```

---

## Client Usage

```js
const key = reqSeal.generateKey();
fetch("/api/data", {
  headers: {
    "x-reqseal-key": key
  }
});
```

---

## Replay Cache

Replay protection requires a small temporary in-memory or distributed cache:

* TTL usually equals `allowedSkewMs`
* Key format: `timestamp:key`
* If the same key is seen twice → request is rejected

If **no cache is used**, ReqSeal still enforces time limits but **cannot stop replays inside the time window**.

---

## Performance

* Encoding: O(1)
* Decoding: O(1)
* Cache lookup: O(1)
* Memory: O(n) where `n = active keys inside skew window`

This is generally negligible for most APIs.

---

## When You Should NOT Use ReqSeal

Do **not** use ReqSeal as your primary security layer if:

* You are building:

  * Financial systems
  * Payment gateways
  * Identity platforms
  * Healthcare systems
* You need:

  * Formal cryptographic guarantees
  * Payload integrity protection
  * Request signing
* You must pass:

  * Strict security audits
  * Compliance frameworks

In those cases, use **HMAC request signing**, **mTLS**, or **OAuth-based flows** instead.

---

## When ReqSeal Makes Sense

ReqSeal fits best as:

* A **lightweight replay-guard**
* A **supplement to authentication**
* A **bot-friction layer**
* A **rate-limit enhancer**
* A **custom API hardening tool** for controlled environments

---

## Summary (Brutally Honest)

> ReqSeal is **not cryptography**.
> It is a **fast, lightweight, time-based request freshness and replay guard**.
> It adds friction against replay abuse, but it does **not secure your API by itself**.

Use it as:
✅ Extra protection
❌ Not as a substitute for real security
