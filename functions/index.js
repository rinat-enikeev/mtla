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
    logger.info('=== distribute endpoint called ===', {
      query: request.query,
      headers: request.headers,
    });

    const address = request.query.address;
    if (!address) {
      logger.warn('Address parameter missing in request');
      response.status(400).send('Address parameter is missing');
      return;
    }

    logger.info('Processing EURMTL distribution', {
      address,
      assetCode: EURMTL_CODE,
      assetIssuer: EURMTL_ISSUER,
    });

    return distribute(address, EURMTL_CODE, EURMTL_ISSUER);
  }
);

exports.labrDistributionTx = onRequest(
  { region: 'europe-central2' },
  async (request, response) => {
    logger.info('=== labrDistributionTx endpoint called ===', {
      query: request.query,
      headers: request.headers,
    });

    const address = request.query.address;
    if (!address) {
      logger.warn('Address parameter missing in request');
      response.status(400).send('Address parameter is missing');
      return;
    }

    logger.info('Processing LABR distribution', {
      address,
      assetCode: LABR_CODE,
      assetIssuer: LABR_ISSUER,
    });

    return distribute(address, LABR_CODE, LABR_ISSUER);
  }
);

/* eslint-disable require-jsdoc */
async function distribute(address, assetCode, assetIssuer) {
  const startTime = Date.now();
  logger.info('Starting distribute function', {
    address,
    assetCode,
    assetIssuer,
  });

  try {
    // Load account from Horizon
    logger.info('Loading account from Horizon', {
      address,
      horizonUrl: HORIZON_URL,
    });
    const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
    const account = await horizon.loadAccount(address);
    logger.info('Account loaded successfully', {
      accountId: account.accountId(),
      sequence: account.sequence,
      balancesCount: account.balances.length,
    });

    // Get balance to distribute
    const toDistribute = getBalanceOfAsset(account, assetCode, assetIssuer);
    logger.info('Balance calculated for distribution', {
      toDistribute: toDistribute.toFixed(7),
      assetCode,
      assetIssuer,
    });

    if (toDistribute <= 0) {
      logger.warn('No balance to distribute', { toDistribute });
    }

    // Fetch council members
    logger.info('Fetching council members');
    const council = await fetchCouncil(assetCode, assetIssuer);
    logger.info('Council fetched successfully', {
      councilSize: council.length,
      members: council.map((m) => ({
        id: m.id,
        power: m.power,
        totalPower: m.totalPowerWithDelegations(),
        isReady: m.isReady,
        isLurker: m.isLurker,
      })),
    });

    // Calculate total votes
    const totalVotes = Object.values(council).reduce(
      (accumulator, currentValue) => {
        return accumulator + currentValue.totalPowerWithDelegations();
      },
      0
    );
    logger.info('Total voting power calculated', { totalVotes });

    // Fetch network fee
    const fee = await horizon.fetchBaseFee();
    const finalFee = fee > 1000 ? fee : 1000;
    logger.info('Network fee fetched', {
      baseFee: fee,
      finalFee,
    });

    // Build transaction
    logger.info('Building transaction');
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: finalFee,
      networkPassphrase: StellarSdk.Networks.PUBLIC,
    });

    const distribution = {};
    let paymentCount = 0;
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
        paymentCount++;
        logger.debug('Payment operation added', {
          destination: element.id,
          amount,
          votes,
          percentage: ((votes / totalVotes) * 100).toFixed(2) + '%',
        });
      }
    });

    const totalDistributed = Object.values(distribution)
      .reduce((a, b) => parseFloat(a) + parseFloat(b), 0)
      .toFixed(7);
    logger.info('All payment operations added', {
      paymentCount,
      totalDistributed,
    });

    transaction.setTimeout(300);
    transaction.addMemo(StellarSdk.Memo.text('MTLA payout ' + assetCode));
    logger.info('Transaction finalized', {
      timeout: 300,
      memo: 'MTLA payout ' + assetCode,
    });

    const builtTransaction = transaction.build();
    const xdr = builtTransaction.toEnvelope().toXDR('base64');

    const responseData = {
      toDistribute: toDistribute.toFixed(7),
      distribution,
      xdr,
    };

    const elapsedTime = Date.now() - startTime;
    logger.info('Distribution completed successfully', {
      elapsedTimeMs: elapsedTime,
      distributionSummary: {
        recipients: paymentCount,
        totalAmount: toDistribute.toFixed(7),
        assetCode,
      },
    });

    return responseData;
  } catch (error) {
    logger.error('Error in distribute function', {
      error: error.message,
      stack: error.stack,
      address,
      assetCode,
      assetIssuer,
    });
    throw error;
  }
}
