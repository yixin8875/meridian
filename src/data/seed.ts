import type {
  AppData,
  CashFlow,
  DailyReview,
  Discipline,
  Grade,
  JournalNote,
  SetupChecklist,
  Side,
  Trade,
} from '../types'
import { parseISO, toISO } from '../lib/format'
import { DATA_VERSION } from '../lib/storage'
import { CONTRACTS, DEFAULT_CONFIG } from './contracts'

const DEMO_ACCOUNT_ID = 'acc_demo'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(20261104)

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

function decimalsOf(tick: number): number {
  return String(tick).split('.')[1]?.length ?? 0
}

function roundTick(v: number, tick: number): number {
  return Number((Math.round(v / tick) * tick).toFixed(decimalsOf(tick)))
}

function hhmm(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function gradeOf(r: number): Grade {
  if (r >= 1.5) return 'A'
  if (r >= -0.4) return 'B'
  return 'C'
}

function sessionOf(minutes: number): string {
  if (minutes < 11 * 60) return '早盘'
  if (minutes < 14 * 60) return '午盘'
  return '尾盘'
}

const STOP_RANGES: Record<string, [number, number]> = {
  ES: [6, 14],
  MES: [6, 14],
  NQ: [18, 38],
  MNQ: [18, 38],
  RTY: [4, 10],
  M2K: [4, 10],
  CL: [0.18, 0.45],
  MCL: [0.18, 0.45],
  GC: [3.5, 8],
  MGC: [3.5, 8],
}

const SYMBOL_POOL = ['ES', 'ES', 'ES', 'ES', 'NQ', 'NQ', 'NQ', 'MNQ', 'MNQ', 'RTY', 'RTY', 'CL', 'CL', 'GC', 'GC']
const SIDE_POOL: Side[] = ['L', 'L', 'L', 'S', 'S', 'S', 'L', 'S']
const SETUP_POOL = [
  '失败拍卖',
  '失败拍卖',
  '消息延续',
  '开盘区间突破',
  '开盘区间突破',
  'VWAP 回踩',
  'VWAP 回踩',
  '流动性扫单',
  '趋势回撤',
  '趋势回撤',
  '区间反转',
  'FOMO 追单',
]

const WIN_NOTES = [
  '等到了回抽确认才进场，止损放在结构外，拿到目标位附近。',
  '开盘半小时不追价，等区间边界被测试后顺势进场。',
  '消息公布后没有第一时间冲进去，第二波回踩给了位置。',
  '只做了一笔，仓位按计划，出场略早但执行完整。',
  'VWAP 回踩承接明显，分批止盈，尾仓带到收盘前。',
]

const LOSS_NOTES = [
  '形态本身成立，但入场偏早，止损被扫后价格才走。执行无问题。',
  '当时有点急，手数比计划多了一档。记下。',
  '逆势接了一次，下一次等结构确认。',
  '区间里来回做了两次，第二次是情绪单。',
  '止损按计划执行，亏损在预算内。今天的市场不属于这个形态。',
]

function buildTrade(params: { index: number; date: string; isWin: boolean }): Trade {
  const { index, date, isWin } = params
  const symbol = pick(SYMBOL_POOL)
  const contract = CONTRACTS[symbol]!
  const side = pick(SIDE_POOL)
  const setup = pick(SETUP_POOL)
  const [stopMin, stopMax] = STOP_RANGES[symbol] ?? [5, 12]
  const stopDistance = roundTick(stopMin + rng() * (stopMax - stopMin), contract.tick)
  const entry = roundTick(
    contract.base *
      (1 + Math.sin(index / 9) * 0.011 + Math.sin(index / 37) * 0.006 + (rng() - 0.5) * 0.004),
    contract.tick,
  )
  const stop = roundTick(side === 'L' ? entry - stopDistance : entry + stopDistance, contract.tick)
  const riskPerContract = Math.abs(entry - stop) * contract.pointValue
  const qty = Math.min(12, Math.max(1, Math.round(1250 / Math.max(riskPerContract, 1))))
  const risk = riskPerContract * qty
  const r = isWin ? 0.5 + Math.pow(rng(), 1.35) * 2.0 : -(0.65 + rng() * 1.0)
  const direction = side === 'L' ? 1 : -1
  const exit = roundTick(entry + direction * r * stopDistance, contract.tick)
  const fees = Number((qty * 2.5).toFixed(2))
  const pnl = Number((r * risk - fees).toFixed(2))
  const entryMinutes = 9 * 60 + 35 + Math.floor(rng() * 350)
  const hold = 6 + Math.floor(rng() * 145)
  const exitMinutes = Math.min(entryMinutes + hold, 15 * 60 + 59)
  const base = isWin ? [0.965, 0.945, 0.95, 0.925] : [0.93, 0.9, 0.915, 0.86]
  const discipline: Discipline = {
    stopPlanned: rng() < base[0]!,
    stopHonored: rng() < base[1]!,
    sizePlanned: rng() < base[2]!,
    journaled: rng() < base[3]!,
  }
  const maeR = Number((0.2 + Math.abs(Math.sin(index * 1.7)) * (isWin ? 0.65 : 0.9)).toFixed(2))
  const mfeR = Number(
    (Math.max(r, 0) + 0.2 + Math.abs(Math.cos(index * 2.3)) * (isWin ? 1.2 : 0.6)).toFixed(2),
  )
  const mistakes: string[] = []
  if (!discipline.stopHonored) mistakes.push('移动止损')
  if (!discipline.sizePlanned) mistakes.push('过度交易')
  if (!isWin && rng() < 0.16) mistakes.push('提前入场')
  if (rng() < 0.09) mistakes.push('追单')
  if (rng() < 0.05) mistakes.push('计划外交易')
  return {
    id: `t${String(index + 1).padStart(4, '0')}`,
    accountId: DEMO_ACCOUNT_ID,
    date,
    entryTime: hhmm(entryMinutes),
    exitTime: hhmm(exitMinutes),
    symbol,
    side,
    qty,
    entry,
    stop,
    target: roundTick(entry + direction * stopDistance * 2.5, contract.tick),
    exit,
    current: 0,
    pnl,
    rMultiple: Number(r.toFixed(2)),
    fees,
    setup,
    session: sessionOf(entryMinutes),
    status: 'closed',
    discipline,
    mistakes,
    maeR,
    mfeR,
    note: pick(isWin ? WIN_NOTES : LOSS_NOTES),
    grade: gradeOf(r),
    charts: [],
  }
}

function curatedTrades(): Trade[] {
  const base: Trade = {
    id: 'curated',
    accountId: DEMO_ACCOUNT_ID,
    date: '2026-11-04',
    entryTime: '10:12',
    exitTime: '11:05',
    symbol: 'ES',
    side: 'L',
    qty: 1,
    entry: 0,
    stop: 0,
    target: 0,
    exit: 0,
    current: 0,
    pnl: 0,
    rMultiple: 0,
    fees: 0,
    setup: '失败拍卖',
    session: '早盘',
    status: 'closed',
    discipline: { stopPlanned: true, stopHonored: true, sizePlanned: true, journaled: true },
    mistakes: [],
    maeR: 0,
    mfeR: 0,
    note: '',
    grade: 'B',
    charts: [],
  }
  return [
    {
      ...base,
      id: 't0191',
      date: '2026-10-30',
      entryTime: '10:42',
      exitTime: '11:18',
      symbol: 'RTY',
      side: 'S',
      qty: 2,
      entry: 2348.6,
      stop: 2355.2,
      target: 2339.5,
      exit: 2342.8,
      pnl: 575,
      rMultiple: 0.88,
      maeR: 0.45,
      mfeR: 1.35,
      fees: 5,
      setup: '趋势回撤',
      note: '小盘趋势向下，反抽前高失败后进场，按计划在整数位前止盈。',
      grade: 'B',
    },
    {
      ...base,
      id: 't0192',
      date: '2026-11-03',
      entryTime: '09:51',
      exitTime: '10:38',
      symbol: 'ES',
      side: 'L',
      qty: 2,
      entry: 5781.5,
      stop: 5769.65,
      target: 5808,
      exit: 5815.39,
      pnl: 3384,
      rMultiple: 2.86,
      maeR: 0.32,
      mfeR: 3.4,
      fees: 5,
      setup: '消息延续',
      note: '消息公布后的第二波回踩，没有追第一根。持有到前高上方，执行 A 级。',
      grade: 'A',
    },
    {
      ...base,
      id: 't0193',
      date: '2026-11-04',
      entryTime: '10:12',
      exitTime: '11:05',
      symbol: 'ES',
      side: 'L',
      qty: 3,
      entry: 5842.25,
      stop: 5858.75,
      target: 5875,
      exit: 5830.86,
      pnl: -1708,
      rMultiple: -0.69,
      maeR: 0.92,
      mfeR: 0.41,
      fees: 7.5,
      setup: '失败拍卖',
      note: '拍卖失败后做多，回抽确认才进场，仍被扫损。执行没有问题，亏损在预算内。',
      grade: 'B',
    },
  ]
}

function openPositions(): Trade[] {
  return [
    {
      id: 'open_1',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-04',
      entryTime: '14:22',
      exitTime: '',
      symbol: 'MNQ',
      side: 'L',
      qty: 8,
      entry: 24118.75,
      stop: 24062.32,
      target: 24420,
      exit: 0,
      current: 24274.5,
      pnl: 2492,
      rMultiple: 2.76,
      maeR: 0.38,
      mfeR: 2.98,
      fees: 20,
      setup: '趋势回撤',
      session: '尾盘',
      status: 'open',
      discipline: { stopPlanned: true, stopHonored: true, sizePlanned: true, journaled: true },
      mistakes: [],
      note: '尾盘趋势回撤承接，留仓过夜，止损放在日内结构下方。',
      grade: 'A',
      charts: [],
    },
    {
      id: 'open_2',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-04',
      entryTime: '13:06',
      exitTime: '',
      symbol: 'CL',
      side: 'S',
      qty: 1,
      entry: 61.42,
      stop: 61.86,
      target: 60.55,
      exit: 0,
      current: 61.58,
      pnl: -160,
      rMultiple: -0.36,
      maeR: 0.52,
      mfeR: 0.28,
      fees: 2.5,
      setup: '区间反转',
      session: '午盘',
      status: 'open',
      discipline: { stopPlanned: true, stopHonored: true, sizePlanned: true, journaled: false },
      mistakes: [],
      note: '区间上沿受阻做空，原油库存数据前减了一半风险，余仓观察。',
      grade: 'B',
      charts: [],
    },
  ]
}

function seedFlows(): CashFlow[] {
  return [
    {
      id: 'cf_demo_1',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-03-02',
      kind: 'deposit',
      amount: 20000,
      note: '追加保证金',
    },
    {
      id: 'cf_demo_2',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-07-01',
      kind: 'withdrawal',
      amount: 12000,
      note: '提取部分利润',
    },
    {
      id: 'cf_demo_3',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-10-01',
      kind: 'dividend',
      amount: 500,
      note: '账户利息',
    },
  ]
}

function seedChecklists(): SetupChecklist[] {
  return [
    {
      id: 'cl_demo_auction',
      setup: '失败拍卖',
      items: [
        { id: 'chk_demo_auction_1', label: '开盘 15 分钟后再评估拍卖失败' },
        { id: 'chk_demo_auction_2', label: '回抽进入前一根 K 线区间' },
        { id: 'chk_demo_auction_3', label: '止损放在拍卖极值外侧' },
        { id: 'chk_demo_auction_4', label: '数据公布前 5 分钟不开新仓' },
      ],
    },
    {
      id: 'cl_demo_trend',
      setup: '趋势回撤',
      items: [
        { id: 'chk_demo_trend_1', label: '等待回撤到 20 EMA 附近' },
        { id: 'chk_demo_trend_2', label: '回撤低点未跌破前一波段低点' },
        { id: 'chk_demo_trend_3', label: '目标至少为风险的 2 倍' },
      ],
    },
  ]
}

function seedReviews(): DailyReview[] {
  return [
    {
      id: 'dr_20261104',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-04',
      marketContext:
        '开盘冲高后回落，午盘在 VWAP 下方震荡；原油库存数据前波动收窄，尾盘趋势单承接。',
      plan: '只做失败拍卖与趋势回撤；单笔风险不超过账户 0.8%，数据前不开新仓。',
      executionScore: 80,
      violations: ['移动止损'],
      improvement: '止损只在结构失效时移动，不因为浮亏扩大而临时放宽。',
      checks: {
        cl_demo_auction: [
          'chk_demo_auction_1',
          'chk_demo_auction_2',
          'chk_demo_auction_3',
        ],
      },
      updatedAt: '2026-11-04T16:10:00Z',
    },
    {
      id: 'dr_20261103',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-03',
      marketContext: '消息公布后指数单边向上，回踩没有跌破前一根 K 线低点。',
      plan: '等第二波回踩，不追第一根；目标放在前高上方。',
      executionScore: 90,
      violations: [],
      improvement: '保持同样的等待节奏，把“错过”当作正常成本。',
      checks: {
        cl_demo_trend: ['chk_demo_trend_1', 'chk_demo_trend_2', 'chk_demo_trend_3'],
      },
      updatedAt: '2026-11-03T16:05:00Z',
    },
  ]
}

function seedNotes(): JournalNote[] {
  return [
    {
      id: 'n1',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-04',
      kind: '盘后',
      title: '今天只做了一件事：等。',
      body:
        '早上那笔 ES 失败拍卖，我等了 27 分钟才拿到回抽确认。进场后价格没有延续，止损被扫。\n\n放在两个月前，我会在第二根阳线就追进去，然后加倍做回来。今天没有。亏损是预算内的，账户回撤 0.4%，收工。\n\n明天的第一件事不是找形态，是把隔夜的两笔风险重新算一遍。',
      tags: ['耐心', '失败拍卖', 'ES'],
      mood: '平静',
    },
    {
      id: 'n2',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-11-02',
      kind: '周总结',
      title: '第 44 周：把仓位降下来之后',
      body:
        '本周净 +$4,120，12 笔，胜率 58%。更重要的是最大单笔亏损第一次低于 $1,800。\n\n仓位降到 1% 之后，入场明显变慢，也开始愿意在错的单子上早一点认错。之前那种“必须把亏的赚回来”的冲动少了很多。\n\n下周仍然只做三类：失败拍卖、VWAP 回踩、开盘区间突破。FOMO 追单直接不计入计划。',
      tags: ['仓位', '执行', '周总结'],
      mood: '专注',
    },
    {
      id: 'n3',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-10-29',
      kind: '盘中',
      title: '消息日的第二次机会',
      body:
        '第一根 K 线没有参与。等回踩到 VWAP 上方，确认承接后才进，2 手 ES，R 2.86。\n\n消息日最容易犯的错是把波动当成方向。今天提醒自己：只交易确认，不交易新闻本身。',
      tags: ['消息延续', 'ES', 'VWAP'],
      mood: '专注',
    },
    {
      id: 'n4',
      accountId: DEMO_ACCOUNT_ID,
      date: '2026-10-26',
      kind: '盘前',
      title: '本周只做 A 级形态',
      body:
        '上周 9 笔交易里有 3 笔是临时起意，合计 -1.8R。这周给自己一条硬规则：\n\n形态不在清单里，就不下单。清单外的一律记为观察，不记为交易。\n\n盘前检查：隔夜持仓风险、重要数据时间、第一小时不追价。',
      tags: ['纪律', '盘前计划'],
      mood: '平静',
    },
  ]
}

export function createSeedData(): AppData {
  const dates: string[] = []
  const cursor = parseISO('2026-01-08')
  const end = parseISO('2026-11-04')
  while (cursor <= end) {
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const targetCount = 191
  const keepRecent = 6
  const removable = shuffle(
    dates.slice(0, Math.max(0, dates.length - keepRecent)).map((_, i) => i),
  )
  const remove = new Set(removable.slice(0, Math.max(0, dates.length - targetCount)))
  const selected = dates.filter((_, i) => !remove.has(i)).slice(0, targetCount)

  const winCount = Math.round(targetCount * 0.576)
  const outcomes = shuffle([
    ...Array.from({ length: winCount }, () => true),
    ...Array.from({ length: targetCount - winCount }, () => false),
  ])

  const generated = selected.map((date, i) =>
    buildTrade({ index: i, date, isWin: outcomes[i] ?? true }),
  )
  generated.sort((a, b) => `${a.date} ${a.entryTime}`.localeCompare(`${b.date} ${b.entryTime}`))
  generated.splice(generated.length - 3, 3, ...curatedTrades())

  return {
    version: DATA_VERSION,
    accounts: [
      {
        id: DEMO_ACCOUNT_ID,
        name: '私人账户 · 示例数据',
        startingEquity: 370000,
        feePerContract: 2.5,
        risk: {
          riskPerTradePct: 0.8,
          dailyLossLimit: 1500,
          maxConsecutiveLosses: 3,
        },
        createdAt: '2026-01-08',
      },
    ],
    activeAccountId: DEMO_ACCOUNT_ID,
    config: {
      contracts: DEFAULT_CONFIG.contracts.map((contract) => ({ ...contract })),
      sessions: [...DEFAULT_CONFIG.sessions],
      setups: [...DEFAULT_CONFIG.setups],
      disciplineItems: DEFAULT_CONFIG.disciplineItems.map((item) => ({ ...item })),
      mistakeTags: [...DEFAULT_CONFIG.mistakeTags],
      checklists: seedChecklists(),
    },
    trades: [...generated, ...openPositions()],
    notes: seedNotes(),
    dailyReviews: seedReviews(),
    cashFlows: seedFlows(),
  }
}
