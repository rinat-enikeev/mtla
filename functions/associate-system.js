/* eslint-disable require-jsdoc */

const { log, error } = require('firebase-functions/logger');

module.exports = class AssociationSystem {
  constructor() {
    this.associates = {};
  }

  addAssociate(associate) {
    this.associates[associate.id] = associate;
  }

  isCouncil(associate) {
    const list = Object.values(this.associates)
      .filter((element) => element.delegatedTo === null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .sort(
        (a, b) => b.totalPowerWithDelegations() - a.totalPowerWithDelegations()
      );
    const council = list.slice(0, 21);
    return council.includes(associate);
  }

  delegatePower(fromAssociateId, toAssociateId) {
    const cycle = this.hasCycle(fromAssociateId, toAssociateId);
    if (fromAssociateId === toAssociateId) {
      log('self reference ' + fromAssociateId);
      this.associates[fromAssociateId].delegatedTo = null;
    } else if (cycle) {
      error('cycle');
    } else {
      if (this.associates[fromAssociateId] && this.associates[toAssociateId]) {
        this.associates[fromAssociateId].delegatedTo =
          this.associates[toAssociateId];
        this.associates[toAssociateId].electorate.add(
          this.associates[fromAssociateId]
        );
      } else {
        error(`From: ${fromAssociateId}, to: ${toAssociateId}`);
      }
    }
  }

  hasCycle(start, end) {
    const visited = new Set();
    const stack = new Set();

    const visit = (v) => {
      if (stack.has(v)) return true;
      if (visited.has(v)) return false;

      visited.add(v);
      stack.add(v);

      const delegatedTo = this.associates[v].delegatedTo;
      if (delegatedTo && visit(delegatedTo.id)) {
        return true;
      }

      stack.delete(v);
      return false;
    };

    return visit(start);
  }
};
