
import { reqSeal } from "./common-mod.js";
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("Generating a key...");
const key = reqSeal.generateKey();
console.log(`Generated Key: ${key}`);
const time = reqSeal.decodeKey(key);
console.log(time)

const ask = () => {
    rl.question('Enter key to validate (or type "exit" to quit): ', (input) => {
        if (input.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        try {
            const decoded = reqSeal.decodeKey(input);
            if (decoded === time) {
                console.log(`Valid key! Decoded timestamp: ${decoded}`);
            } else {
                console.log('Invalid key!', input, 'decode to\n', decoded);
            }
        } catch (e) {
            console.log('Invalid key!', input);
        }

        ask();
    });
};

ask();
