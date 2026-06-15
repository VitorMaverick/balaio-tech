/**
 * autonomous_agent/config.js
 * Carrega e exporta a configuração.
 */
const path = require('path');
const config = require('./config.json');
const { ROOT } = require('./utils');

config.uploadsPath = path.resolve(ROOT, process.env.UPLOADS_PATH || config.uploadsPath);
config.databasePath = path.resolve(ROOT, process.env.DATABASE_PATH || config.databasePath);
config.port = parseInt(process.env.PORT || config.port, 10);

module.exports = config;
