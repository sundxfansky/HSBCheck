import React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatAmount, formatDateRange } from './transactions';

export default function DescriptionSummary({ summaries, cards, currency, currencies, onCurrencyChange, period, hasData }) {
  return <section className="description-summary" aria-labelledby="description-summary-title">
    <div className="transaction-heading">
      <div><h2 id="description-summary-title">同项汇总<span className="count-badge">{summaries.length}</span></h2>
        <p>同一卡片、同币种、相同交易描述合计 · 汇总当前筛选的所有页</p>
        {period && <p>PDF 入账日期 {formatDateRange(period)}</p>}
      </div>
      <label className="currency-selector"><span className="sr-only">同项汇总币种</span>
        <select value={currency} onChange={event => onCurrencyChange(event.target.value)}>{(currencies.length ? currencies : ['HKD']).map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13}/>
      </label>
    </div>
    {cards.filter(card => summaries.some(summary => summary.cardId === card.id)).map(card => <div className="description-card" key={card.id}>
      <h3>{card.label}{card.last4 && ` ···· ${card.last4}`}<span>{card.count} 笔 · {currency}</span></h3>
      <div className="table-scroll"><table className="summary-table">
        <caption className="sr-only">{card.label} {card.last4} 相同交易描述汇总，币种 {currency}</caption>
        <thead><tr><th scope="col">交易描述</th><th scope="col">笔数</th><th scope="col">支出</th><th scope="col">入账</th><th scope="col">净支出</th></tr></thead>
        <tbody>{summaries.filter(summary => summary.cardId === card.id).map(summary => <tr key={summary.id}>
          <td>{summary.description}</td><td>{summary.count}</td><td>{formatAmount(summary.debit, currency)}</td><td>{formatAmount(summary.credit, currency)}</td><td>{formatAmount(summary.net, currency)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">本卡合计</th><td>{card.count}</td><td>{formatAmount(card.debit, currency)}</td><td>{formatAmount(card.credit, currency)}</td><td>{formatAmount(card.net, currency)}</td></tr></tfoot>
      </table></div>
    </div>)}
    {!summaries.length && <p className="summary-empty">{hasData ? '当前筛选和币种下没有可汇总的交易。' : '导入结单后，按主卡和每张副卡分别查看同项汇总。'}</p>}
    <p className="summary-footnote">净支出 = 支出 − 入账；负数表示净入账。还款也计入入账，汇总不改变或删除原始明细。</p>
  </section>;
}
