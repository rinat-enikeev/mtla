require('dotenv').config();

const { onRequest } = require('firebase-functions/v2/https');
const StellarSdk = require('@stellar/stellar-sdk');
const { fetchCouncil } = require('./council.js');
const { EURMTL_CODE, EURMTL_ISSUER, HORIZON_URL } = require('./constants.js');
const { getBalanceOfEURMTL } = require('./horizon.js');
const { logger } = require('firebase-functions');

exports.distribute = onRequest(
  { region: 'europe-central2' },
  async (request, response) => {
    const address = request.query.address;
    if (!address) {
      response.status(400).send('Address parameter is missing');
      return;
    }
    const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
    const account = await horizon.loadAccount(address);
    const toDistribute = getBalanceOfEURMTL(account);
    logger.info('To distribute: ' + toDistribute);

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
    const distribution = {};
    council.forEach((element) => {
      const votes = element.totalPowerWithDelegations();
      const amount = ((votes / totalVotes) * toDistribute)
        .toFixed(7)
        .toString();
      logger.info('element.id: ' + amount);
      distribution[element.id] = amount;
      transaction.addOperation(
        StellarSdk.Operation.payment({
          destination: element.id,
          asset: new StellarSdk.Asset(EURMTL_CODE, EURMTL_ISSUER),
          amount: amount,
        })
      );
    });
    transaction.setTimeout(300);
    transaction.addMemo(StellarSdk.Memo.text('MTLA payout'));

    const responseData = {
      toDistribute: toDistribute.toFixed(7),
      distribution,
      xdr: transaction.build().toEnvelope().toXDR('base64'),
    };

    return response.status(200).json(responseData);
  }
);
