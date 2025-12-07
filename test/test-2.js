
import { reqSeal } from "./common-mod.js";

let key = reqSeal.generateKey();
console.log('original:', key)
// tampering the key
const first = key[0];
key = key.replace(first, '十');
console.log('tampered:', key)
console.log(reqSeal.decodeKey(key));
