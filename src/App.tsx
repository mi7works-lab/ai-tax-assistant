import { useState, useEffect, useRef } from 'react';
import { Bell, Flame, TrendingUp, Settings2, Moon, Sun, Send, User, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: '確定申告AIアシスタントです。経費の仕分けや、申請書類の作り方について何でも聞いてください！' }
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ダークモード制御
  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  // メッセージ送信
  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // AIの返信待ち（シミュレーション）
    // 本来はここにAPI接続を書きますが、まずは「動く」ことを優先して自動応答を設定
    setTimeout(() => {
      let reply = "承知しました。その内容は経費として認められる可能性が高いです。e-Taxの「経費」項目に入力しましょう。";
      if (input.includes("医療費")) reply = "医療費控除ですね。年間10万円を超えた分が対象になります。領収書を準備しましょう！";
      if (input.includes("やり方")) reply = "マイナンバーカードはお持ちですか？スマホのe-Taxアプリを使うのが一番簡単ですよ。";
      
      setMessages(prev => [...prev, { role: 'bot', text: reply }]);
    }, 800);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex justify-center transition-colors duration-500">
      <div className="w-full max-w-md h-screen relative flex flex-col bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <header className="px-6 pt-10 pb-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Support Mode</span>
            <h1 className="text-xl font-bold dark:text-white">確定申告AI相棒</h1>
          </div>
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx("flex items-start gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}
              >
                <div className={clsx("p-2 rounded-full", msg.role === 'user' ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700")}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                </div>
                <div className={clsx("max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm", 
                  msg.role === 'user' ? "bg-indigo-500 text-white rounded-tr-none" : "bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-tl-none")}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          <div className="flex gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-indigo-500 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="何でも相談してください..."
              className="flex-1 bg-transparent border-none focus:outline-none px-2 py-1 dark:text-white"
            />
            <button onClick={handleSend} className="bg-indigo-500 p-2 rounded-xl text-white hover:bg-indigo-600 transition-colors">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 簡単なレイアウト調整用
function clsx(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}
