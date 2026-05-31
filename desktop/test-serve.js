'use strict';
// Test-only launcher: start the desktop static+proxy server and print its port.
const path = require('node:path');
const { startServer } = require('./src/server.js');
startServer(path.join(__dirname, 'renderer'))
  .then((h) => {
    console.log('PORT=' + h.port);
  })
  .catch((e) => {
    console.error('SERVE_ERR=' + e.message);
    process.exit(1);
  });
