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

export default class ReqSeal {
    constructor(matrix, options) {
        this.matrix = matrix;
        this.options = {
            sauceSeparator: ":",
            debug: false,
            ...options,
        };

        // ✅ Precompute decode maps (for O(1) decode)
        this.#buildDecodeMaps();
    }

    #buildDecodeMaps() {
        const entries = Object.entries(this.matrix);
        if (entries.length === 0) {
            this.colDecodeMaps = [];
            this.anyDecodeMap = {};
            return;
        }

        const noOfOptions = entries[0][1].length;

        // colDecodeMaps[col][encodedValue] = digitChar
        this.colDecodeMaps = Array.from({ length: noOfOptions }, () => ({}));

        // anyDecodeMap[encodedValue] = digitChar (for sauce decoding)
        this.anyDecodeMap = {};

        for (const [digit, arr] of entries) {
            for (let col = 0; col < noOfOptions; col++) {
                const value = arr[col];
                this.colDecodeMaps[col][value] = digit;

                // Sauce decode scans "any column", but values are globally unique by design
                if (!(value in this.anyDecodeMap)) {
                    this.anyDecodeMap[value] = digit;
                }
            }
        }
    }

    #log(msgFn) {
        if (this.options.debug) console.log('[ReqSeal]', msgFn());
    }

    generateKey() {
        const time = Date.now().toString().split('');
        this.#log(() => `Using time: ${time.join('')} as rice`);

        // ✅ Fisher–Yates shuffle (O(n))
        const shuffled = [...time];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const noOfOptions = this.matrix[0].length;
        const colIdxForEncoding = Math.floor(Math.random() * noOfOptions);

        // ✅ Precompute original indices for each digit (handles duplicates)
        const indexMap = new Map();
        for (let i = 0; i < time.length; i++) {
            const digit = time[i];
            if (!indexMap.has(digit)) indexMap.set(digit, []);
            indexMap.get(digit).push(i);
        }

        // ✅ Build key with an array, then join at the end
        const keyParts = [];

        for (const digit of shuffled) {
            const indicesQueue = indexMap.get(digit);
            const originalIndex = indicesQueue.shift(); // O(1) per use

            const encodingIndex = Math.floor(Math.random() * noOfOptions);

            // a subset of key will contain three parts
            // [encodedDigit][encodingIndexEncoded][originalIndexEncoded]
            const encodedDigit = this.#encodeDigit(digit, encodingIndex);
            const encodedEncodingIndex = this.#encodeDigit(encodingIndex, colIdxForEncoding);
            const encodedOriginalIndex = this.#encodeDigit(originalIndex, colIdxForEncoding);

            keyParts.push(
                encodedDigit,
                String(encodedEncodingIndex.length),
                encodedEncodingIndex,
                String(encodedOriginalIndex.length),
                encodedOriginalIndex
            );
        }

        // now we also encode our [selectedColumnForUnlockingEncodedIndex]
        const sauceDigitParts = colIdxForEncoding.toString().split('');
        const sauceChunks = [];
        for (const part of sauceDigitParts) {
            const encodedPart = this.matrix[part][colIdxForEncoding];
            sauceChunks.push(encodedPart);
        }

        const sauce = sauceChunks.join('');
        const key = keyParts.join('');

        // add sauce to key, in a binary style
        return `${sauce}${this.options.sauceSeparator}${key}`;
    }

    decodeKey(encoded) {
        try {
            const sepIdx = encoded.indexOf(this.options.sauceSeparator);
            const sauce = encoded.substring(0, sepIdx);
            const key = encoded.substring(sepIdx + 1);

            const baseSize = this.matrix[0][0].length;

            // let's first find the sauce
            const sauceParts = this.#parts(sauce, baseSize);
            let colForEncodingIdx = "";
            for (const part of sauceParts) {
                const decoded = this.#decode(part);
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
                const encodedEncodingIndexSize =
                    this.#startingNumber(key.substring(encodedEncodingIndexSizeStartX));
                encodedEncodingIndexSizeStartX =
                    encodedEncodingIndexSizeStartX + encodedEncodingIndexSize.toString().length;
                const encodedEncodingIndexSizeEndX =
                    encodedEncodingIndexSizeStartX + encodedEncodingIndexSize;
                const encodedEncodingIndex =
                    key.substring(encodedEncodingIndexSizeStartX, encodedEncodingIndexSizeEndX);

                let encodedOriginalIndexStartX = encodedEncodingIndexSizeEndX;
                const encodedOriginalIndexSize =
                    this.#startingNumber(key.substring(encodedOriginalIndexStartX));
                encodedOriginalIndexStartX =
                    encodedOriginalIndexStartX + encodedOriginalIndexSize.toString().length;
                const encodedOriginalIndexEndX =
                    encodedOriginalIndexStartX + encodedOriginalIndexSize;
                const encodedOriginalIndex =
                    key.substring(encodedOriginalIndexStartX, encodedOriginalIndexEndX);

                i += encodedDigitSize
                    + encodedEncodingIndexSize.toString().length
                    + encodedEncodingIndexSize
                    + encodedOriginalIndexSize.toString().length
                    + encodedOriginalIndexSize;

                const encodingIndex =
                    this.#decodeDigit(encodedEncodingIndex, baseSize, colForEncodingIdx);
                const digit =
                    this.#decodeDigit(encodedDigit, baseSize, encodingIndex);
                const originalIndex =
                    this.#decodeDigit(encodedOriginalIndex, baseSize, colForEncodingIdx);
                originalTime[originalIndex] = digit;
            }
            const decodedKey = Object.values(originalTime).join('');
            return parseInt(decodedKey);
        } catch (e) {
            this.#log(() => `Exception: ${e.toString()}`);
            throw Error("Invalid key");
        }
    }

    #encodeDigit(digit, index) {
        if (digit < 9) {
            const encodedDigit = this.#encode(digit, index);
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

    #decodeDigit(encodedDigit, baseSize, index) {
        if (encodedDigit.length < 2) {
            const decodedDigit = this.#decode(encodedDigit, index);
            return decodedDigit;
        } else {
            let decodedDigit = "";
            const parts = this.#parts(encodedDigit, baseSize);
            for (const part of parts) {
                decodedDigit += this.#decode(part, index);
            }
            return decodedDigit;
        }
    }

    #startingNumber(text) {
        let value = "";
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (this.#isDigit(char)) {
                value += char;
            } else {
                break;
            }
        }
        return parseInt(value);
    }

    #isDigit(digit) {
        return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(digit);
    }

    #encode(value, index) {
        const encodedValue = this.matrix[value][index];
        return encodedValue;
    }

    #decode(encodedValue, col) {
        // ✅ Use precomputed maps instead of scanning the matrix
        if (col !== undefined && col !== null) {
            const map = this.colDecodeMaps[col];
            if (map) {
                const decoded = map[encodedValue];
                if (decoded !== undefined) {
                    return decoded;
                }
            }
        } else {
            const decoded = this.anyDecodeMap[encodedValue];
            if (decoded !== undefined) {
                return decoded;
            }
        }
        throw Error(`Invalid encoded value: ${encodedValue} for column: ${col}`);
    }

    #parts(text, chunkSize) {
        const parts = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            parts.push(text.substring(i, i + chunkSize));
        }
        return parts;
    }
}
