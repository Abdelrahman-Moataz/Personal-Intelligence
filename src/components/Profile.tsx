import React, { useState, useEffect } from "react";
import { auth, db, doc, getDoc, setDoc, serverTimestamp, OperationType, handleFirestoreError } from "../firebase";
import { UserProfile } from "../types";
import { User, Mail, Calendar, Shield, Save, Loader2, Camera, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Profile() {
  const user = auth.currentUser;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    bio: "",
    location: ""
  });

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setProfile(data);
          setFormData({
            displayName: data.displayName || "",
            bio: (data as any).bio || "",
            location: (data as any).location || ""
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const updateData = {
        displayName: formData.displayName,
        bio: formData.bio,
        location: formData.location,
        lastUpdated: serverTimestamp()
      };
      await setDoc(userRef, updateData, { merge: true });
      
      // Also update Agent collection
      await setDoc(doc(db, "Agent", user.uid), {
        displayName: formData.displayName,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      setProfile(prev => prev ? { ...prev, ...updateData } : null);
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div className="relative h-32 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="absolute -bottom-12 left-8">
          <div className="relative group">
            <img 
              src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
              alt="Profile" 
              className="w-24 h-24 rounded-3xl border-4 border-white shadow-xl object-cover bg-white"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              <Camera className="text-white" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16 p-8 flex-1 overflow-y-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {profile?.displayName || "Anonymous User"}
            </h2>
            <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
              <Mail size={14} />
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            disabled={isSaving}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-sm",
              isEditing 
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : (isEditing ? <Save size={16} /> : "EDIT PROFILE")}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Display Name</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Location</label>
              <input
                type="text"
                disabled={!isEditing}
                placeholder="Where are you based?"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Bio</label>
              <textarea
                disabled={!isEditing}
                rows={4}
                placeholder="Tell OmniAgent a bit about yourself..."
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60 resize-none"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-blue-600" />
                ACCOUNT SECURITY
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">Joined</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">
                    {profile?.createdAt?.toDate().toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <User size={16} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">User ID</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 truncate max-w-[120px]">
                    {user?.uid}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 space-y-4">
              <h4 className="font-black text-rose-900 flex items-center gap-2">
                DANGER ZONE
              </h4>
              <p className="text-xs text-rose-600 font-medium">
                Logging out will end your current session. Your memories are safely stored in the cloud.
              </p>
              <button 
                onClick={() => auth.signOut()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all shadow-sm"
              >
                <LogOut size={16} />
                LOGOUT SESSION
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
