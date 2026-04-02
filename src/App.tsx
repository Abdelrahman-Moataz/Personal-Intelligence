import React, { useState, useEffect } from "react";
import { generateOnboardingQuestions, generatePredictions, searchRealPlaces } from "./lib/gemini";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  db, 
  doc, 
  setDoc, 
  getDoc, 
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  FirebaseUser,
  handleFirestoreError,
  OperationType
} from "./firebase";
import { UserProfile } from "./types";
import Chat from "./components/Chat";
import Memory from "./components/Memory";
import Profile from "./components/Profile";
import OnboardingGame from "./components/OnboardingGame";
import InterestMap from "./components/InterestMap";
import { LogIn, LogOut, Brain, Sparkles, Github, Twitter, Globe, LayoutDashboard, MessageSquare, User as UserIcon, Gamepad2, UserCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Prediction {
  name: string;
  type: "preference" | "place" | "order" | "general";
  reason: string;
  country?: string;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "memory" | "map" | "profile">("chat");
  const [showGame, setShowGame] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"chips" | "map">("chips");
  const [mapData, setMapData] = useState<{ selectedChips: string[], predictions: Prediction[] }>({ selectedChips: [], predictions: [] });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.uid);
      if (firebaseUser) {
        try {
          // Ensure user profile exists in Firestore
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            createdAt: serverTimestamp(),
            onboardingCompleted: false
          };
          await setDoc(userRef, userData);
          console.log("User profile created in 'users' collection.");
          
          // Also save to Agent collection as requested
          await setDoc(doc(db, "Agent", firebaseUser.uid), {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            lastUpdated: serverTimestamp()
          });
          console.log("User data saved to 'Agent' collection.");

          setShowGame(true);
          setOnboardingStep("chips");
        } else {
          // Update Agent collection even if user already exists to keep it in sync
          await setDoc(doc(db, "Agent", firebaseUser.uid), {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            lastUpdated: serverTimestamp()
          }, { merge: true });
          console.log("User data updated in 'Agent' collection.");

          const userData = userSnap.data();
          if (!userData.onboardingCompleted) {
            setShowGame(true);
            setOnboardingStep("chips");
          } else {
            loadMapData(firebaseUser.uid);
          }
        }
        setUser(firebaseUser);
        } catch (error) {
          console.error("Error during auth state processing:", error);
          handleFirestoreError(error, OperationType.WRITE, "auth_sync");
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const loadMapData = async (uid: string) => {
    try {
      console.log("🔍 Loading map data for:", uid);
      const memoriesSnap = await getDocs(collection(db, "users", uid, "memories"));
      const mems = memoriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      console.log("📊 Total memories found:", mems.length);

      // Load both initial and confirmed interests
      const chips = mems
        .filter((m: any) => m.category === "Initial Interest" || m.category === "Confirmed Interest")
        .map((m: any) => m.content.replace("Likes ", "").trim());
      
      const preds = mems
        .filter((m: any) => m.category === "AI Prediction")
        .map((m: any) => {
          const content = m.content || "";
          // Try to match "Name (Country): Reason" - more robust regex
          const match = content.match(/^(.+?)\s*\((.+?)\)\s*:\s*(.+)$/);
          if (match) {
            return {
              name: match[1].trim(),
              country: match[2].trim(),
              type: m.type as any,
              reason: match[3].trim()
            };
          }
          // Fallback to "Name: Reason"
          const parts = content.split(":");
          if (parts.length >= 2) {
            return {
              name: parts[0].trim(),
              type: m.type as any,
              reason: parts.slice(1).join(":").trim(),
              country: "Global"
            };
          }
          return {
            name: content.trim(),
            type: m.type as any,
            reason: "Based on your interests",
            country: "Global"
          };
        });

      console.log("✅ Loaded chips:", chips.length, chips);
      console.log("✅ Loaded predictions before filter:", preds.length, preds);
      
      const uniqueChips = [...new Set(chips)];
      const filteredPreds = preds.filter(p => !uniqueChips.includes(p.name));

      console.log("✅ Loaded predictions after filter:", filteredPreds.length, filteredPreds);
      
      setMapData({ 
        selectedChips: uniqueChips, 
        predictions: filteredPreds 
      });
    } catch (e) {
      console.error("❌ Failed to load map data:", e);
    }
  };

  const handleRefreshMap = async () => {
    if (!user) return;
    const path = `users/${user.uid}/memories`;
    try {
      let locationString = "";
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        locationString = `${position.coords.latitude}, ${position.coords.longitude}`;
      } catch (e) {
        console.warn("Geolocation failed, searching without location context.");
      }

      const newPredictions = await searchRealPlaces(mapData.selectedChips, locationString);
      if (newPredictions.length > 0) {
        // Save new predictions to Firestore
        const savePromises = newPredictions.map(async (pred) => {
          try {
            await addDoc(collection(db, "users", user.uid, "memories"), {
              userId: user.uid,
              type: pred.type,
              content: `${pred.name} (${pred.country}): ${pred.reason}`,
              category: "AI Prediction",
              timestamp: serverTimestamp()
            });
          } catch (err) {
            const { handleFirestoreError, OperationType } = await import("./firebase");
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        });
        
        await Promise.all(savePromises);
        // Reload map data
        await loadMapData(user.uid);
      }
    } catch (e) {
      console.error("Failed to refresh map:", e);
    }
  };

  const handleSavePrediction = async (prediction: Prediction) => {
    if (!user) return;
    const path = `users/${user.uid}/memories`;
    try {
      // Create a new memory as a "preference" instead of "AI Prediction"
      await addDoc(collection(db, "users", user.uid, "memories"), {
        userId: user.uid,
        type: "preference",
        content: `Likes ${prediction.name}`,
        category: "Confirmed Interest",
        timestamp: serverTimestamp()
      });
      // Reload map data
      await loadMapData(user.uid);
    } catch (err) {
      const { handleFirestoreError, OperationType } = await import("./firebase");
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center text-white shadow-2xl shadow-blue-200 animate-pulse">
            <Brain size={32} />
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-medium tracking-widest text-xs uppercase">
            <Sparkles size={14} className="animate-spin" />
            <span>Initializing OmniAgent</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Navbar */}
        <nav className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Brain size={24} />
            </div>
            <span className="font-black text-xl tracking-tighter text-slate-900">OMNIAGENT</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-500">
            <a href="#" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Security</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Pricing</a>
          </div>
          <button 
            onClick={handleLogin}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-full font-bold text-sm hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 hover:scale-105 active:scale-95"
          >
            <LogIn size={18} />
            Get Started
          </button>
        </nav>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto space-y-12 py-20">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-xs font-black tracking-widest uppercase border border-blue-100">
              <Sparkles size={14} />
              <span>AI-Powered Personal Memory</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.9]">
              The Agent That <span className="text-blue-600">Learns</span> You.
            </h1>
            <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
              OmniAgent remembers your preferences, favorite places, and order history from every conversation. Your personal AI companion that gets smarter every day.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <button 
              onClick={handleLogin}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200 hover:-translate-y-1 active:translate-y-0"
            >
              <LogIn size={24} />
              Connect with Google
            </button>
            <button className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-5 bg-white text-slate-900 border-2 border-slate-100 rounded-2xl font-black text-lg hover:bg-slate-50 transition-all">
              <Globe size={24} />
              Explore Demo
            </button>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full pt-12">
            {[
              { icon: <MessageSquare className="text-blue-500" />, title: "Natural Chat", desc: "Just talk naturally. No complex commands needed." },
              { icon: <Brain className="text-emerald-500" />, title: "Smart Extraction", desc: "Automatically remembers facts, likes, and places." },
              { icon: <LayoutDashboard className="text-amber-500" />, title: "Memory Bank", desc: "A beautiful dashboard of everything learned." }
            ].map((feature, i) => (
              <div key={i} className="p-8 bg-slate-50/50 rounded-3xl border border-slate-100 text-left space-y-4 hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-slate-100">
                  {feature.icon}
                </div>
                <h3 className="font-black text-xl text-slate-900 tracking-tight">{feature.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="p-12 border-t border-slate-100 bg-slate-50/30">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-2.5 opacity-50 grayscale">
              <Brain size={24} />
              <span className="font-black text-xl tracking-tighter">OMNIAGENT</span>
            </div>
            <div className="flex items-center gap-6 text-slate-400">
              <Github size={20} className="hover:text-slate-900 cursor-pointer" />
              <Twitter size={20} className="hover:text-slate-900 cursor-pointer" />
              <Globe size={20} className="hover:text-slate-900 cursor-pointer" />
            </div>
            <p className="text-sm font-bold text-slate-400">© 2026 OmniAgent. Built for everyone.</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AnimatePresence>
        {showGame && (
          <OnboardingGame 
            initialStep={onboardingStep} 
            onComplete={() => {
              setShowGame(false);
              setOnboardingStep("chips");
              if (user) loadMapData(user.uid);
            }} 
          />
        )}
      </AnimatePresence>

      {/* App Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Brain size={24} />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tighter text-slate-900 leading-none">OMNIAGENT</h1>
              <span className="text-[10px] font-black text-blue-600 tracking-widest uppercase">Personal Intelligence</span>
            </div>
          </div>

          <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all",
                activeTab === "chat" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <MessageSquare size={16} />
              CHAT
            </button>
            <button 
              onClick={() => setActiveTab("memory")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all",
                activeTab === "memory" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <LayoutDashboard size={16} />
              MEMORY
            </button>
            <button 
              onClick={() => setActiveTab("map")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all",
                activeTab === "map" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Globe size={16} />
              MAP
            </button>
            <button 
              onClick={() => setActiveTab("profile")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all",
                activeTab === "profile" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <UserCircle size={16} />
              PROFILE
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setOnboardingStep("chips");
                setShowGame(true);
              }}
              className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100"
              title="Re-run Onboarding Game"
            >
              <Gamepad2 size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full">
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                alt="Profile" 
                className="w-6 h-6 rounded-full border border-slate-200"
                referrerPolicy="no-referrer"
              />
              <span className="text-xs font-black text-slate-700 truncate max-w-[100px]">
                {user.displayName?.split(' ')[0].toUpperCase()}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col overflow-hidden">
        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm mb-4">
          <button 
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-black transition-all",
              activeTab === "chat" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-500"
            )}
          >
            <MessageSquare size={18} />
            CHAT
          </button>
          <button 
            onClick={() => setActiveTab("memory")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-black transition-all",
              activeTab === "memory" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-500"
            )}
          >
            <LayoutDashboard size={18} />
            MEMORY
          </button>
          <button 
            onClick={() => setActiveTab("map")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-black transition-all",
              activeTab === "map" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-500"
            )}
          >
            <Globe size={18} />
            MAP
          </button>
          <button 
            onClick={() => setActiveTab("profile")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-black transition-all",
              activeTab === "profile" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-500"
            )}
          >
            <UserCircle size={18} />
            PROFILE
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              {activeTab === "chat" && <Chat />}
              {activeTab === "memory" && <Memory />}
              {activeTab === "map" && <InterestMap selectedChips={mapData.selectedChips} predictions={mapData.predictions} onRefresh={handleRefreshMap} onSavePrediction={handleSavePrediction} />}
              {activeTab === "profile" && <Profile />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
