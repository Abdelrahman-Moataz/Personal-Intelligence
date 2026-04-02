import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  db, 
  auth,
  OperationType,
  handleFirestoreError
} from "../firebase";
import { ChatMessage, Memory } from "../types";
import { chatWithAgent, extractMemories, analyzeImage } from "../lib/gemini";
import { Send, User, Bot, Loader2, Brain, Sparkles, CheckCircle2, Paperclip, Image as ImageIcon, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ file: File, preview: string } | null>(null);
  const [extractedMemories, setExtractedMemories] = useState<Partial<Memory>[]>([]);
  const [showMemoryNotif, setShowMemoryNotif] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/messages`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile({ file, preview: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFile) || !user || isLoading) return;

    const userMessage = input.trim();
    const fileToUpload = selectedFile;
    
    setInput("");
    setSelectedFile(null);
    setIsLoading(true);

    try {
      let finalMessage = userMessage;
      let imageAnalysis = "";

      // 1. Handle File if exists
      if (fileToUpload) {
        const base64Data = fileToUpload.preview.split(",")[1];
        imageAnalysis = await analyzeImage(base64Data, fileToUpload.file.type, userMessage || "Analyze this image.");
        finalMessage = userMessage ? `${userMessage}\n\n[Uploaded Image: ${fileToUpload.file.name}]` : `[Uploaded Image: ${fileToUpload.file.name}]`;
      }

      // 2. Save user message to Firestore
      await addDoc(collection(db, "users", user.uid, "messages"), {
        userId: user.uid,
        role: "user",
        text: finalMessage,
        timestamp: serverTimestamp(),
        hasImage: !!fileToUpload,
        imagePreview: fileToUpload?.preview
      });

      // 3. Get response from Gemini
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      let agentResponse = "";
      
      if (fileToUpload) {
        agentResponse = `I've analyzed the image you uploaded. ${imageAnalysis}`;
      } else {
        agentResponse = await chatWithAgent(userMessage, history);
      }

      // 4. Save agent response to Firestore
      await addDoc(collection(db, "users", user.uid, "messages"), {
        userId: user.uid,
        role: "model",
        text: agentResponse,
        timestamp: serverTimestamp()
      });

      // 5. Extract memories
      const newMemories = await extractMemories(userMessage || imageAnalysis, agentResponse);
      if (newMemories.length > 0) {
        setExtractedMemories(newMemories);
        setShowMemoryNotif(true);
        setTimeout(() => setShowMemoryNotif(false), 4000);
        
        for (const mem of newMemories) {
          await addDoc(collection(db, "users", user.uid, "memories"), {
            userId: user.uid,
            type: mem.type,
            content: mem.content,
            category: mem.category || "General",
            timestamp: serverTimestamp()
          });
        }
      }

    } catch (error) {
      console.error("Chat error:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user?.uid}/chat`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-sm">
          <Bot size={24} />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">OmniAgent</h2>
          <p className="text-xs text-slate-500">Always learning, always here to help.</p>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth relative"
      >
        <AnimatePresence>
          {showMemoryNotif && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm"
            >
              <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-xl shadow-blue-200 flex items-center gap-3 border border-blue-500">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Brain size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Memory Extracted</p>
                  <p className="text-xs font-bold truncate">{extractedMemories[0]?.content}</p>
                </div>
                <CheckCircle2 size={18} className="text-emerald-400" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Bot size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-slate-800 text-lg">Welcome to OmniAgent!</h3>
              <p className="text-slate-500 max-w-xs mx-auto">
                Start chatting with me. I'll learn your preferences, favorite places, and more as we talk.
              </p>
            </div>
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => (
            <motion.div 
              key={m.id || idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-3 max-w-[85%]",
                m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                m.role === "user" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-600"
              )}>
                {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                m.role === "user" 
                  ? "bg-slate-800 text-white rounded-tr-none" 
                  : "bg-slate-100 text-slate-800 rounded-tl-none"
              )}>
                {m.hasImage && m.imagePreview && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-white/10">
                    <img src={m.imagePreview} alt="Uploaded" className="w-full max-h-60 object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}
                <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-100">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 mr-auto max-w-[85%]"
          >
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Loader2 size={16} className="animate-spin text-blue-400" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 text-sm italic rounded-tl-none border border-slate-100 flex items-center gap-2">
              <Sparkles size={14} className="animate-pulse" />
              OmniAgent is thinking...
            </div>
          </motion.div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-slate-50/30">
        <AnimatePresence>
          {selectedFile && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 p-2 bg-white border border-slate-200 rounded-xl flex items-center gap-3 shadow-sm"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                <img src={selectedFile.preview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">{selectedFile.file.name}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Ready to upload</p>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-center gap-2">
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
          >
            <Paperclip size={20} />
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message or describe the image..."
              className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !selectedFile) || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
