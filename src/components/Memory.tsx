import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  db, 
  auth,
  OperationType,
  handleFirestoreError
} from "../firebase";
import { Memory as MemoryType } from "../types";
import { Brain, MapPin, ShoppingBag, Heart, Clock, Tag, Search, Filter } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Memory() {
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "memories"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MemoryType[];
      setMemories(mems);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/memories`);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredMemories = memories.filter(m => {
    const matchesFilter = filter === "all" || m.type === filter;
    const matchesSearch = m.content.toLowerCase().includes(search.toLowerCase()) || 
                         (m.category && m.category.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "place": return <MapPin className="text-emerald-500" size={20} />;
      case "order": return <ShoppingBag className="text-amber-500" size={20} />;
      case "preference": return <Heart className="text-rose-500" size={20} />;
      default: return <Brain className="text-blue-500" size={20} />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "place": return "bg-emerald-50 border-emerald-100";
      case "order": return "bg-amber-50 border-amber-100";
      case "preference": return "bg-rose-50 border-rose-100";
      default: return "bg-blue-50 border-blue-100";
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 bg-white border-b border-slate-100 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Brain size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Personal Memory</h2>
              <p className="text-sm text-slate-500 font-medium">Insights learned from your conversations.</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600 border border-slate-200">
            <Clock size={14} />
            <span>{memories.length} MEMORIES</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            {[
              { id: "all", label: "All", icon: <Filter size={14} /> },
              { id: "preference", label: "Likes", icon: <Heart size={14} /> },
              { id: "place", label: "Places", icon: <MapPin size={14} /> },
              { id: "order", label: "Orders", icon: <ShoppingBag size={14} /> }
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilter(btn.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 border",
                  filter === btn.id 
                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200 scale-105" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filteredMemories.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-60">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-200">
              <Brain size={40} />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-800 text-lg">No memories found</h3>
              <p className="text-slate-500 max-w-xs mx-auto text-sm">
                Chat with the agent to start building your personal memory bank.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredMemories.map((m) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={m.id}
                  className={cn(
                    "p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md group relative overflow-hidden",
                    getBgColor(m.type)
                  )}
                >
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="p-3 bg-white rounded-xl shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                      {getIcon(m.type)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <Tag size={10} />
                          {m.category || m.type}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {m.timestamp?.toDate().toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-800 font-semibold leading-snug">
                        {m.content}
                      </p>
                    </div>
                  </div>
                  {/* Decorative background element */}
                  <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                    {React.cloneElement(getIcon(m.type) as React.ReactElement<any>, { size: 100 })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
