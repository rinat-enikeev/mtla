/* eslint-disable require-jsdoc */

const { log, error, debug } = require('firebase-functions/logger');

module.exports = class AssociationSystem {
  constructor() {
    this.associates = {};
    log('AssociationSystem initialized');
  }

  addAssociate(associate) {
    this.associates[associate.id] = associate;
    debug('Associate added to system', {
      id: associate.id,
      power: associate.power,
      totalAssociates: Object.keys(this.associates).length,
    });
  }

  isCouncil(associate) {
    debug('Checking if associate is in council', { associateId: associate.id });
    const list = Object.values(this.associates)
      .filter((element) => element.delegatedTo === null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .sort(
        (a, b) => b.totalPowerWithDelegations() - a.totalPowerWithDelegations()
      );
    const council = list.slice(0, 21);
    const isInCouncil = council.includes(associate);
    debug('Council membership check result', {
      associateId: associate.id,
      isInCouncil,
      totalCandidates: list.length,
    });
    return isInCouncil;
  }

  delegatePower(fromAssociateId, toAssociateId) {
    debug('Attempting to delegate power', {
      from: fromAssociateId,
      to: toAssociateId,
    });

    const cycle = this.hasCycle(fromAssociateId, toAssociateId);

    if (fromAssociateId === toAssociateId) {
      log('Self-delegation detected - setting delegatedTo to null', {
        associateId: fromAssociateId,
      });
      this.associates[fromAssociateId].delegatedTo = null;
    } else if (cycle) {
      error('Delegation cycle detected', {
        from: fromAssociateId,
        to: toAssociateId,
      });
    } else {
      if (this.associates[fromAssociateId] && this.associates[toAssociateId]) {
        this.associates[fromAssociateId].delegatedTo =
          this.associates[toAssociateId];
        this.associates[toAssociateId].electorate.add(
          this.associates[fromAssociateId]
        );
        const toTotalPower =
          this.associates[toAssociateId].totalPowerWithDelegations();
        debug('Power delegated successfully', {
          from: fromAssociateId,
          to: toAssociateId,
          fromPower: this.associates[fromAssociateId].power,
          toNewTotalPower: toTotalPower,
        });
      } else {
        error('Associate not found in delegation', {
          from: fromAssociateId,
          to: toAssociateId,
          fromExists: !!this.associates[fromAssociateId],
          toExists: !!this.associates[toAssociateId],
        });
      }
    }
  }

  hasCycle(start, end) {
    debug('Checking for delegation cycle', { start, end });
    const visited = new Set();
    const stack = new Set();

    const visit = (v) => {
      if (stack.has(v)) {
        debug('Cycle detected in visit', { node: v });
        return true;
      }
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

    const hasCycle = visit(start);
    debug('Cycle check completed', { start, end, hasCycle });
    return hasCycle;
  }
};
