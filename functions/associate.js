/* eslint-disable require-jsdoc */

const { debug } = require('firebase-functions/logger');

module.exports = class Associate {
  constructor(id, name, power, delegatedTo = null) {
    this.id = id;
    this.name = name;
    this.power = power;
    this.delegatedTo = delegatedTo;
    this.isReady = false;
    this.isLurker = false;
    this.electorate = new Set();

    debug('Associate created', {
      id,
      name,
      power,
      delegatedTo: delegatedTo ? delegatedTo.id : null,
    });
  }

  totalPowerWithDelegations() {
    let delegated = this.power >= 2 ? this.power : 0;
    let electorateCount = 0;

    for (const voter of this.electorate) {
      const voterPower = voter.totalPowerWithDelegations();
      delegated += voterPower;
      electorateCount++;
    }

    debug('Calculated total power with delegations', {
      associateId: this.id,
      ownPower: this.power,
      electorateSize: electorateCount,
      totalPower: delegated,
    });

    return delegated;
  }
};
