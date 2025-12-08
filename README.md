# ReqSeal

ReqSeal is a **time-bound, replay-resistant API key scheme**.
Instead of sending a static token (which can be replayed forever if intercepted), a ReqSeal client generates a **short-lived, single-use key** derived from the current timestamp and a shared encoding matrix. The server reverses this process to:

1. Recover the original timestamp
2. Enforce a small time window (allowed skew)
3. Optionally block replays via a cache

> **Goal:** Make replaying captured requests a nightmare, while keeping verification cheap and stateless (plus an optional replay cache).

Take a look at the [Quick example server](example/server.js) for a simple usage example.

---

# High-Level Idea

At a high level, ReqSeal does this:

* Take **current time in ms**: e.g. `1765179142303`
* Shuffle its digits in a pseudo-random way
* For each digit:

  * Randomly encode the digit itself using a **shared character matrix**
  * Encode **which column** was used to encode it
  * Encode the **original position** of that digit in the timestamp
* Concatenate all of that into one big string
* Add a secret “hint” (**sauce**) at the front, which encodes **which column** was used to encode the index/metadata parts
* Ship the final key as a header, e.g. `x-reqseal-key: <sauce>:<encoded-body>`

On the server, given the same matrix, you just **reverse the process**:

* Decode the sauce to recover the column index used for metadata
* Walk through the encoded body, chunk by chunk
* Decode:

  * Each digit
  * Its encoding index
  * Its original position in the timestamp
* Reassemble the timestamp and compare it against `Date.now()`

If the timestamp is **within a configured skew window** and has not been seen before (optional replay cache), the request is accepted. Otherwise, it’s rejected.

Here’s a diagram-style walkthrough you can turn straight into a sequence diagram / architecture graphic later, plus a clear time-complexity note at the end.

---

## 1. High-level Architecture

```text
+------------------+        +----------------------+        +------------------------+
|      Client      |  HTTPS |    API Gateway /     |  HTTP  |   App Server with      |
|  (mobile/web)    +-------->   Load Balancer      +--------> ReqSeal Middleware +   |
|                  |        |  (optional layer)    |        |   Replay Cache & App   |
+------------------+        +----------------------+        +------------------------+
                                                                       |
                                                                       v
                                                              +------------------+
                                                              |  Business Logic  |
                                                              |  (your API code) |
                                                              +------------------+
```

---

## 2. Request Flow – Step-by-Step

### 2.1 Client side (before sending request)

```text
+------------------+
|      Client      |
+------------------+
        |
        | 1. Get current time (ms)
        |    t = Date.now()
        |
        | 2. Generate dynamic key using ReqSeal
        |    key = reqSeal.generateKey()
        |    // internally uses t and shared matrix
        |
        | 3. Prepare request
        |    - HTTP headers:
        |        x-reqseal-key: key
        |    - HTTP body:
        |        JSON / payload
        v
+------------------------+
|   Outgoing HTTP Req    |
|  Headers:              |
|    x-reqseal-key = ... |
|  Body: { ... }         |
+------------------------+
```

> At this point, the client has produced a **one-shot, time-bound API key** tied to the current timestamp and the shared encoding matrix. 

---

### 2.2 Gateway / Load Balancer

```text
+----------------------+         +------------------------+
| API Gateway / Proxy  |  --->   |     App Server        |
+----------------------+         +------------------------+
        |
        | 4. Gateway receives request
        |    - Typically does NOT need to understand ReqSeal
        |    - It can do rate limiting / routing / TLS termination
        |
        | 5. Forwards headers & body unchanged to app server
        v
```

The ReqSeal key is just another opaque header as far as the gateway is concerned.

---

### 2.3 App Server – ReqSeal Middleware

```text
+--------------------------------------------------------------+
|             App Server (Express / Bun / etc.)                |
|                                                              |
|   Incoming Request                                            |
|   - Headers: x-reqseal-key                                   |
|   - Body:   JSON / payload                                   |
+--------------------------------------------------------------+
        |
        v
+---------------------------+
|   ReqSeal Middleware      |
+---------------------------+
```

Inside the middleware, for each request:

1. **Extract the key**

   ```text
   key = req.headers["x-reqseal-key"]
   ```

2. **Decode key → timestamp**

   ```text
   timestamp = reqSeal.decodeKey(key)
   ```

   Under the hood:

   * Split into `sauce` and `body` using the separator. 
   * Decode **sauce** to recover which column was used to encode metadata.
   * Walk through the **body** chunks, decoding for each digit:

     * encoded digit
     * encoding index
     * original index in the timestamp
   * Reconstruct the original timestamp digits into `timestamp`.

3. **Validate freshness (anti-stale)**

   ```text
   now = Date.now()
   if |now - timestamp| > allowedSkewMs:
       -> reject with 401 (expired / invalid)
   ```

4. **Replay cache check (anti-replay)** 

   Conceptually:

   ```text
   cacheKey = `${timestamp}:${key}`
   if replayCache.has(cacheKey):
       -> reject with 401 (replay)
   else:
       replayCache.set(cacheKey, true, ttl = allowedSkewMs)
   ```

   * First time a key is seen: it’s stored for a short TTL.
   * Any subsequent request with the same key within that window: rejected.

5. **Attach ReqSeal info to the request & pass control**

   ```text
   req.reqSeal = { key, timestamp }
   next()  // move to your route handlers / controllers
   ```

If any step fails (missing header, decode error, expired, replayed), the middleware short-circuits the pipeline with a `401 Unauthorized`.

---

### 2.4 Business Logic

```text
+------------------------+
|    Route Handler       |
+------------------------+
        |
        | 6. Your API handler runs only after:
        |    - Key is syntactically valid
        |    - Timestamp is fresh
        |    - Not replayed (first use only)
        |
        | 7. Use req.reqSeal if needed:
        |    - req.reqSeal.timestamp
        |    - req.reqSeal.key
        |
        v
+------------------------+
|   Normal API Behavior  |
|   - DB reads/writes    |
|   - Domain logic       |
|   - JSON responses     |
+------------------------+
```

Result: each request that reaches your actual business logic has passed through a **dynamic, time-bound, and anti-replay gate**.

---

## 3. Failure Scenarios (at a glance)

```text
Client             Middleware                     Outcome
------             ----------                     -------
No header   ->     x-reqseal-key missing   ->    401 (missing key)

Random key  ->     decodeKey throws        ->    401 (invalid key)

Old key     ->     |now - ts| > skew       ->    401 (expired)

Reused key  ->     replayCache hit         ->    401 (replay)
```

---

## 4. Time Complexity (and why it’s effectively O(1))

Let:

* `n` = number of digits in the timestamp (for `Date.now()` this is always **13**)
* Matrix size = fixed (10 rows, `N` columns)

From the actual implementation:

### `generateKey` (on the client)

* Fisher–Yates shuffle over `n` digits → **O(n)**
* Single pass to build encoded body → **O(n)**
* Constant-time matrix lookups & small string operations → **O(n)** total

**Theoretical complexity:**

> `generateKey` runs in **Θ(n)** time.

### `decodeKey` (on the server)

* Split sauce/body, parse sauce → **O(n)**
* Single linear scan over the encoded body, decoding each chunk → **O(n)**
* Rebuild timestamp string → **O(n)**

**Theoretical complexity:**

> `decodeKey` runs in **Θ(n)** time.

### Why that is *effectively* O(1)

Practically:

* `n` is **fixed** (13 digits of `Date.now()`).
* Matrix dimensions are **fixed**.
* So there exists a constant `C` such that:

  * `time(generateKey) ≤ C` for all inputs.
  * `time(decodeKey) ≤ C` for all inputs.

From a system / scaling perspective:

* Each request pays a **fixed, small cost** to:

  * Generate a dynamic key on the client.
  * Decode and validate it on the server.
* This cost doesn’t grow with:

  * Size of the body,
  * Number of users,
  * Total number of requests (beyond linear in count of requests themselves).

So for practical purposes:

> **ReqSeal generation + validation is effectively O(1) per request**
> (constant time, with a very small constant),
> while providing **dynamic API keys + replay protection**.


---

## The Encoding Matrix

At the heart of ReqSeal is the **matrix**:

```js
const exampleEncodingMatrix = {
  "0": ["/", "*", "=", "?", "!", "@"],
  "1": ["A", "a", "B", "b", "C", "c"],
  "2": ["D", "d", "E", "e", "F", "f"],
  "3": ["G", "g", "H", "h", "I", "i"],
  "4": ["J", "j", "K", "k", "L", "l"],
  "5": ["M", "m", "N", "n", "O", "o"],
  "6": ["P", "p", "Q", "q", "R", "r"],
  "7": ["S", "s", "T", "t", "U", "u"],
  "8": ["V", "v", "W", "w", "X", "x"],
  "9": ["Y", "y", "Z", "z", "+", "-"],
};
```

Constraints/assumptions:

* Keys are string digits `"0"`–`"9"`
* Each key maps to an array of **N** encoding symbols
* **No duplicates globally**: every symbol appears only once in the entire matrix
* All symbols have the same length (e.g. single chars)

This matrix must be **identical on client and server**. It is the core shared secret that lets the server decode what the client encodes. 

---

## Algorithm: Key Generation

Given the matrix and options, `ReqSeal.generateKey()` works like this:

1. **Take current time**

   * `time = Date.now().toString().split('')`
   * e.g. `"1765179142303"` → `["1","7","6","5","1","7","9","1","4","2","3","0","3"]`

2. **Shuffle the digits**

   * Uses a Fisher–Yates shuffle over the `time` array copy
   * This reorders the digits, but we will later encode **where each digit came from**.

3. **Precompute original indices**

   * Build a map: `digit -> queue of original positions`
   * Example: `"1" -> [0, 4, 7]`, `"7" -> [1, 5]`, etc.
   * This preserves correct handling of **duplicate digits**.

4. **Choose a metadata column**

   * The matrix has `N` columns; pick a random `colIdxForEncoding` in `[0, N-1]`.
   * This column will be used to encode:

     * The **encoding index** used for each digit
     * The **original index** of each digit

5. **Encode each shuffled digit**
   For each `digit` in the shuffled list:

   * Pop its **original index** from the index map queue
   * Choose a random `encodingIndex` in `[0, N-1]` for this digit
   * Compute:

     * `encodedDigit = encodeDigit(digit, encodingIndex)`
     * `encodedEncodingIndex = encodeDigit(encodingIndex, colIdxForEncoding)`
     * `encodedOriginalIndex = encodeDigit(originalIndex, colIdxForEncoding)`
   * `encodeDigit` either:

     * Encodes a single digit directly via the matrix, or
     * Splits multi-digit numbers (like `12`) into characters and encodes each separately
   * For length disambiguation, ReqSeal stores the **lengths** of these encoded pieces inline:

     * `[encodedDigit][len(encodedEncodingIndex)][encodedEncodingIndex][len(encodedOriginalIndex)][encodedOriginalIndex]`
   * All such chunks are appended to form the **key body**.

6. **Encode the “sauce” (column hint)**

   * `colIdxForEncoding` itself is a number like `"3"` or `"12"`.
   * Split it into digits and encode each using the **same column**:

     * e.g. `"1"` → `matrix["1"][colIdxForEncoding]`
   * Concatenate these chunks into `sauce`.

7. **Final key format**

   ```text
   <sauce><separator><key-body>
   ```

   * Default separator: `":"` (configurable via options)
   * Example:
     `hZn1h1h=1e2bbC1k1?...` (sauce and body are both opaque to an attacker without the matrix). 

---

## Algorithm: Key Decoding & Validation

On the server, given an encoded key:

1. **Split sauce and body**

   * Find the separator (e.g. `":"`)
   * Left side: `sauce`, right side: `key`

2. **Recover `colIdxForEncoding` from sauce**

   * The length of each encoded unit is `baseSize = matrix[0][0].length`
   * Split sauce into chunks of `baseSize`
   * For each chunk, run a **matrix reverse lookup** (any column) to recover the digit
   * Concatenate digits, parse into integer → `colIdxForEncoding`

3. **Walk the key body**
   Using a pointer `i` over the body string:

   * Read `encodedDigit` → first `baseSize` chars
   * Read the **length of the next piece** (digits only) → `encodedEncodingIndexSize`
   * Read `encodedEncodingIndex` → that many chars
   * Read the **length of the original index piece** → `encodedOriginalIndexSize`
   * Read `encodedOriginalIndex` → that many chars
   * Advance `i` accordingly and repeat until the body is consumed

4. **Decode each tuple**
   For each parsed group:

   * Decode `encodedEncodingIndex` using column `colIdxForEncoding`
   * Using that, decode `encodedDigit` with the recovered `encodingIndex`
   * Decode `encodedOriginalIndex` using `colIdxForEncoding`
   * Insert the decoded digit into `originalTime[originalIndex]`

5. **Reconstruct and validate timestamp**

   * `decodedKey = Object.values(originalTime).join('')`
   * Parse it into an integer timestamp
   * Compare against `Date.now()` (or a custom `getNow`) to compute drift
   * If drift is larger than `allowedSkewMs`, reject
   * If a **replay cache** is configured, combine `{timestamp}:{key}` as a cache key:

     * If it exists: reject as replay
     * Else: insert it with an expiry equal to the allowed skew 

---

## Security Properties (Conceptual)

ReqSeal is designed to give you:

1. **Time-bounded keys**

   * Keys are tied to `Date.now()` at generation time.
   * On the server you enforce a strict time window via `allowedSkewMs`.

2. **Replay resistance**

   * An attacker who captures one request:

     * Can’t safely replay it after the time window.
     * Can be instantly blocked even **inside** the window if a replay cache is used.
   * Keys are (effectively) one-time-use when paired with a replay cache.

3. **Opaque encoding**

   * Without the matrix, the key appears as random gibberish.
   * Even knowing that it encodes a timestamp doesn’t give an easy way to forge keys without the matrix.

4. **Stateless core + optional replay cache**

   * Core validation (decode + skew check) is stateless.
   * Replay prevention is handled via a small pluggable cache interface (in-memory or external). 

---

## Express Middleware (Conceptual Overview)

ReqSeal ships with an optional **Express middleware** that wires the algorithm into typical HTTP APIs:

* Reads the key from a configurable header (default: `x-reqseal-key`)
* Uses `ReqSeal.decodeKey()` to recover timestamp
* Enforces:

  * **Time skew** via `allowedSkewMs`
  * **Replay protection** via a replay cache (if provided)
* Attaches `req.reqSeal = { key, timestamp }` on success
* Returns `401` on missing/invalid/expired/replayed keys 

There’s also a tiny `createInMemoryReplayCache(ttlMs)` helper implementing the expected interface for replay protection.

---

## Benchmark
Here's a quick benchmark from my machine:
```sh
➜  reqseal git:(master) bun run test/benchmark.js 
Total: 1140.60 ms for 100000 iters
Per op: 0.011406 ms (~87673 ops/sec)
```

My Specs:
```sh
-----------------
OS: Ubuntu 25.10 x86_64
Kernel: Linux 6.17.0-7-generic
Shell: zsh 5.9
CPU: 11th Gen Intel(R) Core(TM) i5-1135G7 (8) @ 4.20 GHz
GPU: Intel Iris Xe Graphics @ 1.30 GHz [Integrated]
Memory: 6.95 GiB / 18.73 GiB (37%)
Swap: 23.17 MiB / 8.00 GiB (0%)
```

## Summary

ReqSeal is a **time-based, matrix-encoded request sealing scheme** that turns each request into a short-lived, hard-to-forge, hard-to-replay key:

* Keys are derived from the **current timestamp**.
* An **encoding matrix** makes the encoding opaque and customizable.
* The **sauce** encodes the unlocking column for metadata.
* The **body** stores encoded digits, their encoding indices, and original positions.
* Server decoding is linear-time and fast enough for high-QPS APIs.
* Optional **replay cache** elevates it from “time-locked” to “practically one-time-use”.

This README focuses on the algorithm’s design and behavior; the actual implementation (including optimized encoding/decoding and middleware wiring) lives in the source.
