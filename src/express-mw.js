// src/express-mw.js
import ReqSeal from './reqseal.js';

/**
 * @typedef {Object} ReqSealConfig
 * @property {Record<string, string[]>} matrix         // required – same on client & server
 * @property {Object} [reqSealOptions]                 // options for ReqSeal class
 * @property {string} [headerName='x-reqseal-key']     // where the client sends key
 * @property {string} [keyMissingMessage='Missing ReqSeal key']
 * @property {string} [keyInvalidMessage='Invalid ReqSeal key']
 * @property {number} [allowedSkewMs=30000]            // Maximum time window (in milliseconds) during which a generated ReqSeal key remains valid, based on the encoded timestamp.
 * @property {(now?: number) => number} [getNow]       // for testing / custom clock
 * @property {{ has: (key: string) => boolean, add: (key: string) => void } | null} [replayCache]
 */

/**
 * Express middleware factory
 * @param {ReqSealConfig} config
 */
export function reqSeal(config) {
    const {
        matrix,
        reqSealOptions,
        headerName = 'x-reqseal-key',
        keyMissingMessage = 'Missing ReqSeal key',
        keyInvalidMessage = 'Invalid ReqSeal key',
        allowedSkewMs = 30_000,
        getNow = () => Date.now(),
        replayCache = null,
    } = config;

    if (!matrix) {
        throw new Error('[ReqSeal] "matrix" is required in config');
    }

    const seal = new ReqSeal(matrix, reqSealOptions);

    function verifyKey(key) {
        const timestamp = seal.decodeKey(key);
        const now = getNow();
        if (Number.isNaN(timestamp)) {
            throw new Error('[ReqSeal] Invalid timestamp in ReqSeal key');
        }
        const drift = Math.abs(now - timestamp);
        if (drift > allowedSkewMs) {
            throw new Error('[ReqSeal] Key expired or not yet valid');
        }
        if (replayCache) {
            const cacheKey = `${timestamp}:${key}`;
            if (replayCache.has(cacheKey)) {
                throw new Error('[ReqSeal] replay detected');
            }
            replayCache.add(cacheKey);
        }
        return { timestamp };
    }

    const middleware = function reqSealMiddleware(req, res, next) {
        const key = req.headers[headerName.toLowerCase()];
        if (!key || typeof key !== 'string') {
            return res.status(401).send({ error: keyMissingMessage });
        }
        try {
            const result = verifyKey(key);
            req.reqSeal = {
                key,
                timestamp: result.timestamp,
            };
            return next();
        } catch (err) {
            console.error(err.message);
            return res.status(401).send({ error: keyInvalidMessage });
        }
    };

    middleware.generateKey = () => seal.generateKey();
    middleware.verifyKey = verifyKey;
    middleware._reqSealInstance = seal;

    return middleware;
}

/**
 * Creates an in-memory replay cache for ReqSeal keys.
 * @param {number} ttlMs - Time-to-live in milliseconds for cached keys, recommended to be the same as `allowedSkewMs`.
 * @returns {Object} An object with `has` and `add` methods for checking and adding keys to the cache.
 */
export function createInMemoryReplayCache(ttlMs = 30_000) {
  const store = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of store.entries()) {
      if (expiresAt <= now) store.delete(key);
    }
  }, ttlMs).unref?.();

  return {
    has(key) {
      return store.has(key);
    },
    add(key) {
      store.set(key, Date.now() + ttlMs);
    },
  };
}

