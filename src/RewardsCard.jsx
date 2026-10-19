import React, { useEffect, useId, useMemo, useState } from 'react';
import { CircleHelp, RefreshCw, LoaderCircle, ExternalLink, Gift, AlertCircle } from 'lucide-react';
import { calculateImportedRewards, groupRewardCards, hongKongToday, rewardMoney } from './rewards';
import { formatAmount, formatDateRange } from './transactions';
import { fetchHkdCnyRate, RATE_SOURCE } from './exchange-rate';

const amount = units => formatAmount(rewardMoney(units), 'CNY');

function Allowance({ title, pool, scope = '年度消费额度' }) {
  return <div className="reward-allowance">
    <div className="allowance-label"><span>{scope}</span><strong>{pool.progress.toFixed(1)}%</strong></div>
    <div className="reward-progress" role="progressbar" aria-label={`${title}${scope}`} aria-valuemin={0} aria-valuemax={Number(pool.cap) / 100000} aria-valuenow={Number(pool.used) / 100000} aria-valuetext={`已占用 ${amount(pool.used)} 人民币，本期额度 ${amount(pool.cap)} 人民币`}><span style={{ width: `${pool.progress}%` }}/></div>
    <div className="allowance-amount"><span>CNY {amount(pool.used)}</span><span>/ {amount(pool.cap)}</span></div>
    <p>剩余额度 CNY {amount(pool.remaining)}{pool.overCap > 0n ? ` · 已超出 ${amount(pool.overCap)}` : ''}</p>
  </div>;
}

export default function RewardsCard({ records, cards = [], overrides, hasData, demo }) {
  const [exchange, setExchange] = useState({ value: null, loading: true, error: '' });
  const [reload, setReload] = useState(0);
  const today = hongKongToday();
  useEffect(() => {
    const controller = new AbortController(); let active = true; let timedOut = false;
    setExchange(current => ({ ...current, loading: true, error: '' }));
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
    fetchHkdCnyRate({ signal: controller.signal }).then(value => {
      if (active) setExchange({ value, loading: false, error: '' });
    }).catch(() => {
      if (active) setExchange(current => ({ ...current, loading: false, error: timedOut ? '汇率请求超时' : '无法获取参考汇率，请检查网络后重试' }));
    }).finally(() => clearTimeout(timer));
    // 卸载或刷新时取消旧请求，避免过期响应覆盖新汇率。
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [reload]);
  const groups = groupRewardCards(records, cards);
  return <>{groups.map((card, index) => <CardRewards key={card.id} card={card} records={card.records} overrides={overrides} hasData={hasData} demo={demo} today={today} exchange={exchange} refresh={() => setReload(current => current + 1)} showRate={index === 0}/>)}</>;
}

function CardRewards({ card, records, overrides, hasData, demo, today, exchange, refresh, showRate }) {
  const headingId = useId();
  const rewards = useMemo(() => calculateImportedRewards(records, { hkdCnyRate: exchange.value?.rate, overrides }), [records, exchange.value, overrides]);
  const display = units => !hasData || units === null ? '—' : amount(units);
  const stale = exchange.value && new Date(`${today}T00:00:00Z`) - new Date(`${exchange.value.date}T00:00:00Z`) > 7 * 86400000;
  return <section className="rewards-card" aria-labelledby={headingId} data-card-type={card.type}>
    <div className="rewards-heading"><div><h2 id={headingId}><Gift size={18}/>{card.type === 'supplementary' ? '副卡' : '主卡'}返现{card.last4 && <span className="reward-card-number">···· {card.last4}</span>}<span className="estimate-tag">估算</span></h2><p>{rewards.range ? `${formatDateRange(rewards.range)} · PDF 内入账日期` : '导入结单后按 PDF 内日期统计'}{demo ? ' · 虚构示例' : ''}</p></div><div className="rewards-total"><span>本卡导入期间预计返现</span><strong><small>CNY</small>{display(rewards.totalCny)}</strong></div></div>
    <div className="reward-columns">
      <div className="reward-cell base-reward"><div className="reward-name"><h3>基础返现</h3><span>0.4%</span></div><div className="reward-value"><small>CNY</small><strong data-testid="base-cashback">{display(rewards.base.totalCny)}</strong></div><p className="reward-description">人民币与港币净消费，无年度上限</p><div className="base-breakdown"><div><span>人民币消费返现</span><strong>CNY {display(rewards.base.cny)}</strong></div><div><span>港币消费返现（折合）</span><strong>CNY {display(rewards.base.hkdConvertedCny)}</strong></div><p>港币部分按下方参考汇率折合人民币。</p></div></div>
      <div className="reward-cell"><div className="reward-name"><h3>赏世界 5x</h3><span>额外 2%</span></div><div className="reward-value"><small>CNY</small><strong data-testid="world-cashback">{display(rewards.world.cashback)}</strong></div><p className="reward-description">人民币消费 · 每年独立 100,000 元额度</p>{rewards.world.periods.map(pool => <Allowance key={pool.year} title="赏世界5x" pool={pool} scope={`${pool.label}消费额度`}/>)}{rewards.world.clawback > 0n && <p className="refund-clawback">已扣回退款返现 CNY {amount(rewards.world.clawback)}</p>}</div>
      <div className="reward-cell"><div className="reward-name"><h3>PULSE 专属内地奖赏</h3><span>额外 2%</span></div><div className="reward-value"><small>CNY</small><strong data-testid="pulse-cashback">{display(rewards.pulse.cashback)}</strong></div><p className="reward-description">Apple Pay / 银联 QR · 每半年 80,000 元额度</p>{rewards.pulse.periods.map(pool => <Allowance key={pool.start} title="PULSE专属内地奖赏" pool={pool} scope={`${pool.label}消费额度`}/>)}{rewards.pulse.clawback > 0n && <p className="refund-clawback">已扣回退款返现 CNY {amount(rewards.pulse.clawback)}</p>}</div>
    </div>
    {showRate && <div className="reward-rate-row"><div>{exchange.loading ? <><LoaderCircle size={13} className="spin"/><span>正在获取 HKD/CNY 参考汇率</span></> : exchange.value ? <><span>1 HKD = <strong>{exchange.value.rate}</strong> CNY</span><span className="rate-date">{exchange.value.date} 参考汇率{stale ? '（较旧）' : ''}</span><a href={RATE_SOURCE} target="_blank" rel="noreferrer">Frankfurter<ExternalLink size={10}/></a></> : <><AlertCircle size={13}/><span>参考汇率不可用，港币部分暂不折算</span></>}</div><button onClick={refresh} disabled={exchange.loading} aria-label="刷新汇率"><RefreshCw size={13}/><span>刷新汇率</span></button></div>}
    {exchange.error && <p className="rate-error" role="status">{exchange.error}{exchange.value ? `；沿用 ${exchange.value.date} 的参考汇率。` : '。人民币返现和两个额度仍可计算。'}</p>}
    <p className="rewards-scope">累计本卡已导入的全部记录，日期来自 PDF；跨年和跨半年分别封顶后合计，主副卡分别计算，不受下方筛选影响。额度只反映已导入记录，未导入月份无法补算。待确认交易不计返现，也不占用额度。退款扣回同年度返现但不恢复额度；跨年退款需另行核对。还款、费用不计返现。</p>
    {(rewards.pending > 0 || rewards.uncertainRefunds > 0) && <p className="reward-review"><AlertCircle size={13}/><span>{rewards.pending > 0 ? `${rewards.pending} 笔待确认交易暂不计返现，也不占用年度额度。支付方式待确认的记录可在交易详情手动确认。` : ''}{rewards.uncertainRefunds > 0 ? `${rewards.uncertainRefunds} 笔退款暂按普通渠道扣回返现，请在交易详情核对原支付方式。` : ''}</span></p>}
    {rewards.otherCurrency > 0 && <p className="rewards-scope">另有 {rewards.otherCurrency} 笔其他币种交易未纳入本规则。</p>}
    <details className="reward-rules"><summary><CircleHelp size={13}/>返现规则与计算口径</summary><div><p>按您设定的规则估算，非银行确认到账金额。普通人民币消费为基础 0.4%＋赏世界 2%；有 Apple Pay 或银联 QR 标记时再加专属 2%。普通 Tenpay、Alipay、UnionPay 不自动视为银联 QR。每张主卡和副卡独立统计三项返现及额度：赏世界年度消费上限 CNY 100,000；PULSE 每半年消费上限 CNY 80,000，于 1 月 1 日和 7 月 1 日刷新；基础返现无上限。</p><p>统计期间取 PDF 内的入账日期，不受当前年份限制；跨年记录按各年规则计算后合计。额度按退款前的消费累计占用。赏世界额外返现＝年度封顶内消费 × 2%－对应退款 × 2%；PULSE 每年返现＝两个半年各自封顶内消费之和 × 2%－专属渠道退款 × 2%，最低为 0。进度条分别显示已导入记录涉及的年份及半年，退款不会释放任何期间的额度。退款未关联原消费，按可见标记及手动修正的支付方式扣回。若原消费已超额未获额外返现，可在该退款详情选择“仅扣基础返现”。</p><p>港币消费仅计 0.4% 基础返现，再按最新公开日参考汇率折合人民币；它不占用人民币奖赏额度。当前汇率并非银行实际结算汇率。未导入月份、无法识别的交易或支付标记可能影响估算；跨年原消费的退款也需核对。</p></div></details>
  </section>;
}
