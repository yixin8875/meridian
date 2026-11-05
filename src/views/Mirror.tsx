import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useApp } from '../store'
import { DISCIPLINE_ITEMS } from '../data/contracts'
import {
  computeStats,
  disciplineRates,
  groupTrades,
  mistakeCost,
  rHistogram,
  weekStats,
} from '../lib/stats'
import { fmtDateFullCN, fmtDuration, fmtMoney, fmtPct, fmtR, todayISO } from '../lib/format'
import { EmptyState, Pnl } from '../components/primitives'

export function Mirror() {
  const { trades, account, config } = useApp()

  const model = useMemo(() => {
    const stats = computeStats(trades, account.startingEquity)
    const setups = groupTrades(trades, (trade) => trade.setup)
    const sessions = groupTrades(trades, (trade) => trade.session)
    const week = weekStats(trades)
    const hist = rHistogram(trades)
    const rates = disciplineRates(trades)
    const mistakes = mistakeCost(trades)
    const maxCount = Math.max(1, ...hist.map((bucket) => bucket.count))
    const activeWeek = week.filter((day) => day.count > 0)
    const bestDay = [...activeWeek].sort((a, b) => b.avgR - a.avgR)[0]
    const worstDay = [...activeWeek].sort((a, b) => a.avgR - b.avgR)[0]
    return {
      stats,
      setups,
      sessions,
      week,
      hist,
      maxCount,
      rates,
      mistakes,
      bestDay,
      worstDay,
      bestSetup: setups[0],
      worstSetup: setups.length > 1 ? setups[setups.length - 1] : undefined,
    }
  }, [trades, account.startingEquity])

  if (!model.stats.count) {
    return (
      <div className="mx-auto max-w-[820px] px-8 py-7">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">镜像分析</h1>
        <p className="mt-1 text-[11.5px] text-muted">
          {account.name} · {fmtDateFullCN(todayISO())}
        </p>
        <div className="mt-6 rounded-xl border border-line bg-white">
          <EmptyState
            icon={<Sparkles size={18} />}
            title="还没有可分析的已平仓交易"
            description="至少完成一笔交易后，这里会按形态、时段、星期与纪律拆解你的重复行为。"
          />
        </div>
      </div>
    )
  }

  const maxAbsR = Math.max(1, ...model.setups.map((setup) => Math.abs(setup.avgR)))

  return (
    <div className="fade-in mx-auto max-w-[940px] px-8 py-7">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">镜像分析</h1>
        <p className="mt-1 text-[11.5px] text-muted">
          {account.name} · {model.stats.count} 笔已平仓 · 用统计照见重复出现的行为
        </p>
      </div>

      <section className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-white">
        <div className="px-4 py-3.5">
          <div className="text-[10.5px] text-faint">最稳定的形态</div>
          <div className="mt-1 truncate text-[14px] font-medium text-ink">
            {model.bestSetup ? model.bestSetup.key : '—'}
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted">
            {model.bestSetup
              ? `${model.bestSetup.count} 笔 · 期望 ${fmtR(model.bestSetup.avgR)}`
              : '尚无样本'}
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-[10.5px] text-faint">最好的交易日</div>
          <div className="mt-1 truncate text-[14px] font-medium text-ink">
            {model.bestDay ? model.bestDay.key : '—'}
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted">
            {model.bestDay
              ? `${model.bestDay.count} 笔 · 平均 ${fmtR(model.bestDay.avgR)}`
              : '尚无样本'}
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-[10.5px] text-faint">过程纪律</div>
          <div className="num mt-1 text-[14px] font-medium text-ink">
            {fmtPct(model.stats.execution, 0)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted">
            完全执行 {model.stats.clean} 笔 · 有偏差 {model.stats.flagged} 笔
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">R 倍数分布</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              左侧是失控的亏损，右侧是让利润奔跑的交易
            </p>
          </div>
          <div className="text-right text-[10.5px] text-faint">
            <div>
              平均盈利 <span className="num text-gain">{fmtR(model.stats.avgWinR)}</span>
            </div>
            <div>
              平均亏损 <span className="num text-loss">{fmtR(model.stats.avgLossR)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex h-[150px] items-end gap-2">
          {model.hist.map((bucket) => (
            <div key={bucket.label} className="flex h-full flex-1 flex-col justify-end">
              <div className="mb-1 text-center text-[10px] text-faint">{bucket.count || ''}</div>
              <div
                className={`w-full rounded-t-md ${
                  bucket.positive ? 'bg-accent/75' : 'bg-loss/60'
                }`}
                style={{ height: `${Math.max(2, (bucket.count / model.maxCount) * 100)}%` }}
                title={`${bucket.label}R · ${bucket.count} 笔`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          {model.hist.map((bucket) => (
            <div key={bucket.label} className="flex-1 text-center text-[9.5px] text-faint">
              {bucket.label}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">错误成本</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              带错误标签的交易，和没有标记错误的交易相比
            </p>
          </div>
          <span className="num text-[10.5px] text-faint">
            {model.mistakes.tagged} 笔有标签 · {model.mistakes.clean} 笔无标签
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-loss/15 bg-loss-soft/45 px-3.5 py-3">
            <div className="text-[10px] font-medium text-loss">有错误标签</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <Pnl value={model.mistakes.taggedNetPnl} className="text-[17px] font-semibold" />
              <span className="num text-[10.5px] text-loss/80">
                平均 {fmtR(model.mistakes.taggedAvgR)}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-faint">{model.mistakes.tagged} 笔已平仓</div>
          </div>
          <div className="rounded-lg border border-gain/15 bg-gain-soft/45 px-3.5 py-3">
            <div className="text-[10px] font-medium text-gain">无错误标签</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <Pnl value={model.mistakes.cleanNetPnl} className="text-[17px] font-semibold" />
              <span className="num text-[10.5px] text-gain/80">
                平均 {fmtR(model.mistakes.cleanAvgR)}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-faint">{model.mistakes.clean} 笔已平仓</div>
          </div>
        </div>

        {model.mistakes.tags.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_48px_88px_52px] gap-x-3 px-1 text-[9.5px] text-faint">
              <span>错误标签</span>
              <span className="text-right">笔数</span>
              <span className="text-right">净盈亏</span>
              <span className="text-right">平均 R</span>
            </div>
            <div className="mt-1 space-y-1">
              {model.mistakes.tags.map((tag) => (
                <div
                  key={tag.key}
                  className="grid grid-cols-[minmax(0,1fr)_48px_88px_52px] items-center gap-x-3 rounded-md px-1 py-1.5 text-[11px] hover:bg-list"
                >
                  <span className="truncate text-ink-2">{tag.key}</span>
                  <span className="num text-right text-faint">{tag.count}</span>
                  <Pnl value={tag.netPnl} className="text-right text-[11px]" />
                  <span
                    className={`num text-right ${tag.avgR >= 0 ? 'text-gain' : 'text-loss'}`}
                  >
                    {fmtR(tag.avgR)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-[10.5px] text-faint">
            还没有交易标记错误标签。记录交易时勾选“追单、移动止损”等，就能看到具体错误花了多少钱。
          </p>
        )}
      </section>

      <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-3">
        <section className="rounded-xl border border-line bg-white">
          <div className="px-4 pb-2 pt-3.5">
            <h2 className="text-[12.5px] font-semibold text-ink">形态表现</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">按累计 R 排序，样本少时仅供参考</p>
          </div>
          <div className="px-2 pb-2">
            {model.setups.map((setup) => {
              const width = Math.max(2, (Math.abs(setup.avgR) / maxAbsR) * 100)
              return (
                <div key={setup.key} className="rounded-md px-2 py-2 hover:bg-list">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="truncate font-medium text-ink">{setup.key}</span>
                    <span
                      className={`num shrink-0 ${setup.avgR >= 0 ? 'text-gain' : 'text-loss'}`}
                    >
                      {fmtR(setup.avgR)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={`h-full rounded-full ${setup.avgR >= 0 ? 'bg-accent' : 'bg-loss/70'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="num w-[92px] shrink-0 text-right text-[10px] text-faint">
                      {setup.count} 笔 · {fmtPct(setup.winRate, 0)}
                    </span>
                  </div>
                </div>
              )
            })}
            {!model.setups.length ? (
              <EmptyState title="没有形态样本" description="记录交易时选择形态后自动汇总。" />
            ) : null}
          </div>
        </section>

        <div className="space-y-3">
          <section className="rounded-xl border border-line bg-white px-4 py-3.5">
            <h2 className="text-[12.5px] font-semibold text-ink">时段</h2>
            <div className="mt-2 space-y-1.5">
              {config.sessions.map((session) => {
                const group = model.sessions.find((item) => item.key === session)
                return (
                  <div key={session} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{session}</span>
                    {group ? (
                      <span className="flex items-center gap-3">
                        <span className="num text-[10px] text-faint">{group.count} 笔</span>
                        <span
                          className={`num w-[52px] text-right ${
                            group.avgR >= 0 ? 'text-gain' : 'text-loss'
                          }`}
                        >
                          {fmtR(group.avgR)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-faint">无样本</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white px-4 py-3.5">
            <h2 className="text-[12.5px] font-semibold text-ink">星期</h2>
            <div className="mt-2 space-y-1.5">
              {model.week.map((day) => (
                <div key={day.key} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">{day.key}</span>
                  {day.count ? (
                    <span className="flex items-center gap-3">
                      <span className="num text-[10px] text-faint">{day.count} 笔</span>
                      <span
                        className={`num w-[52px] text-right ${
                          day.avgR >= 0 ? 'text-gain' : 'text-loss'
                        }`}
                      >
                        {fmtR(day.avgR)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-faint">无样本</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1.3fr] gap-3">
        <section className="rounded-xl border border-line bg-white px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[12.5px] font-semibold text-ink">纪律通过率</h2>
            <span className="num text-[11px] text-muted">{fmtPct(model.stats.execution, 0)}</span>
          </div>
          <div className="mt-3 space-y-3">
            {model.rates.map((rate) => {
              const item = DISCIPLINE_ITEMS.find((entry) => entry.key === rate.key)
              return (
                <div key={rate.key}>
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-muted">{item?.label ?? rate.key}</span>
                    <span className="num text-ink-2">{rate.pass.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={`h-full rounded-full ${
                        rate.pass >= 85 ? 'bg-gain' : rate.pass >= 65 ? 'bg-accent' : 'bg-warn'
                      }`}
                      style={{ width: `${rate.pass}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white px-4 py-3.5">
          <h2 className="text-[12.5px] font-semibold text-ink">从数据里读到的</h2>
          <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-ink-2">
            {model.bestSetup ? (
              <li className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gain" />
                <span>
                  <b className="font-medium text-ink">{model.bestSetup.key}</b>{' '}
                  是当前期望最高的形态，平均 {fmtR(model.bestSetup.avgR)}，共{' '}
                  {model.bestSetup.count} 笔。
                </span>
              </li>
            ) : null}
            {model.worstSetup && model.worstSetup.avgR < 0 ? (
              <li className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-loss" />
                <span>
                  <b className="font-medium text-ink">{model.worstSetup.key}</b> 平均{' '}
                  {fmtR(model.worstSetup.avgR)}，要么减小仓位，要么从清单里拿掉。
                </span>
              </li>
            ) : null}
            {model.bestDay && model.worstDay && model.bestDay.key !== model.worstDay.key ? (
              <li className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  {model.bestDay.key} 表现最好（{fmtR(model.bestDay.avgR)}），{model.worstDay.key}{' '}
                  最差（{fmtR(model.worstDay.avgR)}）。
                </span>
              </li>
            ) : null}
            {model.mistakes.tagged ? (
              <li className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-loss" />
                <span>
                  带错误标签的交易平均 {fmtR(model.mistakes.taggedAvgR)}，未标记交易平均{' '}
                  {fmtR(model.mistakes.cleanAvgR)}，差距{' '}
                  {fmtR(model.mistakes.cleanAvgR - model.mistakes.taggedAvgR)}。
                </span>
              </li>
            ) : null}
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span>
                平均持仓 {fmtDuration(model.stats.avgHoldMin)}，期望{' '}
                {fmtR(model.stats.expectancyR)}，总计 {model.stats.netPnl >= 0 ? '盈利' : '亏损'} $
                {fmtMoney(Math.abs(model.stats.netPnl), false)}。
              </span>
            </li>
          </ul>
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="flex items-center justify-between text-[10.5px] text-faint">
              <span>累计净盈亏</span>
              <span className="flex items-center gap-2">
                <Pnl value={model.stats.netPnl} />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
