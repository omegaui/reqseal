
import { reqSeal } from "./common-mod.js";

let totalMs = 0;
for (let i = 0; i < 10000; i++) {
    const key = reqSeal.generateKey();
    const reqTime = reqSeal.decodeKey(key);
    totalMs += (Date.now() - reqTime);
}
console.log('time took for gen-and-val for 10,000 keys: ', `${totalMs}ms`);

