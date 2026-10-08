'use strict';

const http = require('node:http');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function openServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      const closing = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closing;
    },
  };
}

module.exports = { deferred, openServer };
