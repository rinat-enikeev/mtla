/* eslint-disable require-jsdoc */

module.exports = class Associate {
  constructor(id, name, power, delegatedTo = null) {
    this.id = id;
    this.name = name;
    this.power = power;
    this.delegatedTo = delegatedTo;
    this.isReady = false;
    this.isLurker = false;
    this.electorate = new Set();
  }

  totalPowerWithDelegations() {
    let delegated = this.power;
    for (const voter of this.electorate) {
      delegated += voter.totalPowerWithDelegations();
    }
    return delegated;
  }
};
