/* eslint-disable require-jsdoc */
const { Horizon } = require('@stellar/stellar-sdk');
const Associate = require('./associate.js');
const AssociationSystem = require('./associate-system.js');
const { logger } = require('firebase-functions');
const {
  MTLAP_CODE,
  MTLAP_ISSUER,
  HORIZON_URL,
  COUNCIL_DELEGATE_TAG,
  COUNCIL_READY_VALUE,
} = require('./constants.js');

async function fetchCouncil(assetCode, assetIssuer) {
  const startTime = Date.now();
  logger.info('Starting fetchCouncil', {
    assetCode,
    assetIssuer,
    mtlapCode: MTLAP_CODE,
    mtlapIssuer: MTLAP_ISSUER,
  });

  const horizon = new Horizon.Server(HORIZON_URL);

  try {
    // Fetch accounts holding the asset
    logger.info('Fetching accounts holding MTLAP asset', {
      asset: MTLAP_CODE + ':' + MTLAP_ISSUER,
      limit: 50,
    });

    let accountsResponse = await horizon
      .accounts()
      .forAsset(MTLAP_CODE + ':' + MTLAP_ISSUER)
      .limit(50)
      .call();

    let records = accountsResponse.records;
    logger.info('Initial accounts fetched', {
      count: records.length,
    });

    const associateIdToAccount = {};
    const associationSystem = new AssociationSystem();
    let pageCount = 1;
    let totalAccountsProcessed = 0;
    let associatesAdded = 0;
    let accountsSkippedNoTrustline = 0;
    let accountsSkippedLowBalance = 0;

    while (records.length > 0) {
      logger.debug('Processing accounts page', {
        pageNumber: pageCount,
        recordsInPage: records.length,
      });

      for (const account of records) {
        totalAccountsProcessed++;

        const hasLabrTrustline = account.balances.some(
          (balance) =>
            balance.asset_code === assetCode &&
            balance.asset_issuer === assetIssuer
        );

        if (!hasLabrTrustline) {
          accountsSkippedNoTrustline++;
          logger.debug('Account skipped - no target asset trustline', {
            accountId: account.account_id,
            assetCode,
          });
          continue;
        }

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
              associatesAdded++;
              logger.debug('Associate added', {
                accountId: account.account_id,
                mtlapBalance: mtlap,
              });
            } else {
              accountsSkippedLowBalance++;
              logger.debug('Account skipped - MTLAP balance too low', {
                accountId: account.account_id,
                mtlapBalance: mtlap,
              });
            }
          }
        }
      }

      accountsResponse = await accountsResponse.next();
      records = accountsResponse.records;
      pageCount++;

      if (records.length > 0) {
        logger.debug('Fetched next page of accounts', {
          pageNumber: pageCount,
          recordsInPage: records.length,
        });
      }
    }

    logger.info('All accounts processed', {
      totalAccountsProcessed,
      associatesAdded,
      accountsSkippedNoTrustline,
      accountsSkippedLowBalance,
      pagesProcessed: pageCount - 1,
    });

    logger.info('Fetching intermediaries (delegates not direct MTLAP holders)');
    await fetchIntermediaries(associateIdToAccount, associationSystem);

    logger.info('Processing delegation relationships');
    let delegationsProcessed = 0;
    let readyAssociates = 0;
    let lurkers = 0;

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
            delegationsProcessed++;
            logger.debug('Power delegated', {
              from: account.account_id,
              to: delegateId,
            });
          } else {
            associationSystem.associates[associateId].isLurker = true;
            lurkers++;
            logger.debug('Associate marked as lurker - delegate not found', {
              associateId,
              delegateId,
            });
          }
        } else {
          associationSystem.associates[associateId].isReady = true;
          readyAssociates++;
          logger.debug('Associate marked as ready', { associateId });
        }
      } else {
        associationSystem.associates[associateId].isLurker = true;
        lurkers++;
        logger.debug('Associate marked as lurker - no delegate tag', {
          associateId,
        });
      }
    });

    logger.info('Delegation processing complete', {
      delegationsProcessed,
      readyAssociates,
      lurkers,
    });

    logger.info('Filtering and sorting council candidates');
    const list = Object.values(associationSystem.associates)
      .filter((element) => element.delegatedTo === null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .sort(
        (a, b) => b.totalPowerWithDelegations() - a.totalPowerWithDelegations()
      )
      .filter((value, index, array) => value.id !== MTLAP_ISSUER);

    const finalCouncil = list.slice(0, 20);

    const elapsedTime = Date.now() - startTime;
    const totalPower = finalCouncil.reduce(
      (sum, m) => sum + m.totalPowerWithDelegations(),
      0
    );
    logger.info('fetchCouncil completed', {
      elapsedTimeMs: elapsedTime,
      councilSize: finalCouncil.length,
      totalPower,
    });

    return finalCouncil;
  } catch (error) {
    logger.error('Error in fetchCouncil', {
      error: error.message,
      stack: error.stack,
      assetCode,
      assetIssuer,
    });
    throw error;
  }
}

async function fetchIntermediaries(associateIdToAccount, associationSystem) {
  logger.info('Starting fetchIntermediaries');

  try {
    const horizon = new Horizon.Server(HORIZON_URL);
    const intermediaries = [];
    const stringToBase64 = (str) =>
      Buffer.from(str, 'base64').toString('utf-8');

    // Iterate over each associate-account pair
    logger.debug('Identifying intermediaries from existing associates');
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
          logger.debug('Intermediary identified', {
            delegateId,
            delegatedFrom: account.account_id,
          });
        }
      }
    });

    logger.info('Intermediaries identified', { count: intermediaries.length });

    // Fetch accounts for each intermediary and update the map
    if (intermediaries.length > 0) {
      logger.info('Fetching account data for intermediaries');
      for (const intermediary of intermediaries) {
        try {
          const account = await horizon.loadAccount(intermediary.id);
          associateIdToAccount[intermediary.id] = account;
          logger.debug('Intermediary account loaded', {
            accountId: intermediary.id,
            balancesCount: account.balances.length,
          });
        } catch (error) {
          logger.error('Failed to load intermediary account', {
            accountId: intermediary.id,
            error: error.message,
          });
        }
      }

      // Add each intermediary to the association system
      logger.info('Adding intermediaries to association system');
      for (const element of intermediaries) {
        associationSystem.addAssociate(element);
        logger.debug('Intermediary added to system', { accountId: element.id });
      }
    }

    // Recursive check to find more intermediaries if conditions are met
    logger.debug('Checking for additional nested intermediaries');
    let additionalIntermediariesFound = false;
    Object.values(associateIdToAccount).forEach((account) => {
      if (account.data_attr && account.data_attr[COUNCIL_DELEGATE_TAG]) {
        const delegateId = stringToBase64(
          account.data_attr[COUNCIL_DELEGATE_TAG]
        );
        if (
          delegateId !== COUNCIL_READY_VALUE &&
          !Object.keys(associationSystem.associates).includes(delegateId)
        ) {
          additionalIntermediariesFound = true;
          logger.info('Additional intermediary found, recursing', {
            delegateId,
          });
          fetchIntermediaries(associateIdToAccount);
        }
      }
    });

    if (!additionalIntermediariesFound) {
      logger.debug('No additional intermediaries found');
    }

    logger.info('fetchIntermediaries completed', {
      intermediariesAdded: intermediaries.length,
    });
  } catch (error) {
    logger.error('Error in fetchIntermediaries', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports.fetchCouncil = fetchCouncil;
