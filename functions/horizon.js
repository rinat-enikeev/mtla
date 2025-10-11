/* eslint-disable require-jsdoc */

const { logger } = require('firebase-functions');

function getBalanceOfAsset(account, code, tokenIssuer) {
  logger.debug('Getting balance of asset', {
    accountId: account.accountId(),
    assetCode: code,
    assetIssuer: tokenIssuer,
    totalBalances: account.balances.length,
  });

  let toDistribute = 0.0;
  let assetFound = false;

  for (const balance of account.balances) {
    if (balance.asset_code === code && balance.asset_issuer === tokenIssuer) {
      const assetAmount = parseFloat(balance.balance);
      toDistribute = assetAmount;
      assetFound = true;
      logger.info('Asset balance found', {
        assetCode: code,
        rawBalance: assetAmount,
      });
      break;
    }
  }

  if (!assetFound) {
    logger.warn('Asset not found in account balances', {
      accountId: account.accountId(),
      assetCode: code,
      assetIssuer: tokenIssuer,
    });
  }

  // because of rounding it's possible that it would be not enough funds
  // Subtracting 0.01 to account for potential rounding issues
  const beforeRoundingAdjustment = toDistribute;
  toDistribute -= 0.01;

  // Ensure toDistribute is never negative
  if (toDistribute < 0) {
    logger.debug('Balance after adjustment was negative, setting to 0', {
      beforeAdjustment: beforeRoundingAdjustment,
      afterAdjustment: toDistribute,
    });
    toDistribute = 0;
  }

  logger.info('Balance calculation completed', {
    assetCode: code,
    rawBalance: beforeRoundingAdjustment,
    distributionBalance: toDistribute,
    adjustment: -0.01,
  });

  return toDistribute;
}

module.exports.getBalanceOfAsset = getBalanceOfAsset;
