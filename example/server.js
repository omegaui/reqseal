import fs from 'fs';
import express from 'express';
import { reqSeal, createInMemoryReplayCache } from '../src/express-mw.js';

const app = express();

const matrix = JSON.parse(fs.readFileSync('./secrets/reqseal-matrix.json', 'utf-8').toString());
const reqSealOptions = { sauceSeparator: "Z" };

app.use(
  reqSeal({
    matrix,
    reqSealOptions,
    allowedSkewMs: 30_000,
    replayCache: createInMemoryReplayCache(),
  }),
);

// secure by default with ReqSeal
app.get('/secure', (req, res) => {
  // req.reqSeal is populated by middleware
  // containing both key and decoded value
  res.json({
    ok: true,
    timestamp: req.reqSeal.timestamp,
  });
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});