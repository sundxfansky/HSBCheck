import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRange, filterTransactions, formatAmount, formatDateRange, sumAmounts, summarizeByCard, summarizeDescriptions, toCsv } from '../src/transactions.js';

const item = (overrides = {}) => ({ id: '1', description: 'Example coffee', reference: '第 1 页', day: '2026-09-01', date: '2026-09-01T00:00:00+08:00', transactionDay: '2026-08-31', amount: '0.10', currency: 'CNY', direction: 'debit', category: 'spend', account: 'CNY ···· 0004', statementDate: '2026-09-14', notes: ['APPLE PAY-MOBILE:1234'], sources: [{ sourceId: 'first', fileName: 'statement.pdf', page: 1 }], ...overrides });
test('precise totals separate directions and currencies', () => {
  const records = [item(), item({ amount: '0.20' }), item({ currency: 'HKD', amount: '999.00' }), item({ direction: 'credit', amount: '5.00' })];
  assert.equal(sumAmounts(records, 'debit', 'CNY'), '0.30000');
  assert.equal(sumAmounts(records, 'credit', 'CNY'), '5.00000');
  assert.equal(formatAmount('1234567890123.12345', 'CNY'), '1,234,567,890,123.12345');
  assert.equal(formatAmount('42.00000', 'JPY'), '42');
});
test('summarizes spending and credits independently for primary and supplementary cards', () => {
  const records = [
    item({ id: 'main-1', rewardCardId: 'main', cardType: 'primary', last4: '0004', amount: '10.00' }),
    item({ id: 'main-2', rewardCardId: 'main', cardType: 'primary', last4: '0004', direction: 'credit', amount: '2.00' }),
    item({ id: 'sup-1', rewardCardId: 'sup', cardType: 'supplementary', last4: '0005', amount: '3.50' }),
  ];
  const summaries = summarizeByCard(records, [{ id: 'main', type: 'primary', last4: '0004' }, { id: 'sup', type: 'supplementary', last4: '0005' }], 'CNY');
  assert.deepEqual(summaries.map(({ label, last4, debit, credit, count }) => ({ label, last4, debit, credit, count })), [
    { label: '主卡', last4: '0004', debit: '10.00000', credit: '2.00000', count: 2 },
    { label: '副卡', last4: '0005', debit: '3.50000', credit: '0.00000', count: 1 },
  ]);
});
test('combines identical descriptions by card and currency while keeping directions separate', () => {
  const records = [
    item({ id: 'a', rewardCardId: 'main', description: 'STORE', amount: '1.25' }),
    item({ id: 'b', rewardCardId: 'main', description: 'STORE', amount: '2.75' }),
    item({ id: 'c', rewardCardId: 'main', description: 'STORE', direction: 'credit', amount: '1.00' }),
    item({ id: 'd', rewardCardId: 'sup', cardType: 'supplementary', description: 'STORE', amount: '99.00' }),
  ];
  const summaries = summarizeDescriptions(records, 'CNY');
  assert.equal(summaries.length, 2);
  const main = summaries.find(summary => summary.cardId === 'main');
  assert.deepEqual({ debit: main.debit, credit: main.credit, net: main.net, count: main.count }, { debit: '4.00000', credit: '1.00000', net: '3.00000', count: 3 });
});
test('currencies and multiple supplementary cards stay separate, including net credits below one unit', () => {
  const records = [
    item({ rewardCardId: 'main', amount: '0.10' }),
    item({ rewardCardId: 'main', amount: '0.20', direction: 'credit' }),
    item({ rewardCardId: 'main', amount: '9.99', currency: 'HKD' }),
    item({ rewardCardId: 'sup-a', cardType: 'supplementary', amount: '1.00' }),
    item({ rewardCardId: 'sup-b', cardType: 'supplementary', amount: '2.00' }),
  ];
  assert.equal(summarizeDescriptions(records).length, 4);
  const summaries = summarizeByCard(records, [], 'CNY');
  assert.deepEqual(summaries.map(summary => formatAmount(summary.net, 'CNY')), ['-0.10', '1.00', '2.00']);
  assert.equal(summarizeDescriptions(records, 'HKD')[0].debit, '9.99000');
  const filtered = filterTransactions(records, { direction: 'credit' });
  const emptyCards = summarizeByCard(filtered, [{ id: 'main', type: 'primary' }, { id: 'sup-a', type: 'supplementary' }, { id: 'sup-b', type: 'supplementary' }], 'CNY');
  assert.deepEqual(emptyCards.map(summary => summary.count), [1, 0, 0]);
  assert.deepEqual(emptyCards.map(summary => summary.net), ['-0.20000', '0.00000', '0.00000']);
  assert.equal(summarizeDescriptions(filtered, 'CNY')[0].count, 1);
});
test('PDF coverage uses actual posting days, including historical dates and empty filters', () => {
  const days = ['2026-01-02', '', null, '2025-12-30', 'bad'];
  const range = dateRange(days);
  assert.deepEqual(range, { from: '2025-12-30', to: '2026-01-02' });
  assert.equal(formatDateRange(range), '2025/12/30 至 2026/01/02');
  assert.equal(formatDateRange(dateRange(['2023-03-01'])), '2023/03/01');
  assert.equal(formatDateRange(dateRange([])), '暂无日期');
});
test('combines dates, source file, account, currency, direction and transaction type', () => {
  const records = [item(), item({ id: '2', direction: 'credit', category: 'repayment', day: '2026-09-02', date: '2026-09-02', sources: [{ sourceId: 'second' }] })];
  assert.equal(filterTransactions(records, { sourceId: 'first', account: 'CNY ···· 0004', currency: 'CNY', direction: 'debit', from: '2026-09-01', to: '2026-09-01', category: 'spend' }).length, 1);
  assert.equal(filterTransactions(records, { category: 'repayment' }).length, 1);
  assert.equal(filterTransactions(records, { sourceId: 'missing' }).length, 0);
  assert.equal(filterTransactions(records, { sort: 'oldest' })[0].id, '1');
});
test('search includes continuation notes and is case insensitive', () => {
  assert.equal(filterTransactions([item()], { search: 'COFFEE' }).length, 1);
  assert.equal(filterTransactions([item()], { search: 'apple pay' }).length, 1);
});
test('CSV includes both dates and all provenance, preserves unicode and escapes formulas', () => {
  const csv = toCsv([item({ description: ' =HYPERLINK("bad")', sources: [{ sourceId: 'first', fileName: '@SUM(1)', page: 4 }], reference: '+Formula' })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('交易日期')); assert.ok(csv.includes('来源页码')); assert.ok(csv.includes('2026-08-31'));
  assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"')); assert.ok(csv.includes('"\'@SUM(1)"')); assert.ok(csv.includes('"\'+Formula"'));
});
