
import { reqSeal } from "./common-mod.js";

const key = reqSeal.generateKey();
const reqTime = reqSeal.decodeKey(key);
console.log('key expired', `${Date.now() - reqTime}ms`, 'ago');