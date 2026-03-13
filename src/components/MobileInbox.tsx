import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coffee, Receipt, CreditCard } from 'lucide-react';
import clsx from 'clsx';

export type Expense = {
    id: string;
    merchantName: string;
    amount: number;
    suggestedCategory: string;
    date: string;
};

type MobileInboxProps = {
    expenses: Expense[];
    onProcess: (id: string, action: 'approve' | 'reject') => void;
};

// Icons map for simple categories
const iconMap: Record<string, React.ReactNode> = {
    '通信費': <Receipt className="w-5 h-5 stroke-[1.5]" />,
    '交際費': <Coffee className="w-5 h-5 stroke-[1.5]" />,
    '地代家賃': <CreditCard className="w-5 h-5 stroke-[1.5]" />,
};

export default function MobileInbox({ expenses, onProcess }: MobileInboxProps) {
    // Local state to manage which cards are still in the inbox
    const [inboxItems, setInboxItems] = useState(expenses);
    const swipeConfidenceThreshold = 10000;
    const swipePower = (offset: number, velocity: number) => {
        return Math.abs(offset) * velocity;
    };

    const removeItem = (id: string, action: 'approve' | 'reject') => {
        setInboxItems(prev => prev.filter(item => item.id !== id));
        onProcess(id, action);
    };

    if (inboxItems.length === 0) {
        return (
            <div className="flex flex-col h-full p-8 items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-4">
                    <Receipt className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">未処理ゼロ！</h3>
                <p className="text-slate-400 text-sm">現在の経費はすべて仕訳完了しています。</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0F172A] text-slate-100 p-6 rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.15)] relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 tracking-tight z-20">
                処理待ちのレシート <span className="text-indigo-400">({inboxItems.length})</span>
            </h2>

            <div className="relative flex-1 w-full flex justify-center items-center perspective-1000 z-10">
                <AnimatePresence>
                    {inboxItems.map((ex, index) => {
                        // Only render the top 3 cards for performance and stacking visuals
                        if (index > 2) return null;

                        const isTop = index === 0;

                        return (
                            <motion.div
                                key={ex.id}
                                layout
                                initial={{ scale: 0.8, opacity: 0, y: 50 }}
                                animate={{
                                    scale: 1 - index * 0.05,
                                    y: index * 10,
                                    opacity: 1 - index * 0.2,
                                    zIndex: inboxItems.length - index
                                }}
                                exit={{ x: -1000, opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                                drag={isTop ? 'x' : false}
                                dragConstraints={{ left: 0, right: 0 }}
                                onDragEnd={(e, { offset, velocity }) => {
                                    const swipe = swipePower(offset.x, velocity.x);
                                    if (swipe < -swipeConfidenceThreshold) {
                                        removeItem(ex.id, 'reject');
                                    } else if (swipe > swipeConfidenceThreshold) {
                                        removeItem(ex.id, 'approve');
                                    }
                                }}
                                className={clsx(
                                    "absolute w-full max-w-sm p-8 rounded-[32px] flex flex-col gap-4 shadow-[0_30px_60px_rgba(0,0,0,0.4)] border-none touch-none",
                                    isTop
                                        ? "bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-xl cursor-grab active:cursor-grabbing border border-white/5"
                                        : "bg-slate-800 pointer-events-none"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        {iconMap[ex.suggestedCategory] || <Receipt className="w-5 h-5 stroke-[1.5]" />}
                                        <span className="text-sm font-medium tracking-wide">{ex.suggestedCategory}</span>
                                    </div>
                                    <span className="text-xs text-slate-400 font-mono tracking-wider">{ex.date}</span>
                                </div>

                                <div className="mt-2">
                                    <h3 className="text-3xl font-bold tracking-tight text-white mb-2">{ex.merchantName}</h3>
                                    <p className="text-4xl font-mono mt-2 font-medium bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                                        {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(ex.amount)}
                                    </p>
                                </div>

                                {/* インタラクションガイド */}
                                {isTop && (
                                    <div className="flex justify-between mt-8 text-xs text-slate-400 font-bold tracking-widest uppercase">
                                        <span className="flex items-center gap-1 opacity-70"><span className="text-xl">←</span> 保留</span>
                                        <span className="flex items-center gap-1 text-indigo-400">仕訳 <span className="text-xl">→</span></span>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Background glow in inbox */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
        </div>
    );
}
