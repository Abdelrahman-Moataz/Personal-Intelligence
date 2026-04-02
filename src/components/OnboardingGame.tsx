import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Brain, 
  ChevronRight, 
  Sparkles, 
  Check, 
  MapPin, 
  Music, 
  Film, 
  Coffee, 
  ArrowRight,
  Loader2,
  RefreshCw
} from "lucide-react";
import * as d3 from "d3";
import { generateOnboardingQuestions, generatePredictions } from "../lib/gemini";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  db, 
  auth,
  doc,
  setDoc,
  getDocs,
  query as fsQuery,
  where,
  handleFirestoreError,
  OperationType
} from "../firebase";

interface Prediction {
  name: string;
  type: "preference" | "place" | "order" | "general";
  reason: string;
  country?: string;
}

const CATEGORIES = [
  { id: "music", label: "Music", icon: <Music size={18} />, chips: ["Rock", "Pop", "Jazz", "Classical", "Hip Hop", "Electronic", "Indie", "Metal"] },
  { id: "movies", label: "Movies", icon: <Film size={18} />, chips: ["Action", "Comedy", "Drama", "Sci-Fi", "Horror", "Romance", "Documentary", "Anime"] },
  { id: "places", label: "Places", icon: <MapPin size={18} />, chips: ["Beach", "Mountains", "City", "Countryside", "Forest", "Desert", "Island"] },
  { id: "coffee", label: "Coffee", icon: <Coffee size={18} />, chips: ["Espresso", "Latte", "Cappuccino", "Black", "Cold Brew", "Sweet", "Tea Lover"] }
];

export default function OnboardingGame({ onComplete, initialStep = "chips" }: { onComplete: () => void, initialStep?: "chips" | "map" }) {
  const [step, setStep] = useState<"chips" | "questions" | "map">(initialStep);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (initialStep === "map") {
      loadExistingData();
    }
  }, [initialStep]);

  const loadExistingData = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsLoading(true);
    try {
      const memoriesSnap = await getDocs(collection(db, "users", user.uid, "memories"));
      const mems = memoriesSnap.docs.map(d => d.data());
      
      const chips = mems.filter(m => m.category === "Initial Interest").map(m => m.content.replace("Likes ", ""));
      const preds = mems.filter(m => m.category === "AI Prediction").map(m => {
        const content = m.content;
        const match = content.match(/^(.*?) \((.*?)\): (.*)$/);
        if (match) {
          return {
            name: match[1],
            country: match[2],
            type: m.type as any,
            reason: match[3]
          };
        }
        const parts = content.split(": ");
        return {
          name: parts[0],
          type: m.type as any,
          reason: parts[1] || "Based on your interests"
        };
      });

      setSelectedChips(chips);
      setPredictions(preds);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleChip = (chip: string) => {
    setSelectedChips(prev => 
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  };

  const handleChipsSubmit = async () => {
    if (selectedChips.length < 3) return;
    setIsLoading(true);
    const qs = await generateOnboardingQuestions(selectedChips);
    setQuestions(qs);
    setIsLoading(false);
    setStep("questions");
  };

  const handleAnswerSubmit = async () => {
    const newAnswers = [...answers, { question: questions[currentQuestionIndex], answer: currentAnswer }];
    setAnswers(newAnswers);
    setCurrentAnswer("");

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      try {
        setIsLoading(true);
        const preds = await generatePredictions(selectedChips, newAnswers);
        setPredictions(preds);
        
        // Save everything as memories
      const user = auth.currentUser;
      if (user) {
        // Mark onboarding as completed
        const onboardingPromise = setDoc(doc(db, "users", user.uid), { onboardingCompleted: true }, { merge: true });
        
        // Update Agent collection with onboarding status
        const agentPromise = setDoc(doc(db, "Agent", user.uid), { 
          onboardingCompleted: true,
          lastUpdated: serverTimestamp() 
        }, { merge: true });

        const chipPromises = selectedChips.map(chip => 
          addDoc(collection(db, "users", user.uid, "memories"), {
            userId: user.uid,
            type: "preference",
            content: `Likes ${chip}`,
            category: "Initial Interest",
            timestamp: serverTimestamp()
          })
        );

        const answerPromises = newAnswers.map(ans => 
          addDoc(collection(db, "users", user.uid, "memories"), {
            userId: user.uid,
            type: "general",
            content: `${ans.question}: ${ans.answer}`,
            category: "Onboarding Answer",
            timestamp: serverTimestamp()
          })
        );

        const predictionPromises = preds.map(pred => 
          addDoc(collection(db, "users", user.uid, "memories"), {
            userId: user.uid,
            type: pred.type,
            content: `${pred.name} (${pred.country || "Global"}): ${pred.reason}`,
            category: "AI Prediction",
            timestamp: serverTimestamp()
          })
        );

        await Promise.all([onboardingPromise, agentPromise, ...chipPromises, ...answerPromises, ...predictionPromises]);
      }
      
      setIsLoading(false);
      setStep("map");
    } catch (error) {
      console.error("Onboarding save error:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser?.uid}/onboarding`);
    }
  }
};

  // D3 Visualization
  useEffect(() => {
    if (step === "map" && svgRef.current && predictions.length > 0) {
      const width = 600;
      const height = 400;
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const data = [
        ...selectedChips.map(c => ({ id: c, group: "like", radius: 40 })),
        ...predictions.map(p => ({ id: p.name, group: "prediction", radius: 35, reason: p.reason }))
      ];

      const simulation = d3.forceSimulation(data as any)
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("charge", d3.forceManyBody().strength(-100))
        .force("collide", d3.forceCollide().radius(d => (d as any).radius + 10))
        .on("tick", () => {
          node.attr("transform", d => `translate(${(d as any).x}, ${(d as any).y})`);
        });

      const node = svg.append("g")
        .selectAll("g")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "cursor-pointer");

      node.append("circle")
        .attr("r", d => d.radius)
        .attr("fill", d => d.group === "like" ? "#2563eb" : "#f8fafc")
        .attr("stroke", d => d.group === "like" ? "none" : "#e2e8f0")
        .attr("stroke-width", 2)
        .attr("class", "transition-all duration-300 hover:scale-110");

      node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .attr("fill", d => d.group === "like" ? "white" : "#475569")
        .attr("font-size", "10px")
        .attr("font-weight", "bold")
        .text(d => d.id);

      // Tooltip logic could be added here if needed
    }
  }, [step, predictions, selectedChips]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        
        <AnimatePresence mode="wait">
          {step === "chips" && (
            <motion.div 
              key="chips"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-blue-50 text-blue-600 rounded-2xl mb-4">
                  <Brain size={32} />
                </div>
                <h2 className="text-3xl font-black tracking-tight text-slate-900">Let's build your profile</h2>
                <p className="text-slate-500 font-medium">Select at least 3 things you love to get started.</p>
              </div>

              <div className="space-y-6">
                {CATEGORIES.map(cat => (
                  <div key={cat.id} className="space-y-3">
                    <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cat.chips.map(chip => (
                        <button
                          key={chip}
                          onClick={() => toggleChip(chip)}
                          className={cn(
                            "px-4 py-2 rounded-full text-sm font-bold transition-all border",
                            selectedChips.includes(chip)
                              ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 scale-105"
                              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                          )}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                disabled={selectedChips.length < 3 || isLoading}
                onClick={handleChipsSubmit}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-all shadow-xl shadow-slate-200"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                CONTINUE
              </button>
            </motion.div>
          )}

          {step === "questions" && (
            <motion.div 
              key="questions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-600 font-black text-xs tracking-widest uppercase">
                  <Sparkles size={16} />
                  <span>Getting to know you</span>
                </div>
                <span className="text-slate-400 font-bold text-xs">
                  {currentQuestionIndex + 1} / {questions.length}
                </span>
              </div>

              <div className="space-y-6">
                <h3 className="text-2xl font-black text-slate-900 leading-tight">
                  {questions[currentQuestionIndex]}
                </h3>
                <textarea
                  autoFocus
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium text-slate-800 min-h-[150px] resize-none"
                />
              </div>

              <button
                disabled={!currentAnswer.trim() || isLoading}
                onClick={handleAnswerSubmit}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-xl shadow-blue-200"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                {currentQuestionIndex === questions.length - 1 ? "FINISH" : "NEXT QUESTION"}
              </button>
            </motion.div>
          )}

          {step === "map" && (
            <motion.div 
              key="map"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 text-center"
            >
              <div className="space-y-2">
                <h2 className="text-3xl font-black tracking-tight text-slate-900">Your Interest Map</h2>
                <p className="text-slate-500 font-medium">Blue are your likes, white are what I think you'll love.</p>
              </div>

              <div className="bg-slate-50 rounded-[40px] border border-slate-100 overflow-hidden relative">
                <svg ref={svgRef} width="600" height="400" className="mx-auto" />
                <div className="absolute bottom-6 left-6 right-6 flex justify-center gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="w-3 h-3 rounded-full bg-blue-600" />
                    <span>Your Likes</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="w-3 h-3 rounded-full bg-white border border-slate-200" />
                    <span>AI Predictions</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 text-left">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Why I predicted these:</h4>
                {predictions.map((p, i) => (
                  <div key={i} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-start gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <Sparkles size={14} />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{p.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={onComplete}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                <Check />
                START CHATTING
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
