import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Send, User, Bot, Loader2, CheckCircle2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Gemini APIの設定
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

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
    { role: 'bot', text: '確定申告無料AIガイド（Gemini版）です！「ステップ1：準備」から始めましょう。何でも聞いてくださいね。' }
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
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `あなたは確定申告初心者の親切なガイドです。
      現在はステップ${currentStep}（${STEPS[currentStep-1].name}）の相談に乗っています。
      専門用語を避け、分かりやすく答えてください。
      回答の最後には、必ず「次にすべきこと」を箇条書きで1つ添えてください。
      質問: ${input}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      setMessages(prev => [...prev, { role: 'bot', text: text }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'bot', text: "無料枠の制限か、設定エラーが発生しました。時間を置いて試してください。" }]);
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
        
        <header className="px-6 pt-10 pb-4 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Free AI System</span>
              <h1 className="text-xl font-bold dark:text-white">確定申告コンプリート</h1>
            </div>
            <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex justify-between relative px-2">
            <div className="absolute top-4 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10" />
            {STEPS.map((step) => (
              <div key={step.id} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= step.id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-white dark:bg-slate-800 text-slate-400 border border-slate-200"
                }`}>
                  {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                </div>
                <span className={`text-[10px] font-bold ${currentStep === step.id ? "text-emerald-600" : "text-slate-400"}`}>{step.name}</span>
              </div>
            ))}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-900/30 text-slate-800 dark:text-slate-100">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className={`flex items-start gap-2 ${msg.role === 'user' ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-800"
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
          {isLoading && <div className="text-[10px] text-emerald-500 animate-pulse ml-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Geminiが思考中...</div>}
        </div>

        <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          {messages.length > 2 && !isLoading && (
            <button 
              onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
              className="w-full mb-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95"
            >
              次のステップへ進む <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-emerald-500 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="例：領収書がないときは？"
              className="flex-1 bg-transparent border-none focus:outline-none px-3 text-sm dark:text-white"
            />
            <button onClick={handleSend} className="bg-emerald-500 p-2.5 rounded-xl text-white shadow-md">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
