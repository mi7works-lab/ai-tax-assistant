import { useState, useEffect } from 'react';
import { Bell, Flame, TrendingUp, Settings2, Moon, Sun } from 'lucide-react';
import MobileInbox from './components/MobileInbox';
import clsx from 'clsx';
import { motion, useAnimation } from 'framer-motion';

// Mock data
const mockExpenses = [
  {
    id: '1',
    merchantName: 'AWS Cloud Services',
    amount: 14500,
    suggestedCategory: '通信費',
    date: '2026-03-12',
  },
  {
    id: '2',
    merchantName: 'Starbucks Roastery',
    amount: 1200,
    suggestedCategory: '交際費',
    date: '2026-03-10',
  },
  {
    id: '3',
    merchantName: 'WeWork Office',
    amount: 85000,
    suggestedCategory: '地代家賃',
    date: '2026-03-01',
  },
];

export default function App() {
  const [taxAmount, setTaxAmount] = useState(482000);
  const [profit, setProfit] = useState(2450000);
  const [isDark, setIsDark] = useState(false);
  const controls = useAnimation();

  // Handle Dark mode toggle
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Simulate counter animation
  useEffect(() => {
    controls.start({
      scale: [1, 1.05, 1],
      transition: { duration: 0.3 }
    });
  }, [taxAmount, profit, controls]);

  const handleExpenseProcessed = (expenseId: string, action: 'approve' | 'reject') => {
    const expense = mockExpenses.find(e => e.id === expenseId);
    if (expense && action === 'approve') {
      const savings = Math.floor(expense.amount * 0.2);
      setTaxAmount(prev => prev - savings);
      setProfit(prev => prev - expense.amount);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex justify-center font-sans antialiased text-slate-800 dark:text-slate-100 overflow-hidden transition-colors duration-500">

      {/* Mobile Frame Container (Max width for web) */}
      <div className="w-full max-w-md h-screen relative flex flex-col shadow-2xl bg-slate-50 dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 transition-colors duration-500">

        {/* Header */}
        <header className="px-6 pt-12 pb-4 flex justify-between items-center z-10 transition-colors duration-500">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-400 tracking-wide uppercase">Command Center</span>
            <h1 className="text-2xl font-bold tracking-tight">Ultra-Sync AI</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md shadow-sm border border-slate-200/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 transition-colors duration-500"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button className="p-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md shadow-sm border border-slate-200/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 transition-colors duration-500">
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 1. Top - リアルタイムメーター (Glassmorphism) */}
        <section className="px-6 mb-6 z-10 transition-colors duration-500">
          <div className="bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl rounded-[28px] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-slate-100 dark:border-slate-700/50 relative overflow-hidden transition-colors duration-500">
            {/* Ambient Background Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none transition-colors duration-500" />

            <div className="flex flex-col gap-6 relative z-10">
              <div>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> 今期の純利益予測
                </span>
                <motion.div animate={controls} className="text-4xl font-mono font-medium tracking-tight mt-1">
                  ¥{profit.toLocaleString()}
                </motion.div>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent transition-colors duration-500" />

              <div>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 transition-colors duration-500">
                  <Flame className="w-4 h-4 text-rose-500" /> 来年払う税金（概算）
                </span>
                <motion.div animate={controls} className="text-4xl font-mono font-medium tracking-tight mt-1 text-slate-900 dark:text-white transition-colors duration-500">
                  ¥{taxAmount.toLocaleString()}
                </motion.div>

                {/* Visual Meter bar */}
                <div className="mt-4 h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden transition-colors duration-500">
                  <motion.div
                    layout
                    className="h-full bg-gradient-to-r from-rose-400 to-indigo-500 rounded-full"
                    style={{ width: `${Math.min(100, (taxAmount / 1000000) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Middle - AIフィード (Dynamic Notification) */}
        <section className="px-6 mb-4 z-10 transition-colors duration-500">
          <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-[20px] p-4 flex gap-4 items-start shadow-sm transition-colors duration-500">
            <div className="bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm">
              <Bell className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1 transition-colors duration-500">AIからの提案</h3>
              <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 leading-relaxed transition-colors duration-500">
                通信費の家事按分比率を設定すると、さらに税金が約<strong className="font-mono">¥3,500</strong>安くなりますよ。設定画面へ進みますか？
              </p>
            </div>
          </div>
        </section>

        {/* 3. Bottom - 未処理カンバンInbox */}
        <div className="flex-1 w-full bg-slate-900 dark:bg-[#0F172A] rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.15)] relative transition-colors duration-500">
          <MobileInbox expenses={mockExpenses} onProcess={handleExpenseProcessed} />
        </div>
      </div>
    </div>
  );
}
