/* eslint-disable require-jsdoc */
const { EURMTL_CODE, EURMTL_ISSUER } = require('./constants.js');

function getBalanceOfEURMTL(account) {
  let toDistribute = 0.0;
  for (const balance of account.balances) {
    if (
      balance.asset_code === EURMTL_CODE &&
      balance.asset_issuer === EURMTL_ISSUER
    ) {
      const eurmtl = parseFloat(balance.balance);
      toDistribute = eurmtl;
    }
  }

  // because of rounding it's possible that it would be not enough funds
  // Subtracting 0.01 to account for potential rounding issues
  toDistribute -= 0.01;

  // Ensure toDistribute is never negative
  if (toDistribute < 0) {
    toDistribute = 0;
  }

  return toDistribute;
}

module.exports.getBalanceOfEURMTL = getBalanceOfEURMTL;
