/* eslint-disable require-jsdoc */
const { Horizon } = require('@stellar/stellar-sdk');
const Associate = require('./associate.js');
const AssociationSystem = require('./associate-system.js');
const {
  MTLAP_CODE,
  MTLAP_ISSUER,
  HORIZON_URL,
  COUNCIL_DELEGATE_TAG,
  COUNCIL_READY_VALUE,
} = require('./constants.js');

async function fetchCouncil() {
  const horizon = new Horizon.Server(HORIZON_URL);

  // Fetch accounts holding the asset
  let accountsResponse = await horizon
    .accounts()
    .forAsset(MTLAP_CODE + ':' + MTLAP_ISSUER)
    .limit(50)
    .call();

  let records = accountsResponse.records;

  const associateIdToAccount = {};
  const associationSystem = new AssociationSystem();
  while (records.length > 0) {
    for (const account of records) {
      for (const balance of account.balances) {
        if (
          balance.asset_code === MTLAP_CODE &&
          balance.asset_issuer === MTLAP_ISSUER
        ) {
          const mtlap = parseFloat(balance.balance);
          if (mtlap >= 1) {
            const associate = new Associate(
              account.account_id,
              account.account_id,
              mtlap
            );
            associationSystem.addAssociate(associate);
            associateIdToAccount[associate.id] = account;
          }
        }
      }
    }

    accountsResponse = await accountsResponse.next();
    records = accountsResponse.records;
  }

  await fetchIntermediaries(associateIdToAccount, associationSystem);

  Object.entries(associateIdToAccount).forEach(([associateId, account]) => {
    if (account.data_attr && account.data_attr[COUNCIL_DELEGATE_TAG]) {
      // Decode base64 string using Buffer in Node.js
      const delegateId = Buffer.from(
        account.data_attr[COUNCIL_DELEGATE_TAG],
        'base64'
      ).toString('utf8');

      if (delegateId !== COUNCIL_READY_VALUE) {
        if (Object.keys(associationSystem.associates).includes(delegateId)) {
          associationSystem.delegatePower(account.account_id, delegateId);
        } else {
          associationSystem.associates[associateId].isLurker = true;
        }
      } else {
        associationSystem.associates[associateId].isReady = true;
      }
    } else {
      associationSystem.associates[associateId].isLurker = true;
    }
  });

  const list = Object.values(associationSystem.associates)
    .filter((element) => element.delegatedTo === null)
    .sort((a, b) => a.id.localeCompare(b.id))
    .sort(
      (a, b) => b.totalPowerWithDelegations() - a.totalPowerWithDelegations()
    )
    .filter((value, index, array) => value.id !== MTLAP_ISSUER);

  return list.slice(0, 20);
}

async function fetchIntermediaries(associateIdToAccount, associationSystem) {
  const horizon = new Horizon.Server(HORIZON_URL);
  const intermediaries = [];
  const stringToBase64 = (str) => Buffer.from(str, 'base64').toString('utf-8');

  // Iterate over each associate-account pair
  Object.values(associateIdToAccount).forEach((account) => {
    if (account.data_attr && account.data_attr[COUNCIL_DELEGATE_TAG]) {
      const delegateId = stringToBase64(
        account.data_attr[COUNCIL_DELEGATE_TAG]
      );
      if (
        delegateId !== COUNCIL_READY_VALUE &&
        !Object.keys(associationSystem.associates).includes(delegateId)
      ) {
        intermediaries.push(new Associate(delegateId, delegateId, 0));
      }
    }
  });

  // Fetch accounts for each intermediary and update the map
  for (const intermediary of intermediaries) {
    const account = await horizon.loadAccount(intermediary.id);
    associateIdToAccount[intermediary.id] = account;
  }

  // Add each intermediary to the association system
  for (const element of intermediaries) {
    associationSystem.addAssociate(element);
  }

  // Recursive check to find more intermediaries if conditions are met
  Object.values(associateIdToAccount).forEach((account) => {
    if (account.data_attr && account.data_attr[COUNCIL_DELEGATE_TAG]) {
      const delegateId = stringToBase64(
        account.data_attr[COUNCIL_DELEGATE_TAG]
      );
      if (
        delegateId !== COUNCIL_READY_VALUE &&
        !Object.keys(associationSystem.associates).includes(delegateId)
      ) {
        fetchIntermediaries(associateIdToAccount);
      }
    }
  });
}

module.exports.fetchCouncil = fetchCouncil;
