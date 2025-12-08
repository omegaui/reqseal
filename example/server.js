import express from 'express';
import { reqSeal, createInMemoryReplayCache } from '../src/express-mw.js';

const app = express();

const matrix = {
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
};
const reqSealOptions = {
  sauceSeparator: "Z"
};

app.use(
  reqSeal({
    matrix,
    reqSealOptions,
    allowedSkewMs: 30_000,
    replayCache: createInMemoryReplayCache(),
  }),
);

app.get('/secure', (req, res) => {
  // req.reqSeal is populated by middleware
  res.json({
    ok: true,
    timestamp: req.reqSeal.timestamp,
  });
});


app.listen(3000, () => {
  console.log('Server started on port 3000');
});