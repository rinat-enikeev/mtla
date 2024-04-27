/* eslint-disable require-jsdoc */
const { session, Telegraf, Markup } = require('telegraf');
const StellarSdk = require('@stellar/stellar-sdk');
const { EURMTL_CODE, EURMTL_ISSUER, HORIZON_URL } = require('./constants.js');
const { Horizon, StrKey } = require('@stellar/stellar-sdk');
const { error } = require('firebase-functions/logger');
const { fetchCouncil } = require('./council.js');

const bot = new Telegraf(process.env.MTLA_PAYOUTS_BOT_TOKEN);
bot.use(session());

bot.start(async (ctx) => {
  return await ctx.reply(
    '💰 MTLA payouts bot',
    Markup.keyboard([['🏛️ Council'], ['💸 Distribute']])
      .oneTime()
      .resize()
  );
});

bot.help((ctx) => ctx.reply('Type /start'));

bot.catch((err, ctx) => {
  error('[Bot] Error', err);
  return ctx.reply(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

bot.hears('🔙 Back', async (ctx) => {
  return await ctx.reply(
    '💰 MTLA payouts bot',
    Markup.keyboard([['🏛️ Council'], ['💸 Distribute']])
      .oneTime()
      .resize()
  );
});

bot.hears('🏛️ Council', async (ctx) => {
  const council = await fetchCouncil();
  let index = 1;
  let result = '';
  council.forEach((element) => {
    result +=
      index.toString() +
      '. ' +
      element.id +
      ': ' +
      element.totalPowerWithDelegations() +
      '\n';
    index += 1;
  });
  return await ctx.reply(
    result,
    Markup.keyboard([['🔙 Back']])
      .oneTime()
      .resize()
  );
});

bot.hears('💸 Distribute', async (ctx) => {
  if (ctx.session === null || ctx.session === undefined) {
    ctx.session = { isWaitingForStellarAddressToDistribute: false };
  }
  ctx.session.isWaitingForStellarAddressToDistribute = true;
  return await ctx.reply(
    '⛓️ Please enter Stellar address which ' +
      'you would like to distribute EURMTL from...',
    Markup.keyboard([['🔙 Back']])
      .oneTime()
      .resize()
  );
});

bot.on('message', async (ctx) => {
  if (ctx.session === null || ctx.session === undefined) {
    ctx.session = { isWaitingForStellarAddressToDistribute: false };
  }
  if (ctx.session.isWaitingForStellarAddressToDistribute) {
    if (StrKey.isValidEd25519PublicKey(ctx.text)) {
      const horizon = new Horizon.Server(HORIZON_URL);
      let result = 'This is valid Stellar address\n';
      const account = await horizon.loadAccount(ctx.text);
      let toDistribute = 0.0;
      for (const balance of account.balances) {
        if (
          balance.asset_code === EURMTL_CODE &&
          balance.asset_issuer === EURMTL_ISSUER
        ) {
          const eurmtl = parseFloat(balance.balance);
          result += 'EURMTL: ' + eurmtl.toString() + '\n';
          toDistribute = eurmtl;
        }
      }

      if (
        toDistribute === 0.0 ||
        toDistribute === undefined ||
        toDistribute == null
      ) {
        return await ctx.reply(
          '🚧 Zero EURMTL balance',
          Markup.keyboard([['🏛️ Council'], ['💸 Distribute']])
            .oneTime()
            .resize()
        );
      }

      const council = await fetchCouncil();
      const totalVotes = Object.values(council).reduce(
        (accumulator, currentValue) => {
          return accumulator + currentValue.totalPowerWithDelegations();
        },
        0
      );

      const fee = await horizon.fetchBaseFee();
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: fee > 1000 ? fee : 1000,
        networkPassphrase: StellarSdk.Networks.PUBLIC,
      });
      council.forEach((element) => {
        const votes = element.totalPowerWithDelegations();
        transaction.addOperation(
          StellarSdk.Operation.payment({
            destination: element.id,
            asset: new StellarSdk.Asset(EURMTL_CODE, EURMTL_ISSUER),
            amount: ((votes / totalVotes) * toDistribute).toFixed(7).toString(),
          })
        );
      });
      transaction.setTimeout(300);
      transaction.addMemo(StellarSdk.Memo.text('MTLA payout'));

      result += '<code>\n';
      result += transaction.build().toEnvelope().toXDR('base64');
      result += '\n</code>';
      ctx.session.isWaitingForStellarAddressToDistribute = false;
      return ctx.replyWithHTML(result);
    } else {
      return await ctx.reply(
        '🚧 Not a valid Stellar address',
        Markup.keyboard([['🏛️ Council'], ['💸 Distribute']])
          .oneTime()
          .resize()
      );
    }
  } else {
    return await ctx.reply(
      '🚧 Unsupported command',
      Markup.keyboard([['🏛️ Council'], ['💸 Distribute']])
        .oneTime()
        .resize()
    );
  }
});

bot.launch({
  webhook: {
    domain: process.env.CLOUD_FUNCTION_PUBLIC_URL,
    port: 443,
  },
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
