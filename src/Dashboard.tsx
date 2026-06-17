import { useMemo, useState } from 'react';
import {
  Phone,
  Target,
  CalendarDays,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  PhoneOutgoing,
  Handshake,
  CalendarCheck,
  Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';

/* =========================================================================
 *  データ定義
 *  ─ 種別ごと(3種)の生データを保持し、集計はすべてここから動的に算出する。
 *    プルダウンで「全体 / 種別」を切り替えると、KPI・課題・メンバー別が
 *    すべて再集計される。
 * ========================================================================= */

const CALL_TYPES = ['新規開拓', '掘り起こし', '反響対応'] as const;
type CallType = (typeof CALL_TYPES)[number];
type Filter = 'all' | CallType;

interface TypeStat {
  calls: number; // 架電件数
  contacts: number; // 担当接触数
  appts: number; // アポ数
}

interface Member {
  name: string;
  target: {
    workdays: number; // 稼働数
    calls: number; // 月間 架電目標
    apptRate: number; // 目標アポ率 (小数: 0.01 = 1%)
  };
  stats: Record<CallType, TypeStat>;
}

const PERIOD_LABEL = '6/1 〜 6/4';
const MONTH_LABEL = '6月';

// 集計元データ（種別ごとの合計は月間サマリーの実数と一致）
const MEMBERS: Member[] = [
  {
    name: '賢也',
    target: { workdays: 80, calls: 1360, apptRate: 0.01 },
    stats: {
      新規開拓: { calls: 14, contacts: 3, appts: 0 },
      掘り起こし: { calls: 8, contacts: 2, appts: 0 },
      反響対応: { calls: 4, contacts: 1, appts: 0 },
    },
  },
  {
    name: '塩崎',
    target: { workdays: 40, calls: 680, apptRate: 0.007 },
    stats: {
      新規開拓: { calls: 28, contacts: 9, appts: 0 },
      掘り起こし: { calls: 15, contacts: 6, appts: 0 },
      反響対応: { calls: 7, contacts: 3, appts: 0 },
    },
  },
  {
    name: '義家',
    target: { workdays: 40, calls: 680, apptRate: 0.007 },
    stats: {
      新規開拓: { calls: 20, contacts: 4, appts: 0 },
      掘り起こし: { calls: 12, contacts: 3, appts: 0 },
      反響対応: { calls: 8, contacts: 2, appts: 1 },
    },
  },
  {
    name: 'よしき',
    target: { workdays: 40, calls: 680, apptRate: 0.007 },
    stats: {
      新規開拓: { calls: 16, contacts: 2, appts: 0 },
      掘り起こし: { calls: 9, contacts: 1, appts: 0 },
      反響対応: { calls: 4, contacts: 1, appts: 0 },
    },
  },
];

// 担当接触率の社内ベンチマーク（これを下回ると「低接触」として注意喚起）
const CONTACT_RATE_BENCH = 0.2;

/* =========================================================================
 *  集計ロジック
 * ========================================================================= */

interface DerivedMetrics {
  name: string;
  target: Member['target'];
  calls: number;
  contacts: number;
  appts: number;
  contactRate: number; // 担当接触率 = 接触 / 架電
  apptRate: number; // アポ率 = アポ / 架電
  apptFromContact: number; // 担当接触からのアポ率 = アポ / 接触
  callProgress: number; // 月間架電目標に対する進捗
  status: 'good' | 'warning' | 'danger';
  naReasons: string[]; // 未達(NA)の理由
}

function aggregate(member: Member, filter: Filter): TypeStat {
  if (filter !== 'all') return member.stats[filter];
  return CALL_TYPES.reduce<TypeStat>(
    (acc, t) => ({
      calls: acc.calls + member.stats[t].calls,
      contacts: acc.contacts + member.stats[t].contacts,
      appts: acc.appts + member.stats[t].appts,
    }),
    { calls: 0, contacts: 0, appts: 0 },
  );
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function deriveMember(member: Member, filter: Filter): DerivedMetrics {
  const { calls, contacts, appts } = aggregate(member, filter);
  const contactRate = safeDiv(contacts, calls);
  const apptRate = safeDiv(appts, calls);
  const naReasons: string[] = [];

  if (appts === 0) naReasons.push('アポ獲得ゼロ');
  else if (apptRate < member.target.apptRate) naReasons.push('アポ率が目標未満');
  if (calls > 0 && contactRate < CONTACT_RATE_BENCH) naReasons.push('担当接触率が低い');

  let status: DerivedMetrics['status'];
  if (appts > 0 && apptRate >= member.target.apptRate && contactRate >= CONTACT_RATE_BENCH) {
    status = 'good';
  } else if (appts > 0) {
    status = 'warning';
  } else {
    status = 'danger';
  }

  return {
    name: member.name,
    target: member.target,
    calls,
    contacts,
    appts,
    contactRate,
    apptRate,
    apptFromContact: safeDiv(appts, contacts),
    callProgress: safeDiv(calls, member.target.calls),
    status,
    naReasons,
  };
}

/* =========================================================================
 *  表示ヘルパー
 * ========================================================================= */

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

const STATUS_META: Record<
  DerivedMetrics['status'],
  { label: string; chip: string; dot: string; ring: string }
> = {
  good: {
    label: '達成',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200',
  },
  warning: {
    label: '要注意',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    ring: 'ring-amber-200',
  },
  danger: {
    label: '未達',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    ring: 'ring-rose-200',
  },
};

/* =========================================================================
 *  小コンポーネント
 * ========================================================================= */

function ProgressBar({
  value,
  tone,
}: {
  value: number; // 0..1（1超は100%でクリップ）
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[tone];
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${toneClass} transition-all duration-700`}
        style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  progress,
  tone,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  progress?: { value: number; tone: 'indigo' | 'emerald' | 'amber' | 'rose' };
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
  delta?: { ok: boolean; text: string };
}) {
  const iconBg = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconBg}`}>{icon}</div>
        {delta && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              delta.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            {delta.text}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {progress && (
        <div className="mt-3">
          <ProgressBar value={progress.value} tone={progress.tone} />
        </div>
      )}
    </motion.div>
  );
}

/* =========================================================================
 *  ダッシュボード本体
 * ========================================================================= */

export default function Dashboard() {
  const [filter, setFilter] = useState<Filter>('all');

  const members = useMemo(() => MEMBERS.map((m) => deriveMember(m, filter)), [filter]);

  // チーム合計
  const team = useMemo(() => {
    const calls = members.reduce((s, m) => s + m.calls, 0);
    const contacts = members.reduce((s, m) => s + m.contacts, 0);
    const appts = members.reduce((s, m) => s + m.appts, 0);
    const targetCalls = MEMBERS.reduce((s, m) => s + m.target.calls, 0);
    // 目標アポ率（架電目標で加重平均）
    const weightedApptTarget =
      MEMBERS.reduce((s, m) => s + m.target.calls * m.target.apptRate, 0) / targetCalls;
    const achievedApptTarget = members.filter(
      (m) => m.appts > 0 && m.apptRate >= m.target.apptRate,
    ).length;
    return {
      calls,
      contacts,
      appts,
      targetCalls,
      callProgress: safeDiv(calls, targetCalls),
      contactRate: safeDiv(contacts, calls),
      apptRate: safeDiv(appts, calls),
      apptTarget: weightedApptTarget,
      achievedApptTarget,
    };
  }, [members]);

  // 課題（NA）の自動抽出
  const alerts = useMemo(() => {
    const list: { level: 'danger' | 'warning'; icon: React.ReactNode; text: string }[] = [];

    const zero = members.filter((m) => m.appts === 0);
    if (zero.length > 0) {
      list.push({
        level: 'danger',
        icon: <CalendarCheck className="h-4 w-4" />,
        text: `アポ獲得ゼロ：${zero.map((m) => m.name).join('・')}（${zero.length}名）`,
      });
    }

    const lowContact = members.filter((m) => m.calls > 0 && m.contactRate < CONTACT_RATE_BENCH);
    if (lowContact.length > 0) {
      list.push({
        level: 'warning',
        icon: <Handshake className="h-4 w-4" />,
        text: `担当接触率が${pct(CONTACT_RATE_BENCH, 0)}未満：${lowContact
          .map((m) => `${m.name}(${pct(m.contactRate)})`)
          .join('・')}`,
      });
    }

    if (team.apptRate < team.apptTarget) {
      list.push({
        level: 'warning',
        icon: <Target className="h-4 w-4" />,
        text: `チーム平均アポ率が目標未達：実績 ${pct(team.apptRate, 2)} / 目標 ${pct(
          team.apptTarget,
          2,
        )}`,
      });
    }

    if (team.callProgress < 0.15) {
      list.push({
        level: 'warning',
        icon: <PhoneOutgoing className="h-4 w-4" />,
        text: `架電数が${MONTH_LABEL}目標に対し ${pct(team.callProgress)} と低水準（残 ${(
          team.targetCalls - team.calls
        ).toLocaleString()}件）`,
      });
    }

    return list;
  }, [members, team]);

  const goodMembers = members.filter((m) => m.status === 'good');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ===== ヘッダー ===== */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">
              Call KPI Dashboard
            </span>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              架電KPIダッシュボード
            </h1>
            <p className="mt-1 flex items-center gap-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                期間 {PERIOD_LABEL}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {MEMBERS.length}名
              </span>
            </p>
          </div>

          {/* 種別プルダウン */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500">種別フィルタ</label>
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-sm font-bold text-slate-800 shadow-sm transition hover:border-indigo-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:w-56"
              >
                <option value="all">全体（3種合計）</option>
                {CALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </header>

        {/* ===== KPIカード ===== */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            tone="indigo"
            icon={<Phone className="h-5 w-5" />}
            label="総架電数"
            value={team.calls.toLocaleString()}
            sub={`${MONTH_LABEL}目標 ${team.targetCalls.toLocaleString()} 件・進捗 ${pct(
              team.callProgress,
            )}`}
            progress={{ value: team.callProgress, tone: 'indigo' }}
          />
          <KpiCard
            tone="emerald"
            icon={<Handshake className="h-5 w-5" />}
            label="担当接触率"
            value={pct(team.contactRate)}
            sub={`担当接触数 ${team.contacts} 件 / 架電 ${team.calls} 件`}
            progress={{
              value: team.contactRate,
              tone: team.contactRate >= CONTACT_RATE_BENCH ? 'emerald' : 'amber',
            }}
            delta={{
              ok: team.contactRate >= CONTACT_RATE_BENCH,
              text: `基準 ${pct(CONTACT_RATE_BENCH, 0)}`,
            }}
          />
          <KpiCard
            tone="amber"
            icon={<CalendarCheck className="h-5 w-5" />}
            label="総アポ数"
            value={team.appts.toLocaleString()}
            sub={`目標アポ率クリア ${team.achievedApptTarget}/${MEMBERS.length}名`}
          />
          <KpiCard
            tone={team.apptRate >= team.apptTarget ? 'emerald' : 'rose'}
            icon={<TrendingUp className="h-5 w-5" />}
            label="平均アポ率"
            value={pct(team.apptRate, 2)}
            sub={`目標 ${pct(team.apptTarget, 2)}`}
            progress={{
              value: safeDiv(team.apptRate, team.apptTarget),
              tone: team.apptRate >= team.apptTarget ? 'emerald' : 'rose',
            }}
            delta={{
              ok: team.apptRate >= team.apptTarget,
              text: team.apptRate >= team.apptTarget ? '目標達成' : '目標未達',
            }}
          />
        </section>

        {/* ===== 課題(NA) アラート ===== */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <h2 className="text-base font-bold">要対応の課題（NA）</h2>
              <span className="ml-auto rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600">
                {alerts.length} 件
              </span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {alerts.length === 0 && (
                <li className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  この種別では未達の課題はありません。
                </li>
              )}
              {alerts.map((a, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
                    a.level === 'danger'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <span className="mt-0.5">{a.icon}</span>
                  <span className="font-medium leading-relaxed">{a.text}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          {/* グッドニュース / ハイライト */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-emerald-500" />
              <h2 className="text-base font-bold">達成・好調</h2>
            </div>
            {goodMembers.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {goodMembers.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm"
                  >
                    <span className="font-bold text-emerald-800">{m.name}</span>
                    <span className="font-mono text-emerald-700">
                      アポ率 {pct(m.apptRate, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                目標を達成しているメンバーはまだいません。
              </p>
            )}
          </div>
        </section>

        {/* ===== メンバー別 ===== */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">メンバー別パフォーマンス</h2>
            <span className="text-xs text-slate-400">
              {filter === 'all' ? '全体（3種合計）' : `種別：${filter}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {members.map((m, i) => {
              const meta = STATUS_META[m.status];
              return (
                <motion.div
                  key={m.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-transparent ${
                    m.status === 'danger' ? 'border-rose-200' : 'border-slate-200'
                  }`}
                >
                  {/* 上段：名前 + ステータス */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      <span className="text-lg font-black">{m.name}</span>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {/* 架電数 + 月間目標進捗 */}
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium text-slate-500">架電数</span>
                      <span className="text-xs text-slate-400">
                        {MONTH_LABEL}目標 {m.target.calls.toLocaleString()} 件
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black tabular-nums">{m.calls}</span>
                      <span className="text-xs font-bold text-slate-400">
                        進捗 {pct(m.callProgress)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={m.callProgress}
                        tone={m.callProgress >= 0.15 ? 'indigo' : 'amber'}
                      />
                    </div>
                  </div>

                  {/* 指標グリッド */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Metric
                      label="担当接触"
                      value={`${m.contacts}`}
                      sub={pct(m.contactRate)}
                      ng={m.calls > 0 && m.contactRate < CONTACT_RATE_BENCH}
                    />
                    <Metric label="アポ数" value={`${m.appts}`} sub="件" ng={m.appts === 0} />
                    <Metric
                      label="アポ率"
                      value={pct(m.apptRate, 2)}
                      sub={`目標 ${pct(m.target.apptRate, 1)}`}
                      ng={m.apptRate < m.target.apptRate}
                    />
                  </div>

                  {/* NA理由 */}
                  {m.naReasons.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.naReasons.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ===== 種別別サマリー（常時表示） ===== */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold">種別別サマリー（全体）</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CALL_TYPES.map((t, i) => {
              const calls = MEMBERS.reduce((s, m) => s + m.stats[t].calls, 0);
              const contacts = MEMBERS.reduce((s, m) => s + m.stats[t].contacts, 0);
              const appts = MEMBERS.reduce((s, m) => s + m.stats[t].appts, 0);
              const totalCalls = MEMBERS.reduce(
                (s, m) => s + CALL_TYPES.reduce((ss, tt) => ss + m.stats[tt].calls, 0),
                0,
              );
              return (
                <motion.button
                  key={t}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => setFilter(t)}
                  className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow ${
                    filter === t ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{t}</span>
                    <span className="text-xs text-slate-400">
                      構成比 {pct(safeDiv(calls, totalCalls), 0)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-400">架電</p>
                      <p className="text-lg font-black tabular-nums">{calls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">接触</p>
                      <p className="text-lg font-black tabular-nums">{contacts}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">アポ</p>
                      <p
                        className={`text-lg font-black tabular-nums ${
                          appts === 0 ? 'text-rose-500' : 'text-emerald-600'
                        }`}
                      >
                        {appts}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={safeDiv(contacts, calls)} tone="emerald" />
                    <p className="mt-1 text-xs text-slate-400">
                      担当接触率 {pct(safeDiv(contacts, calls))}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-slate-400">
          集計元：{MONTH_LABEL}架電実績 ／ 期間 {PERIOD_LABEL} ・ カードをクリックで種別フィルタ
        </footer>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  ng,
}: {
  label: string;
  value: string;
  sub: string;
  ng: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 ${
        ng ? 'border-rose-200 bg-rose-50/60' : 'border-slate-100 bg-slate-50'
      }`}
    >
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`text-base font-black tabular-nums ${ng ? 'text-rose-600' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
