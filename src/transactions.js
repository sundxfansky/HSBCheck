export function filterTransactions(items, { search = '', direction = 'all', currency = 'all', from = '', to = '', sort = 'newest', sourceId = 'all', account = 'all', category = 'all' } = {}) {
  return items.filter(t => {
    const day = t.day;
    return (!search || `${t.description} ${t.reference} ${(t.notes || []).join(' ')}`.toLowerCase().includes(search.toLowerCase()))
      && (direction === 'all' || t.direction === direction)
      && (currency === 'all' || t.currency === currency)
      && (!from || day >= from) && (!to || day <= to)
      && (sourceId === 'all' || t.sources?.some(source => source.sourceId === sourceId))
      && (account === 'all' || t.account === account) && (category === 'all' || t.category === category);
  }).sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}

// 使用五位小数的整数单位求和，按币种和收支方向分别累计，避免浮点误差。
export function sumAmounts(items, direction, currency) {
  return unitsAmount(items.filter(t => t.direction === direction && t.currency === currency)
    .reduce((total, t) => total + amountUnits(t.amount), 0n));
}

function amountUnits(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100000n + BigInt(fraction.padEnd(5, '0'));
}

function unitsAmount(units) {
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  return `${sign}${absolute / 100000n}.${String(absolute % 100000n).padStart(5, '0')}`;
}

function cardIdFor(transaction) {
  return transaction.rewardCardId || (transaction.cardType === 'supplementary' ? `supplementary:${transaction.last4 || transaction.account || 'unknown'}` : 'primary');
}

function cardSort(left, right) {
  return Number(left.type === 'supplementary') - Number(right.type === 'supplementary')
    || (left.last4 || '').localeCompare(right.last4 || '')
    || left.id.localeCompare(right.id);
}

function cardName(card) {
  return card.type === 'supplementary' ? '副卡' : '主卡';
}

// 将当前筛选结果按主卡 / 每张副卡独立汇总。cards 允许没有交易的卡也显示出来。
export function summarizeByCard(items, cards = [], currency = 'all') {
  const groups = new Map();
  const ensure = (id, metadata = {}) => {
    if (!groups.has(id)) groups.set(id, { id, type: metadata.type || 'primary', last4: metadata.last4 || '', name: metadata.name || '', currencies: new Set(), records: [] });
    const group = groups.get(id);
    if (metadata.type) group.type = metadata.type;
    if (metadata.last4) group.last4 = metadata.last4;
    if (metadata.name) group.name = metadata.name;
    if (metadata.currency) group.currencies.add(metadata.currency);
    return group;
  };
  for (const card of cards) ensure(card.id, card);
  for (const transaction of items) {
    const group = ensure(cardIdFor(transaction), { type: transaction.cardType, last4: transaction.last4, name: transaction.cardName, currency: transaction.currency });
    group.currencies.add(transaction.currency);
    group.records.push(transaction);
  }
  return [...groups.values()].sort(cardSort).map(group => {
    const records = currency === 'all' ? group.records : group.records.filter(item => item.currency === currency);
    const debit = currency === 'all' ? null : sumAmounts(records, 'debit', currency);
    const credit = currency === 'all' ? null : sumAmounts(records, 'credit', currency);
    return {
      id: group.id,
      type: group.type,
      label: cardName(group),
      last4: records.find(record => record.last4)?.last4 || group.last4,
      name: group.name,
      currencies: [...group.currencies].sort(),
      currency,
      records,
      debit,
      credit,
      net: currency === 'all' ? null : unitsAmount(amountUnits(debit) - amountUnits(credit)),
      count: records.length,
    };
  });
}

// 相同卡片、币种和交易描述的记录合并显示，支出和入账仍保持两个方向分开。
export function summarizeDescriptions(items, currency = 'all') {
  const groups = new Map();
  for (const transaction of items) {
    if (currency !== 'all' && transaction.currency !== currency) continue;
    const key = `${cardIdFor(transaction)}\u0000${transaction.currency}\u0000${transaction.description}`;
    if (!groups.has(key)) groups.set(key, {
      id: key,
      cardId: cardIdFor(transaction),
      cardType: transaction.cardType || 'primary',
      last4: transaction.last4 || '',
      account: transaction.account || '',
      currency: transaction.currency,
      description: transaction.description,
      records: [],
    });
    groups.get(key).records.push(transaction);
  }
  return [...groups.values()].map(group => {
    const debitUnits = group.records.filter(item => item.direction === 'debit').reduce((sum, item) => sum + amountUnits(item.amount), 0n);
    const creditUnits = group.records.filter(item => item.direction === 'credit').reduce((sum, item) => sum + amountUnits(item.amount), 0n);
    return {
      ...group,
      debit: unitsAmount(debitUnits),
      credit: unitsAmount(creditUnits),
      net: unitsAmount(debitUnits - creditUnits),
      count: group.records.length,
    };
  }).sort((left, right) => right.records.length - left.records.length || left.description.localeCompare(right.description));
}

export function formatAmount(value, currency = 'HKD') {
  const fractionDigits = new Intl.NumberFormat('zh-HK', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const negative = String(value).startsWith('-');
  const [whole, fraction = ''] = String(value).replace(/^-/, '').split('.');
  // 至少显示币种标准小数位，同时保留原始金额中额外的有效精度。
  const meaningfulFraction = fraction.replace(/0+$/, '');
  const decimals = Math.max(fractionDigits, meaningfulFraction.length);
  return `${negative ? '-' : ''}${BigInt(whole).toLocaleString('en-HK')}${decimals ? `.${fraction.padEnd(decimals, '0').slice(0, decimals)}` : ''}`;
}

export function dateRange(dates) {
  const valid = dates.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day || '')).sort();
  return valid.length ? { from: valid[0], to: valid.at(-1) } : null;
}

export function formatDateRange(range) {
  if (!range) return '暂无日期';
  const from = range.from.replaceAll('-', '/');
  const to = range.to.replaceAll('-', '/');
  return from === to ? from : `${from} 至 ${to}`;
}

export function toCsv(items) {
  const escape = value => {
    let text = String(value ?? '');
    // 给可能被电子表格解释为公式的文本加单引号，前导空白和控制字符也要检查。
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [['入账日期', '交易日期', '交易描述', '收支方向', '币种', '金额', '子账户', '结单日期', '交易说明', '来源文件', '来源页码', '参考编号'], ...items.map(t => [t.day, t.transactionDay || t.day, t.description, t.direction === 'debit' ? '支出' : '入账', t.currency, t.amount, t.account || '', t.statementDate || '', t.notes?.join(' / ') || '', t.sources?.map(s => s.fileName).join(' / ') || '虚构示例', t.sources?.map(s => s.page).join(' / ') || '', t.reference])].map(row => row.map(escape).join(',')).join('\r\n');
}
