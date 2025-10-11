/* eslint-disable require-jsdoc */

function getBalanceOfAsset(account, code, tokenIssuer) {
  let toDistribute = 0.0;
  for (const balance of account.balances) {
    if (balance.asset_code === code && balance.asset_issuer === tokenIssuer) {
      const assetAmount = parseFloat(balance.balance);
      toDistribute = assetAmount;
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

module.exports.getBalanceOfAsset = getBalanceOfAsset;
