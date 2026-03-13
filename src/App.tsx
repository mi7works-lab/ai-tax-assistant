import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Send, User, Bot, Loader2, CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// 申請のステップ定義
const STEPS = [
  { id: 1, name: '準備', desc: '書類・カードの用意' },
  { id: 2, name: '経費', desc: '領収書の整理・入力' },
  { id: 3, name: '控除', desc: '保険や医療費の入力' },
  { id: 4, name: '送信', desc: 'e-Taxで提出完了' },
];

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [messages, setMessages] = useState([
    { role: 'bot', text: '確定申告ナビゲーターです！まずは「ステップ1：準備」から始めましょう。マイナンバーカードや源泉徴収票は手元にありますか？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: `あなたは確定申告初心者のガイドです。現在はステップ${currentStep}（${STEPS[currentStep-1].name}）にいます。
            専門用語を避け、中学生でもわかるように説明してください。
            各回答の最後には、必ず「次にすべきこと」を1つだけ箇条書きで提示してください。` 
          },
          { role: "user", content: input }
        ],
      });

      const aiReply = completion.choices[0].message.content || "すみません、もう一度お願いします。";
      setMessages(prev => [...prev, { role: 'bot', text: aiReply }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', text: "API設定を確認してください。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex justify-center transition-colors duration-500 font-sans">
      <div className="w-full max-w-md h-screen relative flex flex-col bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Header & Progress */}
        <header className="px-6 pt-10 pb-4 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Navigation System</span>
              <h1 className="text-xl font-bold dark:text-white">確定申告コンプリート</h1>
            </div>
            <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Step Progress Bar */}
          <div className="flex justify-between relative px-2">
            <div className="absolute top-4 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10" />
            {STEPS.map((step) => (
              <div key={step.id} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= step.id ? "bg-indigo-500 text-white shadow-lg shadow-indigo-200" : "bg-white dark:bg-slate-800 text-slate-400 border border-slate-200"
                }`}>
                  {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                </div>
                <span className={`text-[10px] font-bold ${currentStep === step.id ? "text-indigo-600" : "text-slate-400"}`}>{step.name}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-900/30">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className={`flex items-start gap-2 ${msg.role === 'user' ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' ? "bg-indigo-500 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-800"
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
          {isLoading && <div className="text-[10px] text-slate-400 animate-pulse ml-2">AIが手順を確認中...</div>}
        </div>

        {/* Action Button & Input */}
        <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          {messages.length > 2 && !isLoading && (
            <button 
              onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
              className="w-full mb-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-95"
            >
              次のステップへ進む <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-indigo-500 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="何でも聞いてください"
              className="flex-1 bg-transparent border-none focus:outline-none px-3 text-sm dark:text-white"
            />
            <button onClick={handleSend} className="bg-indigo-500 p-2.5 rounded-xl text-white shadow-md">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
