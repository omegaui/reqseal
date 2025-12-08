import ReqSeal from "../lib/reqseal.js";

export const reqSeal = new ReqSeal({
    "1": ["A", "a", "B", "b", 'C', 'c'],
    "2": ["D", "d", "E", "e", "F", "f"],
    "3": ["G", "g", "H", "h", "I", "i"],
    "4": ["J", "j", "K", "k", "L", "l"],
    "5": ["M", "m", "N", "n", "O", "o"],
    "6": ["P", "p", "Q", "q", "R", "r"],
    "7": ["S", "s", "T", "t", "U", "u"],
    "8": ["V", "v", "W", "w", "X", "x"],
    "9": ["Y", "y", "Z", "z", "+", "-"],
    "0": ["/", "*", "=", "?", "!", "@"],
}, {
    debug: true, // take [false] for true testing test-4
    sauceSeparator: 'Z',
});