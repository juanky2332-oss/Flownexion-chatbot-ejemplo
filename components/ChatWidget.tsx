
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Link as LinkIcon, Paperclip } from 'lucide-react';
import { MessageRole, ChatMessage } from '../types';
import { chatWithGemini, generateOrEditImage } from '../services/geminiService';
import { FLOWNEXION_IDENTITY, WELCOME_MESSAGE } from '../constants';
import RealisticRobot from './RealisticRobot';

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: MessageRole.BOT,
        content: WELCOME_MESSAGE,
        timestamp: new Date()
      }]);
    }
    
    // Auto-hide tooltip after some time, but show it prominently at first
    const timer = setTimeout(() => setShowTooltip(false), 15000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() && !attachedImage) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      content: inputValue,
      timestamp: new Date(),
      imageUrl: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const isImageRequest = 
        inputValue.toLowerCase().includes('genera') || 
        inputValue.toLowerCase().includes('dibuja') || 
        inputValue.toLowerCase().includes('imagen') || 
        attachedImage;

      if (isImageRequest) {
        const imageUrl = await generateOrEditImage(inputValue, attachedImage || undefined);
        const botMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: MessageRole.BOT,
          content: "¡Listo! He transformado tu idea en este flujo visual. 🎨✨",
          timestamp: new Date(),
          imageUrl: imageUrl,
          isImageAction: true
        };
        setMessages(prev => [...prev, botMessage]);
        setAttachedImage(null);
      } else {
        const chatHistory = messages.slice(-6).map(m => ({
          role: m.role === MessageRole.USER ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

        const response = await chatWithGemini(inputValue, chatHistory);
        const botMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: MessageRole.BOT,
          content: response.text,
          timestamp: new Date(),
          sources: response.sources
        };
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.BOT,
        content: "Vaya, parece que mis circuitos han tenido un pequeño glitch. ¿Podemos intentarlo de nuevo? 🤖⚡",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[92vw] md:w-[420px] h-[650px] glass-card rounded-[3rem] flex flex-col shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500 border border-white/20">
          {/* Premium Header */}
          <div className="relative p-7 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-b border-white/10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/5 blur-[80px] rounded-full"></div>
            
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center border border-white/20 shadow-2xl backdrop-blur-xl">
                    <RealisticRobot size={58} />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-4 border-slate-900 rounded-full shadow-lg"></div>
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-xl tracking-tight leading-none">Flo</h3>
                  <p className="text-[11px] text-cyan-400 font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                    <Sparkles size={12} fill="currentColor" />
                    Flownexion AI
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/10"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-[#020408]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === MessageRole.USER ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === MessageRole.BOT && (
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <RealisticRobot size={28} />
                  </div>
                )}
                <div className={`max-w-[82%] rounded-[2rem] p-5 shadow-lg ${
                  msg.role === MessageRole.USER 
                    ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white rounded-tr-none' 
                    : 'bg-slate-900/80 text-slate-200 border border-white/5 rounded-tl-none'
                }`}>
                  {msg.imageUrl && (
                    <div className="mb-4 rounded-2xl overflow-hidden border border-white/10 shadow-inner">
                      <img src={msg.imageUrl} alt="AI Generated" className="w-full h-auto" />
                    </div>
                  )}
                  <div className="text-[14px] leading-relaxed prose prose-invert max-w-none">
                    {msg.content}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                      {msg.sources.map((source, idx) => (
                        <a 
                          key={idx} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] flex items-center gap-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2 rounded-full transition-all border border-cyan-500/20 text-cyan-400 font-bold"
                        >
                          <LinkIcon size={12} />
                          <span className="truncate max-w-[120px]">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex flex-row gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0 shadow-md">
                  <RealisticRobot size={28} />
                </div>
                <div className="bg-slate-900/80 rounded-[1.5rem] rounded-tl-none px-6 py-4 border border-white/5 flex gap-2 items-center shadow-xl">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
          </div>

          {/* Modern Input Area */}
          <div className="p-7 bg-slate-900/90 border-t border-white/10 backdrop-blur-3xl">
            {attachedImage && (
              <div className="mb-4 relative inline-block animate-in fade-in slide-in-from-bottom-2">
                <img src={attachedImage} className="h-24 w-24 object-cover rounded-[1.5rem] border-2 border-cyan-500 shadow-2xl shadow-cyan-500/20" />
                <button 
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-xl transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="¿En qué puedo ayudarte hoy?"
                  className="w-full bg-slate-950 border border-white/10 rounded-[1.5rem] px-6 py-4 pr-14 text-[14px] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-white placeholder-slate-600"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <label className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 cursor-pointer p-1.5 transition-colors">
                  <Paperclip size={22} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <button 
                onClick={handleSend}
                disabled={(!inputValue.trim() && !attachedImage) || isLoading}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 p-4 rounded-[1.5rem] transition-all disabled:opacity-40 disabled:grayscale shadow-xl shadow-cyan-500/20 active:scale-95 flex items-center justify-center shrink-0"
              >
                <Send size={26} fill="currentColor" />
              </button>
            </div>
            <div className="mt-4 text-center">
              <p className="text-[9px] text-slate-600 uppercase tracking-[0.3em] font-black">Powered by Flownexion Core AI</p>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button Container */}
      <div className="relative group">
        {/* Waving Tooltip beckoning the user */}
        {showTooltip && !isOpen && (
          <div className="absolute bottom-24 right-0 mb-3 w-72 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white text-slate-900 text-xs font-bold px-6 py-5 rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative border border-cyan-100 leading-tight">
              ¡Hola! Soy <span className="text-cyan-600">Flo</span>. <br/> Pincha aquí y hablemos de optimización empresarial. 🚀✨
              <div className="absolute bottom-[-10px] right-10 w-5 h-5 bg-white border-r border-b border-cyan-100 rotate-45"></div>
            </div>
          </div>
        )}

        {/* Improved Friendly Chibi Robot Button (Smaller as requested) */}
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowTooltip(false);
          }}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full shadow-[0_20px_60px_-15px_rgba(0,209,255,0.4)] transition-all duration-700 transform ${isOpen ? 'scale-90 bg-slate-900 border-white/20 shadow-none' : 'hover:scale-110 bg-gradient-to-br from-slate-900 to-slate-800 border-white/10'}`}
          style={{ border: '2px solid' }}
        >
          <div className="relative flex items-center justify-center">
            {/* Robot stays visible but smaller when open */}
            <RealisticRobot 
              size={isOpen ? 65 : 85} 
              isPointing={!isOpen} 
              onlyHead={isOpen} 
            />
            
            {/* Small X indicator when open */}
            {isOpen && (
              <div className="absolute -top-1 -right-1 bg-slate-800 rounded-full p-1 border border-white/20 shadow-lg">
                <X className="text-white w-4 h-4" />
              </div>
            )}

            {/* Interactive glow pulses (only when closed) */}
            {!isOpen && (
              <>
                <div className="absolute -inset-4 bg-cyan-400 rounded-full animate-ping opacity-10"></div>
                <div className="absolute -inset-2 bg-cyan-400 rounded-full animate-pulse opacity-5"></div>
              </>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
