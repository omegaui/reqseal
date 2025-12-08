import { reqSeal } from "./common-mod.js";

const ITER = 100_000;

const start = performance.now();

for (let i = 0; i < ITER; i++) {
  const key = reqSeal.generateKey();
  const decoded = reqSeal.decodeKey(key);
  if (!decoded || Number.isNaN(decoded)) {
    throw new Error("Decode failed");
  }
}

const end = performance.now();
const totalMs = end - start;
console.log(`Total: ${totalMs.toFixed(2)} ms for ${ITER} iters`);
console.log(`Per op: ${(totalMs / ITER).toFixed(6)} ms (~${(ITER / (totalMs / 1000)).toFixed(0)} ops/sec)`);
