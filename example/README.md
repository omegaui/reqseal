# example

Simple reqseal as an express middleware example.

## Running
Before running the server, make sure to have the `reqseal-matrix.json` file in the `secrets` directory.
You can take the example matrix from the `test` directory `common-mod.js` file.

First install dependencies:

```bash
bun install
```

Then run the server:

```bash
bun run server.js
```

Now you can make a request to the server with this curl example:
```
curl -X GET http://localhost:3000/secure \
  -H "x-reqseal-key: <your-generated-key>"
```

> <your-generated-key>

You can obtain a key by running the test number 1, from the root repository.
```
bun run test/test-1.js
```

> example key: `/Ze1G1Sc1M1/u1M1At1G1Mw1G2A/W1D2AAA1/1Jo1M1GE1D1Yi1M1P!1J1VQ1D1Dq1G2AD`