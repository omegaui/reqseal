//                                           .__   
// _______   ____  ______ ______ ____ _____  |  |  
// \_  __ \_/ __ \/ ____//  ___// __ \\__  \ |  |  
//  |  | \/\  ___< <_|  |\___ \\  ___/ / __ \|  |__
//  |__|    \___  >__   /____  >\___  >____  /____/
//              \/   |__|    \/     \/     \/      
//
// Author: @omegaui
// License: MIT
//
// [reqseal] is a dynamic key generation algorithm
// the key is intended to be used as an api key
// to validate that the requests are coming from trusted clients.

// GOAL: Create a nightmare for request replay attacks.

// This is a simpler overview of how reqseal works:
// Step 1: Take current millisecondsSinceEpoch say "1765099838831" (notice str)
// Step 2: Shuffle the string but preserve the original indicies
// Step 3: Take a 2D array of size 10 x N
//         N is the number of ways a digit can be represented
//         const exampleEncodingMatrix = {
//             "1": ["A", "a", "B", "b", 'C', 'c'],
//             "2": ["D", "d", "E", "e", "F", "f"],
//             "3": ["G", "g", "H", "h", "I", "i"],
//             "4": ["J", "j", "K", "k", "L", "l"],
//             "5": ["M", "m", "N", "n", "O", "o"],
//             "6": ["P", "p", "Q", "q", "R", "r"],
//             "7": ["S", "s", "T", "t", "U", "u"],
//             "8": ["V", "v", "W", "w", "X", "x"],
//             "9": ["Y", "y", "Z", "z", "+", "-"],
//             "0": ["/", "*", "=", "?", "!", "@"],
//         };
//         *No duplicates allowed globally in the matrix, also all values should be of same size.
// Step 4: Run a loop over the shuffled string (say digit at i is x) and each time generate a random index < N
// Step 5: Use the character from the matrix and encode [x] with it (also encode the original index of x likewise),
//         and form a compound part in any format say "Ze1G1".
// Step 6: Combine all the encoded characters to form the final key.
// Step 7: Return the final key example: "/Ze1G1Sc1M1/u1M1At1G1Mw1G2A/W1D2AAA1/1Jo1M1GE1D1Yi1M1P!1J1VQ1D1Dq1G2AD"
// Step 8: When request reaches the server, validating the key is simple as the server has the same matrix.
//         The server will just reverse the process and check if the key is valid.

// Note: The above is just a basic overview of how reqseal generates a key, the actual implementation is super random, customizable and a true nightmare for attackers.

// Advantages of using [reqseal] keys as API keys:
// 1. A request can never be replayed as the key is generated based on the current time, 
//    moreover the server can keep a temporary cache of the keys for a certain duration.
// 2. The key is generated based on the current time, so it is always unique.
//    the greater the value of N, the more secure the key, for example in a split millisecond
//    there can exist more than a trillion keys, out of which only one is valid.
// 3. The server, when reversing the process, can validate when request was sent from client
//    say a trusted client sends a request at time t, but an interceptor obtained the request and tried to replay it after 1 minute
//    then, the server can be sure that the request is not valid as the key is 1 minute old (say in a 30 sec threshold).
// 4. One can safeguard there OTP endpoints to prevent abuse from replaying requests.
// 5. There can be more usecases like safeguarding payment endpoints from replay attacks.

export default class ReqSeal {
    constructor(matrix, options) {
        this.matrix = matrix;
        this.options = {
            sauceSeparator: ":",
            shuffleBias: 0.5,
            debug: false,
            ...options,
        };
    }

    log(msgFn) {
        if (this.options.debug) console.log('[ReqSeal]', msgFn());
    }

    generateKey() {
        const time = Date.now().toString().split('');
        this.log(() => `Using time: ${time.join('')} as rice`);
        const shuffled = [...time].sort(() => Math.random() - (this.options.shuffleBias));
        const noOfOptions = this.matrix[0].length;
        const colIdxForEncoding = Math.floor(Math.random() * noOfOptions);
        let key = "";
        for (const digit of shuffled) {
            const originalIndex = time.indexOf(digit);
            time[originalIndex] = ''; // clear the index to go to the next same digit on next iteration
            const encodingIndex = Math.floor(Math.random() * noOfOptions);
            // a subset of key will contain three parts
            // [encodedDigit][encodingIndexEncoded][originalIndexEncoded]
            const encodedDigit = this.encodeDigit(digit, encodingIndex);
            const encodedEncodingIndex = this.encodeDigit(encodingIndex, colIdxForEncoding);
            const encodedOriginalIndex = this.encodeDigit(originalIndex, colIdxForEncoding);
            key += `${encodedDigit}${encodedEncodingIndex.length}${encodedEncodingIndex}${encodedOriginalIndex.length}${encodedOriginalIndex}`;
        }
        // now we also encode our [selectedColumnForUnlockingEncodedIndex]
        const sauceParts = colIdxForEncoding.toString().split('');
        let sauce = "";
        for (const part of sauceParts) {
            const encodedPart = this.matrix[part][colIdxForEncoding];
            sauce += encodedPart;
        }
        // add sauce to key, in a binary style
        return `${sauce}${this.options.sauceSeparator}${key}`;
    }

    decodeKey(encoded) {
        try {
            const sepIdx = encoded.indexOf(this.options.sauceSeparator);
            const sauce = encoded.substring(0, sepIdx);
            const key = encoded.substring(sepIdx + 1);
            // reading the key is a tricky part
            // which is only possible if you have the exact same matrix
            // and the same [options] used to make the key
            const baseSize = this.matrix[0][0].length;
            // let's first find the sauce
            const sauceParts = this.parts(sauce, baseSize);
            let colForEncodingIdx = "";
            for (const part of sauceParts) {
                const decoded = this.decode(part);
                colForEncodingIdx += decoded;
            }
            colForEncodingIdx = parseInt(colForEncodingIdx);
            // let's now decode the key
            let originalTime = {};
            for (let i = 0; i < key.length;) {
                const encodedDigitStartX = i;
                const encodedDigitSize = baseSize;
                const encodedDigitEndX = encodedDigitStartX + encodedDigitSize;
                const encodedDigit = key.substring(encodedDigitStartX, encodedDigitEndX);

                let encodedEncodingIndexSizeStartX = encodedDigitEndX;
                const encodedEncodingIndexSize = this.startingNumber(key.substring(encodedEncodingIndexSizeStartX));
                encodedEncodingIndexSizeStartX = encodedEncodingIndexSizeStartX + encodedEncodingIndexSize.toString().length;
                const encodedEncodingIndexSizeEndX = encodedEncodingIndexSizeStartX + encodedEncodingIndexSize;
                const encodedEncodingIndex = key.substring(encodedEncodingIndexSizeStartX, encodedEncodingIndexSizeEndX);

                let encodedOriginalIndexStartX = encodedEncodingIndexSizeEndX;
                const encodedOriginalIndexSize = this.startingNumber(key.substring(encodedOriginalIndexStartX));
                encodedOriginalIndexStartX = encodedOriginalIndexStartX + encodedOriginalIndexSize.toString().length;
                const encodedOriginalIndexEndX = encodedOriginalIndexStartX + encodedOriginalIndexSize;
                const encodedOriginalIndex = key.substring(encodedOriginalIndexStartX, encodedOriginalIndexEndX);

                i += encodedDigitSize + encodedEncodingIndexSize.toString().length + encodedEncodingIndexSize + encodedOriginalIndexSize.toString().length + encodedOriginalIndexSize;

                const encodingIndex = this.decodeDigit(encodedEncodingIndex, baseSize, colForEncodingIdx);
                const digit = this.decodeDigit(encodedDigit, baseSize, encodingIndex);
                const originalIndex = this.decodeDigit(encodedOriginalIndex, baseSize, colForEncodingIdx);
                originalTime[originalIndex] = digit;
            }
            const decodedKey = Object.values(originalTime).join('');
            return parseInt(decodedKey);
        } catch (e) {
            this.log(() => `Exception: ${e.toString()}`);
            throw Error("Invalid key");
        }
    }

    encodeDigit(digit, index) {
        if (digit < 9) {
            const encodedDigit = this.encode(digit, index);
            return encodedDigit;
        } else {
            // run a loop over each digit
            let encodedDigit = "";
            for (const part of digit.toString().split('')) {
                encodedDigit += this.matrix[part][index];
            }
            return encodedDigit;
        }
    }

    decodeDigit(encodedDigit, baseSize, index) {
        if (encodedDigit.length < 2) {
            const decodedDigit = this.decode(encodedDigit, index);
            return decodedDigit;
        } else {
            let decodedDigit = "";
            const parts = this.parts(encodedDigit, baseSize);
            for (const part of parts) {
                decodedDigit += this.decode(part, index);
            }
            return decodedDigit;
        }
    }

    startingNumber(text) {
        let value = "";
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (this.isDigit(char)) {
                value += char;
            } else {
                break;
            }
        }
        return parseInt(value);
    }

    isDigit(digit) {
        return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(digit);
    }

    encode(value, index) {
        const encodedValue = this.matrix[value][index];
        return encodedValue;
    }

    decode(encodedValue, col) {
        // map entries
        const entries = Object.entries(this.matrix);
        if (col) {
            for (const entry of entries) {
                if (entry[1][col] === encodedValue) {
                    return entry[0];
                }
            }
        } else {
            // below loop is only used for decoding sauce
            for (const entry of entries) {
                for (const value of entry[1]) {
                    if (value === encodedValue) {
                        return entry[0];
                    }
                }
            }
        }
        throw Error(`Invalid encoded value: ${encodedValue} for column: ${col}`);
    }

    parts(text, chunkSize) {
        const parts = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            parts.push(text.substring(i, i + chunkSize));
        }
        return parts;
    }
}

