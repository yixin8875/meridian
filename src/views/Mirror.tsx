import { useMemo } from 'react'
import { ScanSearch } from 'lucide-react'
import { useApp } from '../store'
import {
  buildEquity,
  computeStats,
  disciplineRates,
  drawdownDuration,
  excursionStats,
  groupTrades,
  hourStats,
  mistakeCost,
  rHistogram,
  sideStats,
  streakStats,
  weekStats,
} from '../lib/stats'
import { fmtDateFullCN, fmtDuration, fmtMoney, fmtPct, fmtR, todayISO } from '../lib/format'
import { EmptyState, Pnl } from '../components/primitives'

const MIN_SETUP_SAMPLE = 8

function confidenceOf(count: number): { label: string; tone: string } {
  if (count >= 20) return { label: '高置信', tone: 'text-gain' }
  if (count >= MIN_SETUP_SAMPLE) return { label: '中等置信', tone: 'text-accent' }
  return { label: '样本不足', tone: 'text-warn' }
}

export function Mirror() {
  const { trades, account, config } = useApp()

  const model = useMemo(() => {
    const stats = computeStats(trades, account.startingEquity)
    const setups = groupTrades(trades, (trade) => trade.setup).sort((a, b) => b.avgR - a.avgR)
    const sessions = groupTrades(trades, (trade) => trade.session)
    const week = weekStats(trades)
    const hist = rHistogram(trades)
    const rates = disciplineRates(trades, config.disciplineItems)
    const mistakes = mistakeCost(trades)
    const maxCount = Math.max(1, ...hist.map((bucket) => bucket.count))
    const activeWeek = week.filter((day) => day.count > 0)
    const bestDay = [...activeWeek].sort((a, b) => b.avgR - a.avgR)[0]
    const worstDay = [...activeWeek].sort((a, b) => a.avgR - b.avgR)[0]
    const qualified = setups.filter((setup) => setup.count >= MIN_SETUP_SAMPLE)
    const topByCount = [...setups].sort((a, b) => b.count - a.count)[0]
    const sides = sideStats(trades)
    const hours = hourStats(trades)
    const streaks = streakStats(trades)
    const drawdown = drawdownDuration(buildEquity(trades, account.startingEquity))
    const excursions = excursionStats(trades)
    const sideLeader = sides.every((side) => side.count >= MIN_SETUP_SAMPLE)
      ? [...sides].sort((a, b) => b.avgR - a.avgR)[0]
      : undefined
    const sideSpread = Math.abs(sides[0]!.avgR - sides[1]!.avgR)
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
      bestSetup: qualified[0],
      worstSetup: qualified.length > 1 ? qualified[qualified.length - 1] : undefined,
      topByCount,
      sides,
      hours,
      streaks,
      drawdown,
      excursions,
      sideLeader,
      sideSpread,
    }
  }, [trades, account.startingEquity, config.disciplineItems])

  if (!model.stats.count) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="text-3xl font-medium text-ink">镜像分析</h1>
        <p className="mt-2 text-sm text-muted">
          {account.name} · {fmtDateFullCN(todayISO())}
        </p>
        <div className="mt-6 rounded-xl border border-line bg-paper">
          <EmptyState
            icon={<ScanSearch size={20} strokeWidth={1.5} />}
            title="还没有可分析的已平仓交易"
            description="至少完成一笔交易后，这里会按形态、时段、星期与纪律拆解你的重复行为。"
          />
        </div>
      </div>
    )
  }

  const maxAbsR = Math.max(1, ...model.setups.map((setup) => Math.abs(setup.avgR)))

  return (
    <div className="fade-in mx-auto max-w-6xl px-8 py-8">
      <div>
        <h1 className="text-3xl font-medium text-ink">镜像分析</h1>
        <p className="mt-2 text-sm text-muted">
          {account.name} · {model.stats.count} 笔已平仓 · 用统计照见重复出现的行为
        </p>
      </div>

      <section className="mt-6 grid grid-cols-[1.2fr_1fr_1fr] divide-x divide-line rounded-xl border border-line bg-paper">
        <div className="px-6 py-5">
          <div className="text-xs text-muted">最稳定的形态</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="min-w-0 truncate text-lg font-medium text-ink">
              {model.bestSetup ? model.bestSetup.key : '样本不足'}
            </span>
            {model.bestSetup ? (
              <span className={`shrink-0 text-xs ${confidenceOf(model.bestSetup.count).tone}`}>
                {confidenceOf(model.bestSetup.count).label}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted">
            {model.bestSetup
              ? `${model.bestSetup.count} 笔 · 期望 ${fmtR(model.bestSetup.avgR)}`
              : model.topByCount
                ? `最多 ${model.topByCount.key} ${model.topByCount.count} 笔 · 门槛 ${MIN_SETUP_SAMPLE} 笔`
                : '尚无样本'}
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="text-xs text-muted">最好的交易日</div>
          <div className="mt-2 truncate text-lg font-medium text-ink">
            {model.bestDay ? model.bestDay.key : '—'}
          </div>
          <div className="mt-1 text-xs text-muted">
            {model.bestDay
              ? `${model.bestDay.count} 笔 · 平均 ${fmtR(model.bestDay.avgR)}`
              : '尚无样本'}
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="text-xs text-muted">过程纪律</div>
          <div className="num mt-2 text-lg font-medium text-ink">
            {fmtPct(model.stats.execution, 0)}
          </div>
          <div className="mt-1 text-xs text-muted">
            完全执行 {model.stats.clean} 笔 · 有偏差 {model.stats.flagged} 笔
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">R 倍数分布</h2>
            <p className="mt-1 text-sm text-muted">
              左侧是失控的亏损，右侧是让利润奔跑的交易
            </p>
          </div>
          <div className="text-right text-xs text-faint">
            <div>
              平均盈利 <span className="num text-gain">{fmtR(model.stats.avgWinR)}</span>
            </div>
            <div className="mt-1">
              平均亏损 <span className="num text-loss">{fmtR(model.stats.avgLossR)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex h-48 items-end gap-1.5 border-b border-line pb-px">
          {model.hist.map((bucket) => (
            <div key={bucket.label} className="flex h-full flex-1 flex-col justify-end">
              <div className="mb-1.5 text-center font-mono text-xs text-faint">
                {bucket.count || ''}
              </div>
              <div
                className={`w-full rounded-t-sm ${
                  bucket.positive ? 'bg-gain/70' : 'bg-loss/55'
                }`}
                style={{ height: `${Math.max(2, (bucket.count / model.maxCount) * 100)}%` }}
                title={`${bucket.label}R · ${bucket.count} 笔`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          {model.hist.map((bucket) => (
            <div key={bucket.label} className="flex-1 text-center font-mono text-xs text-faint">
              {bucket.label}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">多空表现</h2>
            <span className="text-xs text-faint">已平仓 · 按方向</span>
          </div>
          <div className="mt-2.5 space-y-1">
            {model.sides.map((side) => (
              <div
                key={side.key}
                className="grid grid-cols-[38px_minmax(0,1fr)_48px_76px] items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-list"
              >
                <span className={`font-medium ${side.key === 'L' ? 'text-gain' : 'text-loss'}`}>
                  {side.label}
                </span>
                <span className="num text-xs text-faint">
                  {side.count ? `${side.count} 笔 · 胜率 ${fmtPct(side.winRate, 0)}` : '无样本'}
                </span>
                <span
                  className={`num text-right ${
                    side.count ? (side.avgR >= 0 ? 'text-gain' : 'text-loss') : 'text-faint'
                  }`}
                >
                  {side.count ? fmtR(side.avgR) : '—'}
                </span>
                <span className="text-right">
                  {side.count ? (
                    <Pnl value={side.netPnl} className="text-xs" />
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-faint">
            {!model.sideLeader
              ? `两个方向都达到 ${MIN_SETUP_SAMPLE} 笔后，方向差异才值得参考。`
              : model.sideSpread < 0.02
                ? `两个方向平均 R 基本持平（相差 ${model.sideSpread.toFixed(2)}R）。`
                : `目前${model.sideLeader.label}更强（${fmtR(model.sideLeader.avgR)}），两个方向都有 ≥ ${MIN_SETUP_SAMPLE} 笔样本。`}
          </p>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">小时段</h2>
            <span className="text-xs text-faint">按入场小时</span>
          </div>
          {model.hours.length ? (
            <div className="mt-2.5 max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
              {model.hours.map((hour) => (
                <div
                  key={hour.key}
                  className="grid grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-list"
                >
                  <span className="num text-xs text-muted">{hour.key}</span>
                  <span className="num text-xs text-faint">
                    {hour.count} 笔 · 胜率 {fmtPct(hour.winRate, 0)}
                  </span>
                  <span
                    className={`num text-right ${hour.avgR >= 0 ? 'text-gain' : 'text-loss'}`}
                  >
                    {fmtR(hour.avgR)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-xs leading-relaxed text-faint">
              入场时间不完整，暂时无法按小时汇总。
            </p>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">连续盈亏与回撤</h2>
            <span className="text-xs text-faint">按平仓顺序</span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-list px-2.5 py-2">
              <div className="text-xs text-faint">最长连胜</div>
              <div className="num mt-0.5 text-base font-medium text-gain">
                {model.streaks.maxWins}
                <span className="ml-0.5 text-xs font-normal text-faint">笔</span>
              </div>
            </div>
            <div className="rounded-lg bg-list px-2.5 py-2">
              <div className="text-xs text-faint">最长连亏</div>
              <div className="num mt-0.5 text-base font-medium text-loss">
                {model.streaks.maxLosses}
                <span className="ml-0.5 text-xs font-normal text-faint">笔</span>
              </div>
            </div>
            <div className="rounded-lg bg-list px-2.5 py-2">
              <div className="text-xs text-faint">当前</div>
              <div className="mt-0.5 text-xs font-medium">
                {model.streaks.currentWins ? (
                  <span className="text-gain">{model.streaks.currentWins} 连胜</span>
                ) : model.streaks.currentLosses ? (
                  <span className="text-loss">{model.streaks.currentLosses} 连亏</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 rounded-lg bg-list px-3 py-2 text-xs leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="text-faint">最长回撤</span>
              <span className="num text-ink-2">
                {model.drawdown.maxDays ? `${model.drawdown.maxDays} 天` : '未形成回撤'}
              </span>
            </div>
            {model.drawdown.maxDays ? (
              <div className="mt-0.5 text-faint">
                {model.drawdown.maxPeak} 高点 → {model.drawdown.maxRecovery ?? model.drawdown.maxTrough}
                {model.drawdown.maxRecovery ? ' 恢复' : ' 仍未恢复'}
              </div>
            ) : null}
            {model.drawdown.currentDays &&
            (model.drawdown.maxRecovery || model.drawdown.currentDays !== model.drawdown.maxDays) ? (
              <div className="mt-0.5 text-warn">
                当前自 {model.drawdown.currentPeak} 起回撤 {model.drawdown.currentDays} 天未创新高
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">偏移与捕获</h2>
            <span className="text-xs text-faint">
              {model.excursions.count ? `${model.excursions.count} 笔已填写` : '未填写'}
            </span>
          </div>
          {model.excursions.count ? (
            <>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-list px-2.5 py-2">
                  <div className="text-xs text-faint">平均 MAE</div>
                  <div className="num mt-0.5 text-base font-medium text-loss">
                    {model.excursions.avgMaeR ? `−${model.excursions.avgMaeR.toFixed(2)}R` : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-list px-2.5 py-2">
                  <div className="text-xs text-faint">平均 MFE</div>
                  <div className="num mt-0.5 text-base font-medium text-gain">
                    {model.excursions.avgMfeR ? `+${model.excursions.avgMfeR.toFixed(2)}R` : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-list px-2.5 py-2">
                  <div className="text-xs text-faint">MFE 捕获率</div>
                  <div
                    className={`num mt-0.5 text-base font-medium ${
                      model.excursions.capture >= 60
                        ? 'text-gain'
                        : model.excursions.capture >= 40
                          ? 'text-accent'
                          : 'text-warn'
                    }`}
                  >
                    {model.excursions.avgMfeR ? `${model.excursions.capture.toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-faint">盈利单平均 MAE</span>
                  <span className="num text-loss">−{model.excursions.winMaeR.toFixed(2)}R</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-faint">亏损单平均 MAE</span>
                  <span className="num text-loss">−{model.excursions.lossMaeR.toFixed(2)}R</span>
                </div>
              </div>
              <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-faint">
                捕获率 = 已实现 R ÷ MFE R。超过 100% 通常说明 MFE 记录偏低。
              </p>
            </>
          ) : (
            <p className="mt-2.5 text-xs leading-relaxed text-faint">
              在交易表单填写“最大不利偏移 / 最大有利偏移”后，这里会比较浮亏承受与利润回吐。
            </p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-ink">错误成本</h2>
            <p className="mt-0.5 text-xs text-faint">
              带错误标签的交易，和没有标记错误的交易相比
            </p>
          </div>
          <span className="num text-xs text-faint">
            {model.mistakes.tagged} 笔有标签 · {model.mistakes.clean} 笔无标签
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-loss/15 bg-loss-soft/45 px-3.5 py-3">
            <div className="text-xs font-medium text-loss">有错误标签</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <Pnl value={model.mistakes.taggedNetPnl} className="text-lg font-medium" />
              <span className="num text-xs text-loss/80">
                平均 {fmtR(model.mistakes.taggedAvgR)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-faint">{model.mistakes.tagged} 笔已平仓</div>
          </div>
          <div className="rounded-lg border border-gain/15 bg-gain-soft/45 px-3.5 py-3">
            <div className="text-xs font-medium text-gain">无错误标签</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <Pnl value={model.mistakes.cleanNetPnl} className="text-lg font-medium" />
              <span className="num text-xs text-gain/80">
                平均 {fmtR(model.mistakes.cleanAvgR)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-faint">{model.mistakes.clean} 笔已平仓</div>
          </div>
        </div>

        {model.mistakes.tags.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_48px_88px_52px] gap-x-3 px-1 text-xs text-faint">
              <span>错误标签</span>
              <span className="text-right">笔数</span>
              <span className="text-right">净盈亏</span>
              <span className="text-right">平均 R</span>
            </div>
            <div className="mt-1 space-y-1">
              {model.mistakes.tags.map((tag) => (
                <div
                  key={tag.key}
                  className="grid grid-cols-[minmax(0,1fr)_48px_88px_52px] items-center gap-x-3 rounded-md px-1 py-1.5 text-xs hover:bg-list"
                >
                  <span className="truncate text-ink-2">{tag.key}</span>
                  <span className="num text-right text-faint">{tag.count}</span>
                  <Pnl value={tag.netPnl} className="text-right text-xs" />
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
          <p className="mt-3 border-t border-line pt-3 text-xs text-faint">
            还没有交易标记错误标签。记录交易时勾选“追单、移动止损”等，就能看到具体错误花了多少钱。
          </p>
        )}
      </section>

      <div className="mt-4 grid grid-cols-[1.3fr_1fr] gap-4">
        <section className="rounded-xl border border-line bg-paper">
          <div className="px-4 pb-2 pt-3.5">
            <h2 className="text-base font-medium text-ink">形态表现</h2>
            <p className="mt-0.5 text-xs text-faint">
              按平均 R 排序；少于 {MIN_SETUP_SAMPLE} 笔不参与最佳形态评选
            </p>
          </div>
          <div className="px-2 pb-2">
            {model.setups.map((setup) => {
              const width = Math.max(2, (Math.abs(setup.avgR) / maxAbsR) * 100)
              return (
                <div key={setup.key} className="rounded-md px-2 py-2 hover:bg-list">
                  <div className="flex items-center justify-between text-xs">
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
                        className={`h-full rounded-sm ${setup.avgR >= 0 ? 'bg-gain/70' : 'bg-loss/55'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span
                      className={`num w-[92px] shrink-0 text-right text-xs ${
                        setup.count < MIN_SETUP_SAMPLE ? 'text-warn' : 'text-faint'
                      }`}
                    >
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
          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="text-base font-medium text-ink">时段</h2>
            <div className="mt-2 space-y-1.5">
              {config.sessions.map((session) => {
                const group = model.sessions.find((item) => item.key === session)
                return (
                  <div key={session} className="flex items-center justify-between text-xs">
                    <span className="text-muted">{session}</span>
                    {group ? (
                      <span className="flex items-center gap-3">
                        <span className="num text-xs text-faint">{group.count} 笔</span>
                        <span
                          className={`num w-[52px] text-right ${
                            group.avgR >= 0 ? 'text-gain' : 'text-loss'
                          }`}
                        >
                          {fmtR(group.avgR)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-faint">无样本</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="text-base font-medium text-ink">星期</h2>
            <div className="mt-2 space-y-1.5">
              {model.week.map((day) => (
                <div key={day.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{day.key}</span>
                  {day.count ? (
                    <span className="flex items-center gap-3">
                      <span className="num text-xs text-faint">{day.count} 笔</span>
                      <span
                        className={`num w-[52px] text-right ${
                          day.avgR >= 0 ? 'text-gain' : 'text-loss'
                        }`}
                      >
                        {fmtR(day.avgR)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-faint">无样本</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1.3fr] gap-4">
        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">纪律通过率</h2>
            <span className="num text-xs text-muted">{fmtPct(model.stats.execution, 0)}</span>
          </div>
          <div className="mt-3 space-y-3">
            {model.rates.map((rate) => (
                <div key={rate.key}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted">{rate.label}</span>
                    <span className="num shrink-0 text-ink-2">
                      {rate.count ? `${rate.pass.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-canvas">
                    <div
                      className={`h-full rounded-sm ${
                        rate.pass >= 85 ? 'bg-gain' : rate.pass >= 65 ? 'bg-accent' : 'bg-warn'
                      }`}
                      style={{ width: `${rate.pass}%` }}
                    />
                  </div>
                </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="text-base font-medium text-ink">从数据里读到的</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
            {model.bestSetup ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  <b className="font-medium text-ink">{model.bestSetup.key}</b>{' '}
                  是当前期望最高的形态，平均 {fmtR(model.bestSetup.avgR)}，共{' '}
                  {model.bestSetup.count} 笔（{confidenceOf(model.bestSetup.count).label}）。
                </span>
              </li>
            ) : null}
            {model.worstSetup && model.worstSetup.avgR < 0 ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  <b className="font-medium text-ink">{model.worstSetup.key}</b> 平均{' '}
                  {fmtR(model.worstSetup.avgR)}，要么减小仓位，要么从清单里拿掉。
                </span>
              </li>
            ) : null}
            {model.bestDay && model.worstDay && model.bestDay.key !== model.worstDay.key ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  {model.bestDay.key} 表现最好（{fmtR(model.bestDay.avgR)}），{model.worstDay.key}{' '}
                  最差（{fmtR(model.worstDay.avgR)}）。
                </span>
              </li>
            ) : null}
            {model.mistakes.tagged ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  带错误标签的交易平均 {fmtR(model.mistakes.taggedAvgR)}，未标记交易平均{' '}
                  {fmtR(model.mistakes.cleanAvgR)}，差距{' '}
                  {fmtR(model.mistakes.cleanAvgR - model.mistakes.taggedAvgR)}。
                </span>
              </li>
            ) : null}
            {model.sideLeader && model.sideSpread >= 0.02 ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  {model.sideLeader.label}平均 {fmtR(model.sideLeader.avgR)}，胜率{' '}
                  {fmtPct(model.sideLeader.winRate, 0)}；两个方向都有足够样本。
                </span>
              </li>
            ) : null}
            {model.excursions.count >= MIN_SETUP_SAMPLE && model.excursions.avgMfeR ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  平均 MFE +{model.excursions.avgMfeR.toFixed(2)}R，实际捕获{' '}
                  {model.excursions.capture.toFixed(0)}%
                  {model.excursions.capture < 50 ? '，利润回吐偏多。' : '。'}
                </span>
              </li>
            ) : null}
            {model.drawdown.maxDays >= 5 ? (
              <li className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
                <span>
                  最长回撤持续 {model.drawdown.maxDays} 天，
                  {model.drawdown.maxRecovery ? '已经恢复。' : '仍未恢复。'}
                </span>
              </li>
            ) : null}
            <li className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-sm bg-line-2" />
              <span>
                平均持仓 {fmtDuration(model.stats.avgHoldMin)}，期望{' '}
                {fmtR(model.stats.expectancyR)}，总计 {model.stats.netPnl >= 0 ? '盈利' : '亏损'}{' '}
                {fmtMoney(Math.abs(model.stats.netPnl), true)}。
              </span>
            </li>
          </ul>
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="flex items-center justify-between text-xs text-faint">
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
