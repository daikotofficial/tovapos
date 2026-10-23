/**
 * Pure warehouse invariants shared by command handlers and focused tests.
 */

export function calculateProcessingUnitCost(totalInputCost, processingCost, outputQuantity) {
  if (!Number.isFinite(totalInputCost) || totalInputCost < 0) {
    throw new Error('Input cost is invalid');
  }
  if (!Number.isFinite(processingCost) || processingCost < 0) {
    throw new Error('Processing cost is invalid');
  }
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
    throw new Error('Output quantity must be greater than zero');
  }
  return (totalInputCost + processingCost) / outputQuantity;
}

export function validateReceiptQuantities(dispatched, accepted, rejected) {
  if (!Number.isFinite(dispatched) || dispatched <= 0) {
    throw new Error('Dispatched quantity is invalid');
  }
  if (!Number.isFinite(accepted) || accepted < 0) {
    throw new Error('Accepted quantity is invalid');
  }
  if (!Number.isFinite(rejected) || rejected < 0) {
    throw new Error('Rejected quantity is invalid');
  }
  if (accepted + rejected > dispatched) {
    throw new Error('Received quantity exceeds dispatched quantity');
  }
  return {
    complete: accepted + rejected === dispatched,
    remaining: dispatched - accepted - rejected,
  };
}

export function calculateBranchSaleBalance(currentQuantity, saleQuantity) {
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
    throw new Error('Current quantity is invalid');
  }
  if (!Number.isFinite(saleQuantity) || saleQuantity <= 0) {
    throw new Error('Sale quantity must be greater than zero');
  }
  if (saleQuantity > currentQuantity) {
    throw new Error('Insufficient branch stock');
  }
  return currentQuantity - saleQuantity;
}
