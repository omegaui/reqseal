
import { reqSeal } from "./common-mod.js";

// NOTE: ReqSeal keys support base64 encoding when your matrix contains
// characters that are valid for base64 encoding, also in this case your matrix will be
// too small, it can still generate keys but it won't be difficult to guess 
// that your matrix contains base 64 characters by any attacker intercepting your requests.
// RUN BELOW CODE AFTER ALTERING THE MATRIX IN [common-mod.js] or it will throw base64 encoding error.

const key = reqSeal.generateKey();
console.log('original key:', key)
const base64 = atob(key);
console.log(base64)
const key2 = btoa(base64);
console.log('original key:', key2)
