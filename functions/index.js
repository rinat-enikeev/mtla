require('dotenv').config();

const { onRequest } = require('firebase-functions/v2/https');
const bot = require('./bot.js');

exports.echoBot = onRequest(
  { region: 'europe-central2' },
  async (request, response) => {
    return await bot.handleUpdate(request.body, response);
  }
);
