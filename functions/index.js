require('dotenv').config();

const { onRequest } = require('firebase-functions/v2/https');
const StellarSdk = require('@stellar/stellar-sdk');
const { fetchCouncil } = require('./council.js');
const {
  EURMTL_CODE,
  EURMTL_ISSUER,
  HORIZON_URL,
  LABR_CODE,
  LABR_ISSUER,
} = require('./constants.js');
const { logger } = require('firebase-functions');
const { getBalanceOfAsset } = require('./horizon.js');

exports.distribute = onRequest(
  { region: 'europe-central2' },
  async (request, response) => {
    const address = request.query.address;
    if (!address) {
      response.status(400).send('Address parameter is missing');
      return;
    }
    return distribute(address, EURMTL_CODE, EURMTL_ISSUER);
  }
);

exports.labrDistributionTx = onRequest(
  { region: 'europe-central2' },
  async (request, response) => {
    const address = request.query.address;
    if (!address) {
      response.status(400).send('Address parameter is missing');
      return;
    }
    return distribute(address, LABR_CODE, LABR_ISSUER);
  }
);

/* eslint-disable require-jsdoc */
async function distribute(address, assetCode, assetIssuer) {
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await horizon.loadAccount(address);
  const toDistribute = getBalanceOfAsset(account, assetCode, assetIssuer);
  logger.info('To distribute: ' + toDistribute);

  const council = await fetchCouncil(assetCode, assetIssuer);
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
  const distribution = {};
  council.forEach((element) => {
    const votes = element.totalPowerWithDelegations();
    const amount = ((votes / totalVotes) * toDistribute).toFixed(7);
    if (amount >= 0) {
      distribution[element.id] = amount;
      transaction.addOperation(
        StellarSdk.Operation.payment({
          destination: element.id,
          asset: new StellarSdk.Asset(assetCode, assetIssuer),
          amount: amount.toString(),
        })
      );
    }
  });
  transaction.setTimeout(300);
  transaction.addMemo(StellarSdk.Memo.text('MTLA payout ' + assetCode));

  const responseData = {
    toDistribute: toDistribute.toFixed(7),
    distribution,
    xdr: transaction.build().toEnvelope().toXDR('base64'),
  };

  return responseData;
}
