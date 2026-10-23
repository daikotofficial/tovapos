import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBranchSaleBalance,
  calculateProcessingUnitCost,
  validateReceiptQuantities,
} from '../src/lib/pos/warehouse-rules.mjs';

test('processing allocates input and processing cost across outputs', () => {
  assert.equal(calculateProcessingUnitCost(500000, 50000, 19), 550000 / 19);
  assert.throws(() => calculateProcessingUnitCost(500000, 0, 0), /Output quantity/);
});

test('receiving cannot accept more than dispatched and supports partial receipts', () => {
  assert.deepEqual(validateReceiptQuantities(10, 8, 0), { complete: false, remaining: 2 });
  assert.deepEqual(validateReceiptQuantities(10, 8, 2), { complete: true, remaining: 0 });
  assert.throws(() => validateReceiptQuantities(10, 9, 2), /exceeds/);
});

test('branch checkout cannot make stock negative', () => {
  assert.equal(calculateBranchSaleBalance(10, 3), 7);
  assert.throws(() => calculateBranchSaleBalance(2, 3), /Insufficient/);
});
