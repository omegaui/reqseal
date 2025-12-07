
import { reqSeal } from "./common-mod.js";

const key = reqSeal.generateKey();
console.log(key);
const decodedKey = reqSeal.decodeKey(key);
console.log(decodedKey);
