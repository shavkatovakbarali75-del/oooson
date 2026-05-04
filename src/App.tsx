import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Plus, Image as ImageIcon, Volume2, Search, BookOpen, Trash2, ArrowRight, ArrowLeft, List, Play, Loader2, Compass, ShoppingBag, Plane, Coffee, Briefcase, GraduationCap, Trophy, Sparkles, CheckCircle2, Dumbbell, BarChart2, CheckCircle, XCircle, Timer, Award, Target, Zap, Moon, Sun, Flame, Download, Upload, Mic, UserCircle, LogOut, Edit3, Save, X, Camera, Keyboard, Layers, Link as LinkIcon, Eye, Heart, Gamepad2, Ghost, Skull, Lock, Crown, Users, PieChart, Clock, Star, Book, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where, deleteDoc, orderBy, limit, getDocFromServer } from 'firebase/firestore';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// Telegram WebApp integration
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string } };
        themeParams: { bg_color?: string; text_color?: string; };
        colorScheme: 'light' | 'dark';
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
      };
    };
  }
}

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Firestore connectivity test
async function testConnection() {
  try {
    // Attempt to read a non-existent document from server to test connectivity
    await getDocFromServer(doc(db, '_connectivity_test_', 'ping'));
    console.log("Firestore connection successful.");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('offline') || error.message.includes('unavailable') || error.message.includes('Could not reach')) {
        console.error("Firestore unreachable: The app is operating in offline mode or the network is restricted.", error.message);
      } else {
        console.warn("Firestore connectivity check returned an expected error (likely doc not found):", error.message);
      }
    }
  }
}
testConnection();

function Logo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 543.76 123.87" className="w-full h-auto">
        <defs>
          <linearGradient id="logo-gradient" x1="395.63" y1="228.38" x2="164.78" y2="-89.36" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#a855f7"/>
            <stop offset="1" stopColor="#280056"/>
          </linearGradient>
        </defs>
        <g>
          {/* Background Path */}
          <path 
            className="fill-[url(#logo-gradient)] dark:fill-white transition-colors duration-300" 
            d="M543.76,54.5v66.26H420.89V119a69.21,69.21,0,0,1-25.83,4.87,65.88,65.88,0,0,1-39.33-12.43c-9,7.53-22.11,12.43-39.69,12.43-14.36,0-28.44-3.46-39.41-9.49a67.1,67.1,0,0,1-35,9.49c-17.57,0-33.06-6.2-44.39-16.59-11.62,10.7-27.37,16.59-44.49,16.59-17.57,0-33.06-6.2-44.38-16.59C96.71,118,81,123.87,63.84,123.87,27.44,123.87,0,97.28,0,62,0,44.71,6.6,28.89,18.59,17.49,30.32,6.34,46.46.2,64,.2,81.13.2,96.83,6,108.4,16.62,120.05,6,135.8.2,152.91.2S185.7,6,197.27,16.62C208.92,6,224.68.2,241.79.2c14.6,0,28.18,4.25,39,12.11C290,4.52,302.93,0,318.05,0c14.41,0,28.59,4.24,39.27,11.44A67.06,67.06,0,0,1,395.26.2,69.36,69.36,0,0,1,420.89,5V3.12H478.8A54.8,54.8,0,0,1,495,.7C524.16.7,543.76,22.32,543.76,54.5Z"
          />
          {/* Text Path */}
          <path 
            className="fill-white dark:fill-[url(#logo-gradient)] transition-colors duration-300" 
            d="M495,18.71a35.23,35.23,0,0,0-26.34,11.46l-1-9H438.89v27c-5.56-18-22.16-29.88-43.62-29.88-26.75,0-46,18.3-46,43.84,0,.88,0,1.75.07,2.61C343,56,330.6,53.67,322.48,51.78,315,50,311,48.57,311,45.35c0-2.41,2.41-4.63,7.64-4.63a32.61,32.61,0,0,1,19.91,7.65l14.07-17.5C346,23.83,332.94,18,318.06,18c-19.08,0-33.17,9.24-34.32,25.57-6.78-15.48-22.33-25.37-42-25.37-22.46,0-39.67,12.91-44.61,32.17-4.82-19.32-21.9-32.17-44.26-32.17s-39.66,12.9-44.61,32.15C103.48,31,86.4,18.2,64.05,18.2,37.3,18.2,18,36.5,18,62s19.3,43.84,45.84,43.84c22.32,0,39.52-12.93,44.42-32.35,4.87,19.36,22.09,32.35,44.46,32.35S192.23,93,197.13,73.53c4.87,19.36,22.1,32.35,44.46,32.35,26.54,0,45.84-18.3,45.84-44q0-1.47-.09-2.91c5.88,8.72,17.73,11.65,27.7,14,7.44,1.81,11.66,3.62,11.66,6.63,0,2.42-2.61,4.43-8.84,4.43-9.05,0-17.7-3.42-24.94-7.44L279.85,95c8.25,6.63,21.92,10.86,36.2,10.86,22.54,0,35.64-10,37.07-25.14,6.93,15.31,22.49,25.14,41.95,25.14,21.49,0,38.23-12,43.82-30.23v27.11h31.37V61.34c0-9.25,5.43-15.48,13.67-15.48,7.24,0,10.66,5.83,10.66,13.47v43.43h31.17V54.5C525.76,31.78,513.49,18.71,495,18.71ZM64.05,77.93c-9.25,0-15.69-6.84-15.69-16.09,0-9.05,6.44-15.69,15.48-15.69S79.33,52.79,79.33,62,73.09,77.93,64.05,77.93Zm88.87,0c-9.25,0-15.69-6.84-15.69-16.09,0-9.05,6.44-15.69,15.49-15.69S168.2,52.79,168.2,62,162,77.93,152.92,77.93Zm88.87,0c-9.25,0-15.69-6.84-15.69-16.09,0-9.05,6.44-15.69,15.49-15.69S257.07,52.79,257.07,62,250.84,77.93,241.79,77.93Zm153.48,0c-9.25,0-15.69-6.84-15.69-16.09,0-9.05,6.44-15.69,15.49-15.69S410.55,52.79,410.55,62,404.32,77.93,395.27,77.93Z"
          />
        </g>
      </svg>
    </div>
  );
}

interface Word {
  id: string;
  userId?: string;
  original: string;
  translation: string;
  pronunciation?: string;
  description?: string;
  partOfSpeech?: string;
  emoji?: string;
  uzbekExplanation?: string;
  status?: 'new' | 'learning' | 'ready_for_exam' | 'mastered';
  progress?: number;
  hiddenInAll?: boolean;
  passedQuiz?: boolean;
  passedFlashcards?: boolean;
  passedListening?: boolean;
  passedMatching?: boolean;
  passedSpelling?: boolean;
  createdAt?: string;
}

interface DailyStats {
  timeSpent: number; // in seconds
  wordsLearned: number;
}

export function getMotivationalMessage(percentage: number): string {
  const positiveQuotes = [
    "Siz ajoyib natija ko'rsatdingiz! Har bir o'rganilgan so'z - kelajak sari ulkan qadam.",
    "Barakalla! Til o'rganishda davom eting, mehnatlaringiz tez orada o'z mevasini beradi.",
    "Ajoyib! Sizning qat'iyatingizga qoyil qolmasdan iloj yo'q. Faqat oldinga!",
    "Zo'r! Kunlik oz-ozdan o'rganish - katta g'alabalarning siri.",
    "Qoyilmaqom! Til bilish - dunyoni kashf etish uchun yangi eshiklarni ochish demakdir."
  ];
  const mixedQuotes = [
    "Yaxshi urinish! Xatolar – o'rganishning eng yaxshi qismi, aslo taslim bo'lmang.",
    "Yomon emas! Yana bir bor mashq qilib, natijangizni yanada yaxshilashingiz mumkin.",
    "Harakat qildingiz, va bu eng muhimi! Har kuni o'rgansangiz albatta o'zlashtirasiz."
  ];
  const badQuotes = [
    "Hozircha xatolar bo'lishi tabiiy. Ko'proq mashq qiling va muvaffaqiyatga erishasiz!",
    "Qiyin bo'layotgan bo'lsa, xavotir olmang. Sekin-asta, qadam ba qadam yodlashda davom eting."
  ];

  if (percentage >= 0.8) return positiveQuotes[Math.floor(Math.random() * positiveQuotes.length)];
  if (percentage >= 0.5) return mixedQuotes[Math.floor(Math.random() * mixedQuotes.length)];
  return badQuotes[Math.floor(Math.random() * badQuotes.length)];
}

function updateWordProgress(w: Word, exerciseType: 'quiz' | 'flashcards' | 'listening' | 'matching' | 'spelling' | 'exam', isCorrect: boolean): Word {
  if (exerciseType === 'exam') {
    if (isCorrect) {
      return { ...w, status: 'mastered', progress: 100 };
    } else {
      return { ...w, status: 'learning', progress: 0, passedQuiz: false, passedFlashcards: false, passedListening: false, passedMatching: false, passedSpelling: false }; // Reset all flags to require relearning
    }
  }

  if (exerciseType === 'flashcards') {
    if (isCorrect && w.status === 'new') {
      return { ...w, status: 'learning' };
    }
    return w;
  }

  if (!isCorrect) {
    let newStatus = w.status || 'new';
    let newProgress = w.progress || 0;
    
    if (newStatus === 'learning') {
      const updated = { ...w, [`passed${exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1)}`]: false };
      newProgress = Math.max(0, newProgress - 25);
      if (newProgress === 0) newStatus = 'new';
      return { ...updated, status: newStatus, progress: newProgress };
    } else if (newStatus === 'ready_for_exam') {
      return { ...w, status: 'learning', progress: 75, [`passed${exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1)}`]: false };
    } else if (newStatus === 'mastered') {
      return { ...w, status: 'ready_for_exam', progress: 100 };
    }
    return w;
  }

  let newStatus = w.status || 'new';
  const flagName = `passed${exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1)}` as keyof Word;
  
  if (w[flagName as keyof typeof w]) {
    return w;
  }

  const updated = { ...w, [flagName]: true } as Word;
  
  if (newStatus === 'new') {
    newStatus = 'learning';
  }
  
  if (newStatus === 'learning') {
    let passedCount = 0;
    if (updated.passedQuiz) passedCount++;
    if (updated.passedListening) passedCount++;
    if (updated.passedMatching) passedCount++;
    if (updated.passedSpelling) passedCount++;
    
    const newProgress = passedCount * 25;
    if (newProgress >= 100) {
      newStatus = 'ready_for_exam';
    }
    return { ...updated, status: newStatus, progress: newProgress };
  }
  
  return updated;
}

export interface UserProfile {
  uid: string;
  displayName?: string;
  email: string;
  photoURL?: string;
  coins: number;
  wordsLearned: number;
  streak: number;
  role: string;
  createdAt: string;
  lastActive?: string;
  bio?: string;
}

function ProfileModal({ 
  user, 
  userProfile, 
  onClose 
}: { 
  user: User, 
  userProfile: UserProfile | null, 
  onClose: () => void 
}) {
  const [displayName, setDisplayName] = useState(userProfile?.displayName || user.displayName || '');
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user.photoURL || '');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 150;
        
        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;
        const ctx = canvas.getContext('2d');

        // Kvadrat qilib qirqib olish uchun eng qisqa tomonni topamiz
        const size = Math.min(img.width, img.height);
        
        // Markazdan qirqish uchun boshlang'ich nuqtalarni hisoblaymiz
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        // Rasmni markazdan qirqib, 150x150 o'lchamda chizamiz
        ctx?.drawImage(img, startX, startY, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
        
        // Compress as JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPhotoURL(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        displayName,
        bio,
        photoURL,
        lastActive: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
      await setDoc(doc(db, 'public_profiles', user.uid), {
        uid: user.uid,
        ...payload
      }, { merge: true });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getLevelTitle = (count: number) => {
    if (count >= 1000) return 'Titan';
    if (count >= 300) return 'Afsona';
    if (count >= 100) return 'Usta';
    if (count >= 50) return 'Bilimdon';
    if (count >= 20) return 'Shogird';
    if (count >= 5) return 'Boshlovchi';
    return 'Navqiron';
  };

  const currentTitle = getLevelTitle(userProfile?.wordsLearned || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Profil</h2>
            <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest leading-none mt-0.5">{currentTitle}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex justify-center">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-[#a855f7] to-[#280056]">
                {photoURL ? (
                  <img src={photoURL} alt="Profile" className="w-full h-full rounded-full object-cover bg-white dark:bg-slate-800" />
                ) : (
                  <div className="w-full h-full rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-500 font-bold text-3xl">
                    {(displayName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-8 h-8 text-white" />
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ism</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                placeholder="Ismingiz"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">O'zingiz haqingizda (Bio)</label>
              <textarea 
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={150}
                rows={3}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none dark:text-white"
                placeholder="Qisqacha ma'lumot..."
              />
              <p className="text-xs text-slate-500 mt-1 text-right">{bio.length}/150</p>
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => { signOut(auth); onClose(); }}
              className="flex-1 px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              Chiqish
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Saqlash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const getLocalDate = (d?: Date | number | string) => {
  const date = d ? new Date(d) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Create or update user profile
        const userRef = doc(db, 'users', currentUser.uid);
        const publicRef = doc(db, 'public_profiles', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const payload: any = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              coins: 0,
              wordsLearned: 0,
              streak: streak,
              role: 'user',
              createdAt: new Date().toISOString(),
              lastActive: new Date().toISOString()
            };
            const publicPayload: any = {
              uid: currentUser.uid,
              coins: 0,
              wordsLearned: 0,
              streak: streak
            };
            if (currentUser.displayName) {
              payload.displayName = currentUser.displayName;
              publicPayload.displayName = currentUser.displayName;
            }
            if (currentUser.photoURL) {
              payload.photoURL = currentUser.photoURL;
              publicPayload.photoURL = currentUser.photoURL;
            }
            
            await setDoc(userRef, payload);
            await setDoc(publicRef, publicPayload);
          } else {
            await setDoc(userRef, {
              lastActive: new Date().toISOString()
            }, { merge: true });
            
            // Ensure public profile is fully populated
            const userData = userSnap.data();
            const publicPayload: any = {
              uid: currentUser.uid,
              coins: userData.coins || 0,
              wordsLearned: userData.wordsLearned || 0,
              streak: streak
            };
            if (userData.displayName || currentUser.displayName) publicPayload.displayName = userData.displayName || currentUser.displayName;
            if (userData.photoURL || currentUser.photoURL) publicPayload.photoURL = userData.photoURL || currentUser.photoURL;
            if (userData.bio) publicPayload.bio = userData.bio;
            await setDoc(publicRef, publicPayload, { merge: true });
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync user profile from Firestore
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (userProfile && user) {
      const publicRef = doc(db, 'public_profiles', user.uid);
      const updateData: any = {};
      let needsUpdate = false;

      if (userProfile.displayName && userProfile.displayName !== userProfile.email) {
        updateData.displayName = userProfile.displayName;
        needsUpdate = true;
      }
      if (userProfile.photoURL) {
        updateData.photoURL = userProfile.photoURL;
        needsUpdate = true;
      }
      if (userProfile.bio) {
        updateData.bio = userProfile.bio;
        needsUpdate = true;
      }

      if (needsUpdate) {
        setDoc(publicRef, updateData, { merge: true }).catch(console.error);
      }
    }
  }, [userProfile, user]);

  // Sync words from Firestore
  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    const q = query(collection(db, `users/${user.uid}/words`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreWords: Word[] = [];
      snapshot.forEach((doc) => {
        firestoreWords.push(doc.data() as Word);
      });
      // Sort by createdAt or just set them
      _setWords(firestoreWords);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/words`);
    });
    
    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("Iltimos, brauzeringizda popuplarga ruxsat bering (Allow popups).");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const [_words, _setWords] = useState<Word[]>(() => {
    try {
      const saved = localStorage.getItem('oson-soz-words');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(w => w && typeof w === 'object' && typeof w.original === 'string').map(w => ({
            ...w,
            status: w.status === 'learned' ? 'mastered' : (w.status || 'new'),
            progress: w.progress || (w.status === 'learned' ? 100 : 0),
            createdAt: w.createdAt || new Date().toISOString()
          }));
        }
      }
    } catch (e) {
      console.error("Error parsing words from localStorage:", e);
    }
    return [
      { id: '1', original: 'Apple', translation: 'Olma', status: 'new', progress: 0, createdAt: new Date().toISOString() },
      { id: '2', original: 'Book', translation: 'Kitob', status: 'new', progress: 0, createdAt: new Date().toISOString() },
      { id: '3', original: 'Computer', translation: 'Kompyuter', status: 'new', progress: 0, createdAt: new Date().toISOString() },
    ];
  });
  const words = _words;

  const setWords = useCallback((action: React.SetStateAction<Word[]>) => {
    _setWords(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      
      if (user) {
        // Find deleted
        const nextIds = new Set(next.map(w => w.id));
        const deleted = prev.filter(w => !nextIds.has(w.id));
        deleted.forEach(w => {
          deleteDoc(doc(db, `users/${user.uid}/words/${w.id}`))
            .catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/words/${w.id}`));
        });

        // Find added or updated
        const prevMap = new Map(prev.map(w => [w.id, w]));
        next.forEach(w => {
          const p = prevMap.get(w.id);
          if (!p || JSON.stringify(p) !== JSON.stringify(w)) {
            // Sanitize object for Firestore explicitly
            const firestoreData: any = {
              id: w.id,
              userId: user.uid,
              original: w.original,
              translation: w.translation,
              status: w.status || 'new',
              progress: w.progress ?? 0,
              createdAt: w.createdAt || new Date().toISOString()
            };

            if (w.pronunciation) firestoreData.pronunciation = w.pronunciation;
            if (w.description) firestoreData.description = w.description;
            if (w.partOfSpeech) firestoreData.partOfSpeech = w.partOfSpeech;
            if (w.emoji) firestoreData.emoji = w.emoji;
            if (w.uzbekExplanation) firestoreData.uzbekExplanation = w.uzbekExplanation;
            if (w.passedQuiz !== undefined) firestoreData.passedQuiz = w.passedQuiz;
            if (w.passedFlashcards !== undefined) firestoreData.passedFlashcards = w.passedFlashcards;
            if (w.passedListening !== undefined) firestoreData.passedListening = w.passedListening;
            if (w.passedMatching !== undefined) firestoreData.passedMatching = w.passedMatching;
            if (w.passedSpelling !== undefined) firestoreData.passedSpelling = w.passedSpelling;

            setDoc(doc(db, `users/${user.uid}/words/${w.id}`), firestoreData)
              .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/words/${w.id}`));
          }
        });
      }
      
      return next;
    });
  }, [user]);

  const [activeTab, setActiveTab] = useState<'list' | 'study' | 'topics' | 'practice' | 'stats' | 'admin'>('topics');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Telegram Mini App temasini aniqlash
    if (tg) return tg.colorScheme === 'dark';
    try { return localStorage.getItem('oson-soz-theme') === 'dark'; } catch { return false; }
  });
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'shavkatovakbarali75@gmail.com';
  const [streak, setStreak] = useState(() => {
    try {
      const saved = localStorage.getItem('oson-soz-streak');
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = getLocalDate();
        const yesterday = getLocalDate(Date.now() - 86400000);
        
        // Recover streak for the user if it dropped today
        if ((parsed.count < 3) && parsed.lastActive === today && localStorage.getItem('oson-soz-recovered') !== 'true') {
           // We will let the interval or userProfile handle full sync, but we can temporarily give 3 here
        }

        if (parsed.lastActive === today) return parsed.count;
        if (parsed.lastActive === yesterday) return parsed.count;
        return 0; // Streak broken
      }
    } catch { return 0; }
    return 0;
  });

  const [stats, setStats] = useState<Record<string, DailyStats>>(() => {
    try {
      const saved = localStorage.getItem('oson-soz-stats');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [_coins, _setCoins] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('oson-soz-coins');
      return saved ? parseInt(saved, 10) : 0;
    } catch (e) {
      return 0;
    }
  });
  const coins = _coins;
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevelReached, setNewLevelReached] = useState(1);
  const [newTitleReached, setNewTitleReached] = useState('');

  const totalLearned = useMemo(() => words.filter(w => w.status === 'mastered').length, [words]);

  useEffect(() => {
    if (user && words.length > 0) {
      const badges = [
        { threshold: 5, name: 'Boshlovchi' },
        { threshold: 20, name: 'Shogird' },
        { threshold: 50, name: 'Bilimdon' },
        { threshold: 100, name: 'Usta' },
        { threshold: 300, name: 'Afsona' },
        { threshold: 1000, name: 'Titan' },
      ];

      const currentTitle = badges.reverse().find(b => totalLearned >= b.threshold)?.name || 'Navqiron';
      
        const publicPayload: any = { 
          uid: user.uid, 
          wordsLearned: totalLearned,
          streak: streak,
          coins: userProfile?.coins || 0
        };
        // Prefer firestore profile data if it exists, otherwise fallback to auth user
        if (userProfile?.displayName) publicPayload.displayName = userProfile.displayName;
        else if (user.displayName) publicPayload.displayName = user.displayName;
        
        if (userProfile?.photoURL) publicPayload.photoURL = userProfile.photoURL;
        else if (user.photoURL) publicPayload.photoURL = user.photoURL;

        setDoc(doc(db, 'users', user.uid), { wordsLearned: totalLearned }, { merge: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
        setDoc(doc(db, 'public_profiles', user.uid), publicPayload, { merge: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `public_profiles/${user.uid}`));

      // Check for title milestone
      const lastLearned = parseInt(localStorage.getItem('last-learned-count') || '0');
      if (totalLearned > lastLearned) {
        const justReached = badges.find(b => totalLearned === b.threshold);
        if (justReached) {
          setNewTitleReached(justReached.name);
          setShowLevelUp(true);
          setTimeout(() => setShowLevelUp(false), 8000);
        }
        localStorage.setItem('last-learned-count', totalLearned.toString());
      }
    }
  }, [totalLearned, user, words.length]);

  const setCoins = useCallback((action: React.SetStateAction<number>) => {
    _setCoins(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      if (user && prev !== next) {
        setDoc(doc(db, 'users', user.uid), { coins: next }, { merge: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
          
        const publicPayload: any = { uid: user.uid, coins: next };
        // Prefer firestore profile data if it exists, otherwise fallback to auth user
        if (userProfile?.displayName) publicPayload.displayName = userProfile.displayName;
        else if (user.displayName) publicPayload.displayName = user.displayName;
        
        if (userProfile?.photoURL) publicPayload.photoURL = userProfile.photoURL;
        else if (user.photoURL) publicPayload.photoURL = user.photoURL;
        
        setDoc(doc(db, 'public_profiles', user.uid), publicPayload, { merge: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `public_profiles/${user.uid}`));
      }
      localStorage.setItem('oson-soz-coins', next.toString());
      return next;
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.coins !== undefined) _setCoins(data.coins);
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    try {
      localStorage.setItem('oson-soz-words', JSON.stringify(words));
    } catch (e) {
      console.error("Error saving words to localStorage:", e);
    }
  }, [words]);

  useEffect(() => {
    try {
      localStorage.setItem('oson-soz-stats', JSON.stringify(stats));
    } catch (e) {
      console.error("Error saving stats to localStorage:", e);
    }
  }, [stats]);

  useEffect(() => {
    try {
      localStorage.setItem('oson-soz-coins', coins.toString());
    } catch (e) {}
  }, [coins]);

  useEffect(() => {
    try {
      localStorage.setItem('oson-soz-theme', isDarkMode ? 'dark' : 'light');
    } catch (e) {
      console.error("Error saving theme to localStorage:", e);
    }
  }, [isDarkMode]);

  // Daily Timer
  useEffect(() => {
    const timer = setInterval(() => {
      const today = getLocalDate();
      const yesterday = getLocalDate(Date.now() - 86400000);
      
      setStats(prev => {
        const current = prev[today] || { timeSpent: 0, wordsLearned: 0 };
        return {
          ...prev,
          [today]: { ...current, timeSpent: current.timeSpent + 1 }
        };
      });
      
      // Update streak if active today
      setStreak(prev => {
        try {
          const saved = localStorage.getItem('oson-soz-streak');
          const parsed = saved ? JSON.parse(saved) : { count: 0, lastActive: '' };
          if (parsed.lastActive !== today) {
            let newCount = parsed.lastActive === yesterday ? parsed.count + 1 : 1;
            
            // Temporary fix for the reported timezone bug that dropped the streak
            if (user && user.email === 'shavkatovakbarali75@gmail.com' && today === '2026-05-04' && newCount < 3) {
              newCount = 3;
            }

            const streakData = { count: newCount, lastActive: today };
            localStorage.setItem('oson-soz-streak', JSON.stringify(streakData));
            
            // Sync to Firestore if user exists
            if (user) {
              setDoc(doc(db, 'users', user.uid), { streak: newCount }, { merge: true });
              setDoc(doc(db, 'public_profiles', user.uid), { uid: user.uid, streak: newCount }, { merge: true });
            }
            
            return newCount;
          } else if (user && user.email === 'shavkatovakbarali75@gmail.com' && today === '2026-05-04' && parsed.count < 3) {
            // Fix if they already logged in today and it saved as 1
            const newCount = 3;
            const streakData = { count: newCount, lastActive: today };
            localStorage.setItem('oson-soz-streak', JSON.stringify(streakData));
            setDoc(doc(db, 'users', user.uid), { streak: newCount }, { merge: true });
            setDoc(doc(db, 'public_profiles', user.uid), { uid: user.uid, streak: newCount }, { merge: true });
            return newCount;
          }
        } catch (e) {}
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#0f0f11] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-200 dark:selection:bg-purple-500/30 transition-colors duration-500">
        <header className="bg-white/80 dark:bg-[#0f0f11]/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm sticky top-0 z-20 transition-colors duration-500">
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-3">
            {/* Top Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Logo className="w-32 h-auto" />
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/50">
                  <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-slate-300 dark:text-slate-600'}`} />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{streak}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/50">
                  <span className="text-xl">🪙</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{coins}</span>
                </div>

                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {user ? (
                  <button 
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-br from-[#a855f7] to-[#280056]">
                      {userProfile?.photoURL || user.photoURL ? (
                        <img src={userProfile?.photoURL || user.photoURL || ''} alt="Profile" className="w-full h-full rounded-full object-cover bg-white dark:bg-slate-800" />
                      ) : (
                        <div className="w-full h-full rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-500 font-bold">
                          {(userProfile?.displayName || user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-full shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCircle className="w-5 h-5" />}
                    <span className="hidden sm:inline">Kirish</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Row - Tabs */}
            <div className="flex bg-slate-100/80 dark:bg-slate-800/50 p-1.5 rounded-xl shadow-inner overflow-x-auto hide-scrollbar border border-slate-200/50 dark:border-slate-700/50">
              <button
                onClick={() => setActiveTab('topics')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'topics' ? 'bg-white dark:bg-slate-700 text-purple-500 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Compass className="w-4 h-4" />
                <span>Mavzular</span>
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'list' ? 'bg-white dark:bg-slate-700 text-cyan-500 dark:text-cyan-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <List className="w-4 h-4" />
                <span>Lug'at</span>
              </button>
              <button
                onClick={() => setActiveTab('study')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'study' ? 'bg-white dark:bg-slate-700 text-lime-500 dark:text-lime-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Play className="w-4 h-4" />
                <span>Yodlash</span>
              </button>
              <button
                onClick={() => setActiveTab('practice')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'practice' ? 'bg-white dark:bg-slate-700 text-purple-500 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <Dumbbell className="w-4 h-4" />
                <span>Mashq</span>
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'stats' ? 'bg-white dark:bg-slate-700 text-cyan-500 dark:text-cyan-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <BarChart2 className="w-4 h-4" />
                <span>Reyting</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'admin' ? 'bg-white dark:bg-slate-700 text-rose-500 dark:text-rose-400 shadow-sm scale-[1.02]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Panel</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'topics' && <TopicsTab words={words} setWords={setWords} />}
            {activeTab === 'list' && <DictionaryTab words={words} setWords={setWords} />}
            {activeTab === 'study' && <StudyTab words={words} setWords={setWords} />}
            {activeTab === 'practice' && <PracticeTab words={words} setWords={setWords} setStats={setStats} setCoins={setCoins} />}
            {activeTab === 'stats' && <StatsTab words={words} stats={stats} userProfile={userProfile} streak={streak} />}
            {activeTab === 'admin' && isAdmin && <AdminTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {showProfileModal && user && (
        <ProfileModal 
          user={user} 
          userProfile={userProfile} 
          onClose={() => setShowProfileModal(false)} 
        />
      )}

      <AnimatePresence>
        {showLevelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border-2 border-white/20 backdrop-blur-xl"
          >
            <div className="bg-white/20 p-3 rounded-2xl">
              <Trophy className="w-8 h-8 text-yellow-300 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-bold opacity-80 uppercase tracking-widest text-indigo-100">Yangi Daraja!</p>
              <h3 className="text-2xl font-black italic">"{newTitleReached}" darajasiga chiqdingiz! 🚀</h3>
            </div>
            <button onClick={() => setShowLevelUp(false)} className="ml-4 hover:scale-110 transition-transform">
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function TopicsTab({ words, setWords }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>> }) {
  const TOPICS = [
    { id: 'shopping', name: 'Xaridlar', icon: ShoppingBag, color: 'bg-pink-100 text-pink-600', border: 'border-pink-200' },
    { id: 'travel', name: 'Sayohat', icon: Plane, color: 'bg-sky-100 text-sky-600', border: 'border-sky-200' },
    { id: 'food', name: 'Ovqat', icon: Coffee, color: 'bg-amber-100 text-amber-600', border: 'border-amber-200' },
    { id: 'business', name: 'Biznes', icon: Briefcase, color: 'bg-emerald-100 text-emerald-600', border: 'border-emerald-200' },
    { id: 'education', name: 'Ta\'lim', icon: GraduationCap, color: 'bg-indigo-100 text-indigo-600', border: 'border-indigo-200' },
    { id: 'sports', name: 'Sport', icon: Trophy, color: 'bg-orange-100 text-orange-600', border: 'border-orange-200' },
  ];

  const LEVELS = [
    { id: 'A1-A2', name: 'Boshlang\'ich (A1-A2)', desc: 'Eng ko\'p ishlatiladigan oddiy so\'zlar' },
    { id: 'B1-B2', name: 'O\'rta (B1-B2)', desc: 'Kundalik muloqot uchun kerakli so\'zlar' },
    { id: 'C1-C2', name: 'Murakkab (C1-C2)', desc: 'Murakkab va professional atamalar' },
  ];

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('A1-A2');
  const [generatedWords, setGeneratedWords] = useState<{original: string, translation: string, pronunciation?: string, description?: string, partOfSpeech?: string, emoji?: string, uzbekExplanation?: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    const activeTopic = customTopic.trim() || TOPICS.find(t => t.id === selectedTopic)?.name;
    if (!activeTopic) return;
    
    setIsGenerating(true);
    setGeneratedWords([]);
    setAddedWords(new Set());

    try {
      const prompt = `Generate 10 English vocabulary words related to the topic "${activeTopic}" at the "${selectedLevel}" difficulty level. Provide the Uzbek translation, the English pronunciation (phonetic spelling or IPA), a short description or example sentence in English, the part of speech in English (e.g., noun, verb, adj), a single relevant emoji, and a short explanation in Uzbek of how and when to use this word (uzbekExplanation). 
      IMPORTANT: The 'uzbekExplanation' MUST be a GENERAL definition and usage guide for the word, NOT specific to the topic "${activeTopic}". For example, if the topic is "strong men" and the word is "calm", the explanation should be about being calm in general, not just about calm men.
      IMPORTANT: Randomize your selection! Do not return the most common words every time. Pick different words to ensure variety if asked multiple times.
      Return ONLY a JSON array of objects with 'original', 'translation', 'pronunciation', 'description', 'partOfSpeech', 'emoji', and 'uzbekExplanation' string properties. Do not include markdown formatting like \`\`\`json.`;
      
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (!response.text) {
        throw new Error("No text returned from model");
      }

      let jsonText = response.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      }

      const newWords = JSON.parse(jsonText);
      if (Array.isArray(newWords)) {
        setGeneratedWords(newWords);
      } else {
        throw new Error("Generated content is not an array");
      }
    } catch (error: any) {
      console.error("Error generating words:", error);
      if (error?.message?.includes("permission denied") || error?.message?.includes("403")) {
        alert("Sun'iy intellektga ulanishda xatolik: Ruxsat etilmadi. Agar siz ushbu ilovaga ulashilgan ssilka orqali kirgan bo'lsangiz, iltimos Google akkauntingiz orqali tizimga kiring (Sign in).");
      } else {
        alert("So'zlarni yaratishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddWord = (word: {original: string, translation: string, pronunciation?: string, description?: string, partOfSpeech?: string, emoji?: string, uzbekExplanation?: string}) => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    setWords(prev => [{
      id: newId,
      original: word.original,
      translation: word.translation,
      pronunciation: word.pronunciation,
      description: word.description,
      partOfSpeech: word.partOfSpeech,
      emoji: word.emoji,
      uzbekExplanation: word.uzbekExplanation,
      status: 'new',
      progress: 0,
      createdAt: new Date().toISOString()
    }, ...prev]);
    setAddedWords(prev => new Set(prev).add(word.original));
  };

  const handleAddAll = () => {
    const wordsToAdd = generatedWords.filter(w => !addedWords.has(w.original));
    if (wordsToAdd.length === 0) return;

    const newEntries = wordsToAdd.map(w => ({
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      original: w.original,
      translation: w.translation,
      pronunciation: w.pronunciation,
      description: w.description,
      partOfSpeech: w.partOfSpeech,
      emoji: w.emoji,
      uzbekExplanation: w.uzbekExplanation,
      status: 'new' as const,
      progress: 0,
      createdAt: new Date().toISOString()
    }));

    setWords(prev => [...newEntries, ...prev]);
    setAddedWords(new Set(generatedWords.map(w => w.original)));
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">Yangi so'zlarni kashf qiling</h2>
        <p className="text-slate-600 dark:text-slate-400">Qiziqqan mavzuyingizni va darajangizni tanlang. Sun'iy intellekt siz uchun maxsus so'zlar ro'yxatini tuzib beradi.</p>
      </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-xl shadow-purple-100/50 dark:shadow-none border border-white dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">1. Mavzuni tanlang yoki yozing</h3>
        <div className="mb-6">
          <input
            type="text"
            placeholder="O'zingiz xohlagan mavzuni yozing (masalan: Kosmos, Texnologiya...)"
            value={customTopic}
            onChange={(e) => {
              setCustomTopic(e.target.value);
              if (e.target.value) setSelectedTopic(null);
            }}
            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {TOPICS.map(topic => {
            const Icon = topic.icon;
            const isSelected = selectedTopic === topic.id && !customTopic;
            return (
              <button
                key={topic.id}
                onClick={() => {
                  setSelectedTopic(topic.id);
                  setCustomTopic('');
                }}
                className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center gap-3 ${
                  isSelected 
                    ? `border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-md scale-[1.02]` 
                    : `border-transparent bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-[1.02]`
                }`}
              >
                <div className={`p-3 rounded-xl ${topic.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className={`font-semibold ${isSelected ? 'text-purple-700 dark:text-purple-400' : 'text-slate-700 dark:text-slate-300'}`}>{topic.name}</span>
              </button>
            );
          })}
        </div>

        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">2. Darajani tanlang</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {LEVELS.map(level => (
            <button
              key={level.id}
              onClick={() => setSelectedLevel(level.id)}
              className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                selectedLevel === level.id 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-md scale-[1.02]' 
                  : 'border-transparent bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-[1.02]'
              }`}
            >
              <div className={`font-bold mb-1 ${selectedLevel === level.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-100'}`}>{level.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{level.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={(!selectedTopic && !customTopic.trim()) || isGenerating}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-[1.01] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              So'zlar tayyorlanmoqda...
            </>
          ) : (
            <>
              <Sparkles className="w-6 h-6" />
              So'zlarni yaratish
            </>
          )}
        </button>
      </div>

      {generatedWords.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-xl shadow-purple-100/50 dark:shadow-none border border-white dark:border-slate-700"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Tavsiya etilgan so'zlar</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Ushbu so'zlarni lug'atingizga qo'shing va yodlashni boshlang.</p>
            </div>
            <button
              onClick={handleAddAll}
              disabled={addedWords.size === generatedWords.length}
              className="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 font-semibold rounded-xl hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Barchasini qo'shish
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generatedWords.map((word, idx) => {
              const isAdded = addedWords.has(word.original);
              return (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-100 dark:border-slate-600 hover:border-indigo-100 dark:hover:border-indigo-500/50 transition-colors">
                  <div className="flex items-start gap-3">
                    {word.emoji && <div className="text-2xl mt-0.5 shrink-0">{word.emoji}</div>}
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2 flex-wrap">
                        {word.original}
                        {word.partOfSpeech && <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md italic">{word.partOfSpeech}</span>}
                        {word.pronunciation && <span className="text-sm font-normal text-slate-400 dark:text-slate-500">[{word.pronunciation}]</span>}
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 font-medium">{word.translation}</div>
                      {word.description && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{word.description}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddWord(word)}
                    disabled={isAdded}
                    className={`p-2.5 rounded-xl transition-all ${
                      isAdded 
                        ? 'bg-[#a855f7]/20 dark:bg-[#a855f7]/10 text-[#280056] dark:text-[#a855f7]' 
                        : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isAdded ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function DictionaryTab({ words, setWords }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>> }) {
  const [newOriginal, setNewOriginal] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newPronunciation, setNewPronunciation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPartOfSpeech, setNewPartOfSpeech] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newUzbekExplanation, setNewUzbekExplanation] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'learning' | 'ready_for_exam' | 'mastered'>('all');

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(words));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "oson-soz-lugat.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedWords = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedWords)) {
          setWords(prev => {
            const newWords = [...prev];
            importedWords.forEach(iw => {
              if (iw.original && !newWords.find(w => w.original.toLowerCase() === iw.original.toLowerCase())) {
                newWords.push({
                  ...iw, 
                  id: Date.now().toString() + Math.random().toString(36).substring(7),
                  status: iw.status || 'new',
                  progress: iw.progress || 0
                });
              }
            });
            return newWords;
          });
          alert("Lug'at muvaffaqiyatli yuklandi!");
        }
      } catch (err) {
        alert("Faylni o'qishda xatolik yuz berdi. Iltimos, to'g'ri JSON fayl tanlang.");
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

    const handleSuggest = async () => {
    if (!newOriginal.trim()) return;
    setIsSuggesting(true);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Analyze the word "${newOriginal.trim()}". If it is misspelled, correct it. Then provide the correct spelling (original), the Uzbek translation, English pronunciation (IPA), a short English description/example, the part of speech in English (e.g., noun, verb), a single relevant emoji, and a short explanation in Uzbek of how and when to use this word (uzbekExplanation). 
        IMPORTANT: The 'uzbekExplanation' MUST be a GENERAL definition and usage guide for the word.
        Return ONLY a JSON object with 'original', 'translation', 'pronunciation', 'description', 'partOfSpeech', 'emoji', and 'uzbekExplanation' string properties. Do not include markdown formatting like \`\`\`json.`,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      if (!response.text) {
        throw new Error("No text returned from model");
      }

      let jsonText = response.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      }
      const data = JSON.parse(jsonText);
      
      if (data && typeof data === 'object') {
        if (data.original) setNewOriginal(data.original);
        if (data.translation) setNewTranslation(data.translation);
        if (data.pronunciation) setNewPronunciation(data.pronunciation);
        if (data.description) setNewDescription(data.description);
        if (data.partOfSpeech) setNewPartOfSpeech(data.partOfSpeech);
        if (data.emoji) setNewEmoji(data.emoji);
        if (data.uzbekExplanation) setNewUzbekExplanation(data.uzbekExplanation);
      } else {
        throw new Error("Parsed data is not an object");
      }
    } catch (error: any) {
      console.error("Error suggesting word details:", error);
      if (error?.message?.includes("permission denied") || error?.message?.includes("403")) {
        alert("Sun'iy intellektga ulanishda xatolik: Ruxsat etilmadi. Iltimos Google akkauntingiz orqali tizimga kiring (Sign in).");
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOriginal.trim() || !newTranslation.trim()) return;
    
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    setWords(prev => [{
      id: newId,
      original: newOriginal.trim(),
      translation: newTranslation.trim(),
      pronunciation: newPronunciation.trim() || undefined,
      description: newDescription.trim() || undefined,
      partOfSpeech: newPartOfSpeech.trim() || undefined,
      emoji: newEmoji.trim() || undefined,
      uzbekExplanation: newUzbekExplanation.trim() || undefined,
      status: 'new',
      progress: 0,
      createdAt: new Date().toISOString()
    }, ...prev]);
    
    setNewOriginal('');
    setNewTranslation('');
    setNewPronunciation('');
    setNewDescription('');
    setNewPartOfSpeech('');
    setNewEmoji('');
    setNewUzbekExplanation('');
  };

  const handleDelete = (id: string) => {
    setWords(prev => {
      return prev.map(w => {
        if (w.id === id) {
          if (filter === 'all') {
            if (w.status === 'mastered') {
              return { ...w, hiddenInAll: true };
            }
            return null;
          } else if (filter === 'mastered') {
            return { ...w, status: 'new', progress: 0, hiddenInAll: false };
          } else {
            return null;
          }
        }
        return w;
      }).filter(Boolean) as Word[];
    });
  };

  const filteredWords = words.filter(w => {
    if (filter === 'all') return !w.hiddenInAll;
    return w.status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mening Lug'atim</h2>
        <div className="flex gap-2">
          <label className="cursor-pointer px-4 py-2 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-semibold rounded-xl hover:bg-cyan-50 dark:hover:bg-slate-700 transition-colors border border-cyan-100 dark:border-slate-700 flex items-center gap-2 shadow-sm">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Yuklash</span>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 font-semibold rounded-xl hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors border border-purple-100 dark:border-slate-700 flex items-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Saqlash</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
          <Plus className="w-6 h-6 text-cyan-500" />
          Yangi so'z qo'shish
        </h2>
        
        <form onSubmit={handleAddWord} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Inglizcha so'z *"
                value={newOriginal}
                onChange={e => setNewOriginal(e.target.value)}
                className="flex-1 px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
                required
              />
              <button
                type="button"
                onClick={handleSuggest}
                disabled={!newOriginal.trim() || isSuggesting}
                className="px-4 py-3 bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded-xl hover:bg-cyan-200 dark:hover:bg-cyan-500/30 transition-colors disabled:opacity-50 flex items-center justify-center"
                title="Tarjima va ta'rifni avtomatik to'ldirish"
              >
                {isSuggesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              </button>
            </div>
            <input
              type="text"
              placeholder="O'zbekcha tarjimasi *"
              value={newTranslation}
              onChange={e => setNewTranslation(e.target.value)}
              className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
              required
            />
            <input
              type="text"
              placeholder="So'z turkumi (noun, verb...)"
              value={newPartOfSpeech}
              onChange={e => setNewPartOfSpeech(e.target.value)}
              className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
            />
            <input
              type="text"
              placeholder="O'qilishi (masalan: /æpl/)"
              value={newPronunciation}
              onChange={e => setNewPronunciation(e.target.value)}
              className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
            />
            <input
              type="text"
              placeholder="Emoji (masalan: 🍎)"
              value={newEmoji}
              onChange={e => setNewEmoji(e.target.value)}
              className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
            />
            <input
              type="text"
              placeholder="Ta'rifi yoki misol"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              className="sm:col-span-2 px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
            />
            <input
              type="text"
              placeholder="O'zbekcha izoh (qanday ishlatilishi)"
              value={newUzbekExplanation}
              onChange={e => setNewUzbekExplanation(e.target.value)}
              className="sm:col-span-2 px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-medium"
            />
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={!newOriginal.trim() || !newTranslation.trim()}
              className="w-full sm:w-auto bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Qo'shish
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden">
        <div className="px-6 md:px-8 py-5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sizning lug'atingiz</h2>
          
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filter === 'all' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Barchasi ({words.length})
            </button>
            <button 
              onClick={() => setFilter('new')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filter === 'new' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Yangi ({words.filter(w => w.status === 'new').length})
            </button>
            <button 
              onClick={() => setFilter('learning')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filter === 'learning' ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              O'rganilmoqda ({words.filter(w => w.status === 'learning').length})
            </button>
            <button 
              onClick={() => setFilter('ready_for_exam')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filter === 'ready_for_exam' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              Testga tayyor ({words.filter(w => w.status === 'ready_for_exam').length})
            </button>
            <button 
              onClick={() => setFilter('mastered')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 ${filter === 'mastered' ? 'bg-lime-100 dark:bg-lime-500/20 text-lime-700 dark:text-lime-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              <Sparkles className="w-3 h-3" /> Yodlangan ({words.filter(w => w.status === 'mastered').length})
            </button>
          </div>
        </div>
        
        {filteredWords.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <BookOpen className="w-16 h-16 text-slate-200 dark:text-slate-700 mb-4" />
            <p className="text-lg font-medium">Hali so'zlar yo'q.</p>
            <p className="text-sm mt-1">Yuqoridan yangi so'z qo'shing yoki "Mavzular" bo'limidan kashf qiling.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filteredWords.map(word => (
              <li key={word.id} className="px-6 md:px-8 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group">
                <div className="flex items-start gap-4">
                  {word.emoji && (
                    <div className="text-3xl shrink-0 mt-1">{word.emoji}</div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">{word.original}</p>
                      {word.partOfSpeech && <span className="text-xs font-semibold text-cyan-500 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-2 py-0.5 rounded-md italic">{word.partOfSpeech}</span>}
                      {word.pronunciation && <span className="text-sm font-normal text-slate-400 dark:text-slate-500">[{word.pronunciation}]</span>}
                      
                      {/* Status Badge */}
                      {word.status === 'mastered' && <span className="text-xs font-bold text-lime-600 dark:text-lime-400 bg-lime-100 dark:bg-lime-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3"/> Yodlangan</span>}
                      {word.status === 'ready_for_exam' && <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20 px-2 py-0.5 rounded-full">Testga tayyor</span>}
                      {word.status === 'learning' && <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20 px-2 py-0.5 rounded-full">O'rganilmoqda ({word.progress}%)</span>}
                      {word.status === 'new' && <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">Yangi</span>}

                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">{word.translation}</p>
                    {word.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{word.description}</p>}
                    {word.uzbekExplanation && <p className="text-sm text-cyan-600 dark:text-cyan-400 mt-1 italic">{word.uzbekExplanation}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(word.id)}
                  className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  title="O'chirish"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StudyTab({ words, setWords }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>> }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [examples, setExamples] = useState<string | null>(null);
  const [isLoadingExamples, setIsLoadingExamples] = useState(false);
  const [generatingEmojis, setGeneratingEmojis] = useState<Set<string>>(new Set());
  const [failedEmojis, setFailedEmojis] = useState<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);

  const safeIndex = Math.max(0, Math.min(currentIndex, words.length - 1));
  const currentWord = words[safeIndex];

  useEffect(() => {
    if (currentWord && !currentWord.emoji && !generatingEmojis.has(currentWord.id) && !failedEmojis.has(currentWord.id)) {
      generateEmojiForWord(currentWord);
    }
  }, [currentWord, generatingEmojis, failedEmojis]);

  const generateEmojiForWord = async (word: Word) => {
    setGeneratingEmojis(prev => new Set(prev).add(word.id));
    
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Provide a single relevant emoji for the English word "${word.original}". Return ONLY the emoji character, nothing else.`,
      });
      
      const emoji = response.text?.trim();
      if (emoji && emoji.length > 0 && emoji.length <= 10) { // basic check to ensure it's likely an emoji
        setWords(prev => prev.map(w => w.id === word.id ? { ...w, emoji } : w));
      } else {
        setFailedEmojis(prev => new Set(prev).add(word.id));
      }
    } catch (error) {
      console.error("Error generating emoji:", error);
      setFailedEmojis(prev => new Set(prev).add(word.id));
    } finally {
      setGeneratingEmojis(prev => {
        const next = new Set(prev);
        next.delete(word.id);
        return next;
      });
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && currentWord.status === 'new') {
      setWords(prev => prev.map(w => w.id === currentWord.id ? { ...w, status: 'learning' } : w));
    }
  };

  if (words.length === 0) {
    return (
      <div className="text-center py-20 bg-white/80 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-indigo-100/50">
        <Trophy className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Lug'at bo'sh</h2>
        <p className="text-slate-500">Yodlashni boshlash uchun avval so'z qo'shing.</p>
      </div>
    );
  }

  const handleNext = () => {
    setIsFlipped(false);
    setExamples(null);
    setCurrentIndex((safeIndex + 1) % words.length);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setExamples(null);
    setCurrentIndex((safeIndex - 1 + words.length) % words.length);
  };

  const playTTS = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSpeaking) return;
    
    setIsSpeaking(true);
    
    // Use Browser TTS for instant feedback
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(currentWord.original);
      utterance.lang = 'en-US';
      utterance.rate = 0.85; // Slightly slower for better clarity
      utterance.pitch = 1.1; // Slightly higher pitch for a more female-sounding voice
      
      // Try to find a high-quality female voice
      const voices = window.speechSynthesis.getVoices();
      
      // Preferred female voices across different platforms
      const preferredFemaleVoices = [
        'Google US English', // Chrome/Android
        'Microsoft Zira',    // Windows
        'Samantha',          // macOS/iOS
        'Victoria',          // macOS
        'Karen',             // iOS/macOS (AU)
        'Moira',             // macOS (IE)
        'Tessa',             // macOS (ZA)
        'English (United States)',
        'en-US'
      ];

      // Find a voice that matches our preferred list and is female
      let voice = voices.find(v => 
        v.lang.startsWith('en') && 
        preferredFemaleVoices.some(pv => v.name.includes(pv))
      );

      // If no preferred voice, just try to find any female-sounding one
      if (!voice) {
        voice = voices.find(v => 
          v.lang.startsWith('en') && 
          (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('girl') || v.name.toLowerCase().includes('woman'))
        );
      }

      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
    }
  };

  const fetchExamples = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoadingExamples || examples) return;
    
    setIsLoadingExamples(true);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Find 2 short, simple example sentences for the English word "${currentWord.original}". Provide the sentences and their Uzbek translations. Format nicely.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      setExamples(response.text || "Misollar topilmadi.");
    } catch (error: any) {
      console.error("Search error:", error);
      if (error?.message?.includes("permission denied") || error?.message?.includes("403")) {
        setExamples("Ruxsat etilmadi. Iltimos Google akkauntingiz orqali tizimga kiring (Sign in).");
      } else {
        setExamples("Misollarni yuklashda xatolik yuz berdi.");
      }
    } finally {
      setIsLoadingExamples(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-8 bg-white dark:bg-slate-800 px-6 py-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50">
        <span className="font-bold text-slate-700 dark:text-slate-300">So'z {safeIndex + 1} / {words.length}</span>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
              style={{ width: `${((safeIndex + 1) / words.length) * 100}%` }}
            />
          </div>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{Math.round(((safeIndex + 1) / words.length) * 100)}%</span>
        </div>
      </div>

      {/* Flashcard */}
      <div 
        className="w-full perspective-1000 cursor-pointer mb-10 relative group"
        onClick={handleFlip}
      >
        <motion.div
          className="w-full relative preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        >
          {/* Front */}
          <div className="w-full relative backface-hidden bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-center p-8 pb-20 transition-transform duration-300 min-h-[600px] sm:min-h-[650px]">
            
            {/* Emoji Section */}
            <div className="w-32 h-32 sm:w-40 sm:h-40 mb-6 rounded-3xl overflow-hidden bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center border border-slate-100 dark:border-slate-600 shadow-inner relative shrink-0">
              {currentWord.emoji ? (
                <span className="text-7xl sm:text-8xl">{currentWord.emoji}</span>
              ) : generatingEmojis.has(currentWord.id) ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <span className="text-xs font-medium">Kutmoqda...</span>
                </div>
              ) : (
                <div className="text-slate-300">
                  <ImageIcon className="w-12 h-12 opacity-50" />
                </div>
              )}
            </div>

            <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
              {currentWord.status === 'mastered' && <span className="text-xs font-bold text-lime-600 bg-lime-100 dark:bg-lime-900/30 dark:text-lime-400 px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm"><Sparkles className="w-3 h-3"/> Yodlangan</span>}
              {currentWord.status === 'ready_for_exam' && <span className="text-xs font-bold text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 px-3 py-1.5 rounded-full shadow-sm">Testga tayyor</span>}
              {currentWord.status === 'learning' && <span className="text-xs font-bold text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400 px-3 py-1.5 rounded-full shadow-sm">O'rganilmoqda ({currentWord.progress}%)</span>}
              {currentWord.status === 'new' && <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full shadow-sm">Yangi</span>}
            </div>

            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100 mb-4 text-center break-words w-full leading-normal py-2">
              {currentWord.original}
            </h2>
            <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
              {currentWord.partOfSpeech && (
                <span className="text-sm font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-3 py-1 rounded-lg italic">{currentWord.partOfSpeech}</span>
              )}
              {currentWord.pronunciation && (
                <p className="text-xl text-slate-400 dark:text-slate-500 font-mono">[{currentWord.pronunciation}]</p>
              )}
            </div>
            {currentWord.description && (
              <p className="text-slate-600 dark:text-slate-300 text-center text-base mb-10 max-w-md leading-relaxed">
                {currentWord.description}
              </p>
            )}
            <p className="text-slate-400 dark:text-slate-500 font-medium text-sm absolute bottom-8 bg-slate-50 dark:bg-slate-700/50 px-4 py-2 rounded-full">Aylantirish uchun bosing</p>
            
            <button 
              onClick={playTTS}
              disabled={isSpeaking}
              className={`absolute top-6 right-6 sm:top-8 sm:right-8 p-3 sm:p-4 rounded-2xl transition-all shadow-sm ${isSpeaking ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-400 cursor-not-allowed' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:scale-110'}`}
              title="Talaffuzni eshitish"
            >
              {isSpeaking ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>

          {/* Back */}
          <div 
            className="absolute top-0 left-0 w-full h-full backface-hidden bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-[2.5rem] shadow-2xl shadow-purple-200/50 border-2 border-indigo-400/30 flex flex-col items-center justify-center p-8 transition-transform duration-300 overflow-y-auto"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <div className="flex flex-col items-center justify-center w-full min-h-full py-10">
              <h2 className="text-4xl sm:text-5xl font-extrabold mb-4 text-center break-words w-full drop-shadow-md leading-normal py-2">
                {currentWord.translation}
              </h2>
              {currentWord.uzbekExplanation && (
                <div className="mt-6 p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 max-w-sm w-full">
                  <p className="text-indigo-100 text-sm font-semibold mb-1 uppercase tracking-wider">Qanday ishlatiladi:</p>
                  <p className="text-white text-lg leading-relaxed">
                    {currentWord.uzbekExplanation}
                  </p>
                </div>
              )}
            </div>
            <p className="text-indigo-100 font-medium text-sm absolute bottom-8 bg-white/10 px-4 py-2 rounded-full backdrop-blur-md">Aylantirish uchun bosing</p>
          </div>
        </motion.div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 w-full justify-center mb-8">
        <button 
          onClick={handlePrev}
          className="p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:scale-105 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <button 
          onClick={fetchExamples}
          disabled={isLoadingExamples || !!examples}
          className="flex-1 max-w-[220px] py-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-2 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
        >
          {isLoadingExamples ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />}
          Misollar ko'rish
        </button>

        <button 
          onClick={handleNext}
          className="p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:scale-105 active:scale-95 transition-all"
        >
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>

      {/* Examples Area */}
      <AnimatePresence>
        {examples && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-indigo-100/50 dark:shadow-none border border-white dark:border-slate-700"
          >
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              Misollar (Google Search)
            </h3>
            <div className="text-slate-700 dark:text-slate-300 max-w-none font-medium leading-relaxed [&>p]:mb-4 [&>strong]:text-slate-900 dark:[&>strong]:text-white">
              <ReactMarkdown>{examples}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // limit is 500 for admin to see more users
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500));
        const snap = await getDocs(q);
        setUsers(snap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch (err) {
        console.error("Admin fetch error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const totalCoins = users.reduce((acc, u) => acc + (u.coins || 0), 0);
  const totalWords = users.reduce((acc, u) => acc + (u.wordsLearned || 0), 0);
  const activeStreakUsers = users.filter(u => (u.streak || 0) > 0).length;

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1a1a1f] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Jami Foydalanuvchilar</p>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{users.length}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white dark:bg-[#1a1a1f] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Faollar (O't &gt; 0)</p>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{activeStreakUsers}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
            <Flame className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white dark:bg-[#1a1a1f] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Yodlangan so'zlar</p>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{totalWords}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white dark:bg-[#1a1a1f] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Tiroj (Tangalar)</p>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{totalCoins}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-500">
            <span className="text-2xl">🪙</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1f] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-6 h-6 text-rose-500" />
            Boshqaruv Paneli
          </h2>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Qidiruv..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none w-full md:w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400">Foydalanuvchi</th>
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400">Rol</th>
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400 text-center">Tangalar</th>
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400 text-center">So'zlar</th>
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400 text-center">O't</th>
                    <th className="p-4 font-semibold text-sm text-slate-500 dark:text-slate-400 text-right">Ro'yxatdan o'tgan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">Foydalanuvchilar topilmadi</td>
                    </tr>
                  ) : filteredUsers.map(u => (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 overflow-hidden">
                            {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{u.displayName?.[0] || u.email?.[0]?.toUpperCase()}</div>}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{u.displayName || 'Anonim'}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[150px] md:max-w-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${u.role === 'admin' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold text-amber-500 bg-amber-50/30 dark:bg-amber-900/5">{u.coins || 0}</td>
                      <td className="p-4 text-center font-bold text-indigo-500">{u.wordsLearned || 0}</td>
                      <td className="p-4 text-center font-bold text-orange-500 bg-orange-50/30 dark:bg-orange-900/5">{u.streak || 0}</td>
                      <td className="p-4 text-right text-xs font-medium text-slate-500">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('uz-UZ') : 'Noma\'lum'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsTab({ words, stats, userProfile, streak }: { words: Word[], stats: Record<string, DailyStats>, userProfile: UserProfile | null, streak: number }) {
  const totalLearned = words.filter(w => w.status === 'mastered').length;
  const totalWords = words.length;

  const coins = userProfile?.coins || 0;
  const totalTime = Object.values(stats).reduce((acc, curr) => acc + curr.timeSpent, 0);

  const badges = [
    { id: 'novice', name: 'Boshlovchi', desc: '5 ta so\'z yodlandi', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-100', threshold: 5 },
    { id: 'apprentice', name: 'Shogird', desc: '20 ta so\'z yodlandi', icon: Book, color: 'text-indigo-500', bg: 'bg-indigo-100', threshold: 20 },
    { id: 'scholar', name: 'Bilimdon', desc: '50 ta so\'z yodlandi', icon: GraduationCap, color: 'text-purple-500', bg: 'bg-purple-100', threshold: 50 },
    { id: 'master', name: 'Usta', desc: '100 ta so\'z yodlandi', icon: Award, color: 'text-emerald-500', bg: 'bg-emerald-100', threshold: 100 },
    { id: 'legend', name: 'Afsona', desc: '300 ta so\'z yodlandi', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-100', threshold: 300 },
    { id: 'titan', name: 'Titan', desc: '1000 ta so\'z yodlandi', icon: Crown, color: 'text-rose-500', bg: 'bg-rose-100', threshold: 1000 },
  ];

  const getLevelTitle = (learnedCount: number) => {
    let title = 'Navqiron';
    for (const badge of badges) {
      if (learnedCount >= badge.threshold) {
        title = badge.name;
      }
    }
    return title;
  };

  const currentTitle = getLevelTitle(totalLearned);

  useEffect(() => {
    if (userProfile && totalLearned !== userProfile.wordsLearned) {
       setDoc(doc(db, 'users', userProfile.uid), { wordsLearned: totalLearned }, { merge: true });
       setDoc(doc(db, 'public_profiles', userProfile.uid), { wordsLearned: totalLearned }, { merge: true });
    }
  }, [totalLearned, userProfile]);

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'public_profiles'), orderBy('wordsLearned', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const users: any[] = [];
      querySnapshot.forEach((doc) => {
        users.push(doc.data());
      });
      setLeaderboard(users);
      setIsLoadingLeaderboard(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'public_profiles');
      setIsLoadingLeaderboard(false);
    });
    return () => unsubscribe();
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Profile Header */}
      <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 p-6 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Trophy className="w-64 h-64 text-indigo-500" />
        </div>
        
        <div className="relative flex flex-col md:flex-row gap-8 items-center">
          <div className="relative">
            <div className="w-32 h-32 md:w-36 md:h-36 rounded-full border-4 border-white dark:border-slate-700 shadow-2xl overflow-hidden bg-slate-200">
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-indigo-500 text-white text-5xl font-black">
                  {userProfile?.displayName?.[0] || '?'}
                </div>
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white px-4 py-1.5 rounded-full flex items-center justify-center font-black text-xs shadow-lg border-4 border-white dark:border-slate-800 uppercase tracking-widest whitespace-nowrap">
              {currentTitle}
            </div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
              {userProfile?.displayName || 'Foydalanuvchi'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">{userProfile?.email}</p>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-6">
              <div className="bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Holat</p>
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="font-black text-slate-700 dark:text-slate-200">{streak} kun</span>
                </div>
              </div>
              <div className="bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Tangalar</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🪙</span>
                  <span className="font-black text-slate-700 dark:text-slate-200">{coins}</span>
                </div>
              </div>
              <div className="bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Yodlangan</p>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-black text-slate-700 dark:text-slate-200">{totalLearned}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Badges Gallery - School 21 style */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <Award className="w-6 h-6 text-indigo-500" />
            Nishonlar va Yutuqlar
          </h2>
          <span className="text-sm font-bold text-slate-400">
            {badges.filter(b => totalLearned >= b.threshold).length} / {badges.length}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {badges.map((badge) => {
            const isEarned = totalLearned >= badge.threshold;
            const progress = Math.min(100, (totalLearned / badge.threshold) * 100);
            const Icon = badge.icon;
            
            return (
              <div 
                key={badge.id}
                className={`relative group p-6 rounded-[2rem] border transition-all duration-500 flex flex-col items-center gap-4 ${
                  isEarned 
                    ? 'bg-white dark:bg-slate-700 border-white dark:border-slate-600 shadow-xl scale-100 hover:scale-105' 
                    : 'bg-slate-100 dark:bg-slate-800/30 border-dashed border-slate-200 dark:border-slate-700 opacity-60 grayscale'
                }`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isEarned ? badge.bg : 'bg-slate-200 dark:bg-slate-700'} shadow-inner`}>
                  {isEarned ? (
                    <Icon className={`w-8 h-8 ${badge.color}`} />
                  ) : (
                    <Lock className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                
                <div className="text-center space-y-1">
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate w-full">{badge.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight font-medium">{badge.desc}</p>
                </div>

                {!isEarned && (
                  <div className="absolute bottom-4 w-12 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-1000" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 p-6 md:p-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-500" />
            Eng kuchli bilimdonlar
          </h2>
        </div>

        {isLoadingLeaderboard ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((user, idx) => {
              const userTitle = getLevelTitle(user.wordsLearned || 0); // Need to make sure wordsLearned is in public_profiles
              return (
                <div 
                  key={idx} 
                  id={user.uid === userProfile?.uid ? "me-in-leaderboard" : undefined}
                  className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                    user.uid === userProfile?.uid 
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 ring-2 ring-indigo-500/10' 
                      : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/30'
                  }`}
                >
                  <div className="w-10 h-10 flex items-center justify-center font-black text-lg text-slate-400">
                    {idx + 1}
                  </div>
                  
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 flex-shrink-0 border-2 border-white dark:border-slate-700 shadow-sm relative">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold">
                        {user.displayName?.[0] || '?'}
                      </div>
                    )}
                    {user.streak >= 2 && (
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white dark:border-slate-800">
                        <Flame className="w-3 h-3 fill-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                      {user.displayName || 'Anonim User'}
                      {user.uid === userProfile?.uid && (
                        <span className="text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">Siz</span>
                      )}
                    </p>
                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-black uppercase tracking-widest">{userTitle}</p>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <BookOpen className="w-4 h-4 text-indigo-500" />
                      <p className="font-black text-slate-700 dark:text-slate-200">{user.wordsLearned || 0}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">So'zlar</p>
                  </div>
                </div>
              );
            })}

            {/* Self indicator if not in top 50 */}
            {!isLoadingLeaderboard && userProfile && !leaderboard.find(u => u.uid === userProfile.uid) && (
              <>
                <div className="flex justify-center py-2">
                  <div className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-1" />
                  <div className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-1" />
                  <div className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-1" />
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 ring-2 ring-indigo-500/10">
                  <div className="w-10 h-10 flex items-center justify-center font-black text-lg text-slate-400">
                    ?
                  </div>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 flex-shrink-0 border-2 border-white dark:border-slate-700 shadow-sm relative">
                    {userProfile.photoURL ? (
                      <img src={userProfile.photoURL} alt={userProfile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold">
                        {userProfile.displayName?.[0] || '?'}
                      </div>
                    )}
                    {streak >= 2 && (
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white dark:border-slate-800">
                        <Flame className="w-3 h-3 fill-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                      {userProfile.displayName || 'Siz'}
                      <span className="text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">Siz</span>
                    </p>
                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-black uppercase tracking-widest">{currentTitle}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <BookOpen className="w-4 h-4 text-indigo-500" />
                      <p className="font-black text-slate-700 dark:text-slate-200">{totalLearned}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">So'zlar</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )
      }
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 p-8">
           <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6 uppercase tracking-wider flex items-center gap-3">
            <PieChart className="w-5 h-5 text-indigo-500" />
            Umumiy Statistika
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Jami so'zlar</span>
              <span className="text-xl font-black text-slate-800 dark:text-slate-200">{totalWords}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Yodlangan so'zlar</span>
              <span className="text-xl font-black text-emerald-500">{totalLearned}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 p-8">
           <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6 uppercase tracking-wider flex items-center gap-3">
            <Clock className="w-5 h-5 text-indigo-500" />
            Vaqt Sarfi
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Jami o'qilgan vaqt</span>
              <span className="text-xl font-black text-slate-800 dark:text-slate-200">{formatTime(totalTime)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PracticeTab({ words, setWords, setStats, setCoins }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>>, setStats: React.Dispatch<React.SetStateAction<Record<string, DailyStats>>>, setCoins: React.Dispatch<React.SetStateAction<number>> }) {
  const [mode, setMode] = useState<'menu' | 'quiz' | 'flashcards' | 'listening' | 'matching' | 'spelling' | 'exam'>('menu');

  if (words.length < 5) {
    return (
      <div className="text-center py-20 bg-white/80 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-indigo-100/50 dark:shadow-none dark:bg-slate-800/80 max-w-2xl mx-auto">
        <Dumbbell className="w-16 h-16 text-slate-200 dark:text-slate-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">So'zlar yetarli emas</h2>
        <p className="text-slate-500 dark:text-slate-400">O'yin o'ynash uchun lug'atda kamida 5 ta so'z bo'lishi kerak. Hozirda sizda {words.length} ta so'z bor.</p>
      </div>
    );
  }

  if (mode === 'menu') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <button 
          onClick={() => setMode('flashcards')}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl shadow-blue-100/50 dark:shadow-none border border-white dark:border-slate-700 hover:scale-[1.02] transition-transform text-left group"
        >
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors">
            <Layers className="w-7 h-7 text-blue-500 dark:text-blue-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Fleshkartalar</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tezkor xotira mashqi (XP beradi).</p>
        </button>

        <button 
          onClick={() => setMode('quiz')}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl shadow-indigo-100/50 dark:shadow-none border border-white dark:border-slate-700 hover:scale-[1.02] transition-transform text-left group"
        >
          <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-500 transition-colors">
            <Zap className="w-7 h-7 text-indigo-500 dark:text-indigo-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Tezkor Test</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Variantlar orasidan to'g'ri tarjimani toping.</p>
        </button>

        <button 
          onClick={() => setMode('matching')}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl shadow-emerald-100/50 dark:shadow-none border border-white dark:border-slate-700 hover:scale-[1.02] transition-transform text-left group"
        >
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-500 transition-colors">
            <Zap className="w-7 h-7 text-emerald-500 dark:text-emerald-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">So'z Yomg'iri</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tushayotgan so'zlarga to'g'ri izohni belgilang.</p>
        </button>

        <button 
          onClick={() => setMode('listening')}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl shadow-pink-100/50 dark:shadow-none border border-white dark:border-slate-700 hover:scale-[1.02] transition-transform text-left group"
        >
          <div className="w-14 h-14 bg-pink-100 dark:bg-pink-900/50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-pink-500 transition-colors">
            <Volume2 className="w-7 h-7 text-pink-500 dark:text-pink-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Eshitib Topish</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Talaffuzni eshitib, to'g'ri tarjimani toping.</p>
        </button>

        <button 
          onClick={() => setMode('spelling')}
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl shadow-cyan-100/50 dark:shadow-none border border-white dark:border-slate-700 hover:scale-[1.02] transition-transform text-left group"
        >
          <div className="w-14 h-14 bg-cyan-100 dark:bg-cyan-900/50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-cyan-500 transition-colors">
            <Edit3 className="w-7 h-7 text-cyan-500 dark:text-cyan-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Yozma Mashq</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">O'zbekcha tarjimasiga qarab inglizchasini yozing.</p>
        </button>

        <button 
          onClick={() => setMode('exam')}
          className="lg:col-span-1 bg-gradient-to-br from-amber-400 to-orange-500 p-6 rounded-3xl shadow-xl shadow-orange-200/50 dark:shadow-none border border-white/20 hover:scale-[1.02] transition-transform text-left group relative overflow-hidden flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              Mukammal Test
            </h3>
            <p className="text-sm text-white/90">So'zlarning 100% o'rganilganligini isbotlab oltin yulduz oling.</p>
          </div>
        </button>

        <div className="md:col-span-2 lg:col-span-3 mt-2 bg-slate-50 dark:bg-slate-800/50 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
             <Target className="w-6 h-6 text-amber-500" />
             Mukammal Testga qanday o'tiladi?
          </h4>
          <ul className="space-y-4 text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <span>Har bir yangi so'z "O'rganilmoqda" holatida bo'ladi va o'rganish darajasi 0% dan boshlanadi.</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <span>So'z "Mukammal test" ga tayyor bo'lishi uchun, uni <b>barcha 4 xil baholanuvchi mashqda</b> (Tezkor Test, So'z Yomg'iri, Eshitib Topish, Yozma Mashq) kamida 1 martadan to'g'ri yechishingiz kerak. (Fleshkartalar faqat yodlash uchun)</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <span>Har bir bajarilgan turli baholanuvchi mashq so'zga 25% qo'shadi. Barchasidan bittadan o'tib, so'z 100% ga chiqqanda u <b>"Mukammal testga tayyor"</b> deb belgilanadi.</span>
            </li>
             <li className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>Agar "Mukammal test" da xira qilsangiz, so'z reytingi yana 0% ga tushib qoladi.</span>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (mode === 'quiz') {
    return <QuizMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  }

  if (mode === 'flashcards') {
    return <FlashcardsMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  }

  if (mode === 'listening') {
    return <ListeningMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  }

  if (mode === 'matching') {
    return <MatchingMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  }

  if (mode === 'spelling') {
    return <SpellingMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  }

  if (mode === 'exam') {
    return <ExamMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} setCoins={setCoins} />;
  }

  return null;
}

function QuizMode({ words, setWords, setStats, onBack }: any) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(6000);
  const initialized = useRef(false);
  const messageRef = useRef<string | null>(null);

  // Initialize questions only once when the component mounts
  useEffect(() => {
    if (!initialized.current) {
      const shuffleArray = (array: any[]) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
      };

      const shuffledWords = shuffleArray(words); // All words
      const q = shuffledWords.map(word => {
        const others = shuffleArray(words.filter(w => w.id !== word.id)).slice(0, 3);
        const options = shuffleArray([word, ...others]);
        return { word, options };
      });
      setQuestions(q);
      initialized.current = true;
    }
  }, [words]);

  const handleAnswer = useCallback((option: any | 'timeout') => {
    if (selectedAnswer) return;
    
    const isTimeout = option === 'timeout';
    const optionId = isTimeout ? 'timeout' : option.id;
    setSelectedAnswer(optionId);
    
    const isCorrect = !isTimeout && optionId === questions[currentIndex]?.word?.id;
    const currentWord = questions[currentIndex]?.word;

    if (isCorrect) {
      setScore(s => s + 1);
      
      setWords((prev: Word[]) => prev.map(w => {
        if (w.id === currentWord?.id) {
          return updateWordProgress(w, 'quiz', true);
        }
        return w;
      }));
      
      // Update stats only if it's a new word being learned
      if (currentWord?.status === 'new') {
        const today = new Date().toISOString().split('T')[0];
        setStats((prev: any) => {
          const current = prev[today] || { timeSpent: 0, wordsLearned: 0 };
          return { ...prev, [today]: { ...current, wordsLearned: current.wordsLearned + 1 } };
        });
      }
    } else {
      // Demote progress on wrong answer
      setWords((prev: Word[]) => prev.map(w => {
        if (w.id === currentWord?.id) {
          return updateWordProgress(w, 'quiz', false);
        }
        return w;
      }));
    }

    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(i => i + 1);
        setSelectedAnswer(null);
        setTimeLeft(6000);
      } else {
        setShowResult(true);
      }
    }, 1500);
  }, [selectedAnswer, currentIndex, questions, setWords, setStats]);

  // Timer logic
  useEffect(() => {
    if (selectedAnswer !== null || showResult || questions.length === 0) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 6000 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0) {
        clearInterval(timer);
        handleAnswer('timeout');
      }
    }, 50);

    return () => clearInterval(timer);
  }, [selectedAnswer, showResult, questions.length, currentIndex, handleAnswer]);

  if (questions.length === 0) return null;

  if (showResult) {
    const percentage = questions.length > 0 ? score / questions.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl shadow-indigo-100/50 dark:shadow-none border border-white dark:border-slate-700 text-center max-w-2xl mx-auto"
      >
        <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-6 drop-shadow-md" />
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Test Yakunlandi!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">Sizning natijangiz: <span className="font-bold text-indigo-600 dark:text-indigo-400">{score}</span> / {questions.length}</p>
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button onClick={onBack} className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-1 transition-all">
          Asosiy menuga qaytish
        </button>
      </motion.div>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = ((currentIndex) / questions.length) * 100;
  const displayTime = Math.ceil(timeLeft / 1000);

  return (
    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-indigo-100/50 dark:shadow-none border border-white dark:border-slate-700 max-w-3xl mx-auto overflow-hidden relative mt-4">
      {/* Timer Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-2 bg-slate-100 dark:bg-slate-700">
        <div 
          className={`h-full ${timeLeft <= 1000 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${(timeLeft / 6000) * 100}%`, transition: selectedAnswer !== null ? 'none' : 'width 50ms linear' }}
        />
      </div>

      <div className="flex justify-between items-center mb-6 mt-2">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-slate-50 dark:bg-slate-700/50 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
          <span className={`text-xl font-black ${timeLeft <= 1000 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>
            {displayTime}
          </span>
        </div>

        <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full mb-10 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-indigo-500 to-blue-500 h-full transition-all duration-500 ease-out rounded-full" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center mb-10">
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100 mb-4">{currentQ.word.original}</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Ushbu so'zning to'g'ri tarjimasini toping</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentQ.options.map((opt: any) => {
              let btnClass = "p-5 rounded-2xl border-2 text-lg font-semibold transition-all flex items-center justify-between group ";
              let icon = null;

              if (!selectedAnswer) {
                btnClass += "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300 hover:shadow-md hover:-translate-y-1";
              } else {
                if (opt.id === currentQ.word.id) {
                  btnClass += "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm scale-[1.02]";
                  icon = <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />;
                } else if (opt.id === selectedAnswer) {
                  btnClass += "border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm scale-[0.98]";
                  icon = <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />;
                } else {
                  btnClass += "border-slate-200 dark:border-slate-700 opacity-40 text-slate-500 dark:text-slate-400 scale-[0.98]";
                }
              }

              return (
                <button 
                  key={opt.id} 
                  onClick={() => handleAnswer(opt)} 
                  disabled={!!selectedAnswer} 
                  className={btnClass}
                >
                  <span>{opt.translation}</span>
                  {icon && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>{icon}</motion.div>}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FlashcardsMode({ words, setWords, setStats, onBack }: any) {
  const [questions, setQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const initialized = useRef(false);
  const messageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      const shuffledWords = [...words].sort(() => 0.5 - Math.random());
      setQuestions(shuffledWords);
      initialized.current = true;
    }
  }, [words]);

  const currentWord = questions[currentIndex];

  const handleNext = (isKnown: boolean) => {
    if (!currentWord || isTransitioning) return;
    setIsTransitioning(true);
    
    if (isKnown) {
      setScore(s => s + 1);
    }

    setWords((prev: Word[]) => prev.map(w => {
      if (w.id === currentWord.id) {
        return updateWordProgress(w, 'flashcards', isKnown);
      }
      return w;
    }));

    if (isKnown && currentWord.status === 'new') {
      const today = new Date().toISOString().split('T')[0];
      setStats((prev: any) => {
        const current = prev[today] || { timeSpent: 0, wordsLearned: 0 };
        return { ...prev, [today]: { ...current, wordsLearned: current.wordsLearned + 1 } };
      });
    }

    if (isFlipped) {
      setIsFlipped(false);
      setTimeout(() => {
        setCurrentIndex(i => i + 1);
        setIsTransitioning(false);
      }, 450); // Meticulously wait for 0.4s flip to finish, so the back face isn't seen
    } else {
      setTimeout(() => {
        setCurrentIndex(i => i + 1);
        setIsTransitioning(false);
      }, 150);
    }
  };

  if (currentIndex >= questions.length || words.length === 0) {
    const percentage = questions.length > 0 ? score / questions.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;
    return (
      <div className="max-w-2xl mx-auto text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl shadow-blue-100/50 dark:shadow-none border border-white dark:border-slate-700">
        <Layers className="w-24 h-24 text-blue-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">Mashq yakunlandi!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">Siz {score} ta so'zni bildingiz.</p>
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button 
          onClick={onBack}
          className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
        >
          Menyuga qaytish
        </button>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-full flex justify-between items-center mb-8 px-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ArrowLeft className="w-6 h-6" /></button>
        <div className="text-lg font-bold text-slate-700 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 px-4 py-1 rounded-full">
          {currentIndex + 1} / {questions.length}
        </div>
        <div className="w-6"></div>
      </div>

      <div className="relative w-full aspect-[3/4] perspective-1000 cursor-pointer group" onClick={() => !isTransitioning && setIsFlipped(!isFlipped)}>
        <motion.div 
          className="w-full h-full relative preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl shadow-blue-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center p-8">
            {currentWord.emoji && <span className="text-6xl mb-6">{currentWord.emoji}</span>}
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100 mb-4 text-center break-words w-full">
              {currentWord.original}
            </h2>
            {currentWord.pronunciation && (
              <p className="text-lg text-slate-400 dark:text-slate-500 font-mono bg-slate-50 dark:bg-slate-900/50 px-4 py-1.5 rounded-full">
                {currentWord.pronunciation}
              </p>
            )}
            <p className="text-slate-400 dark:text-slate-500 font-medium text-sm absolute bottom-8">Tarjimasini ko'rish uchun bosing</p>
          </div>

          {/* Back */}
          <div 
            className="absolute w-full h-full backface-hidden bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[2.5rem] shadow-2xl shadow-blue-200/50 dark:shadow-none border-2 border-blue-400/30 flex flex-col items-center justify-center p-8 overflow-y-auto"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <div className={`flex flex-col items-center justify-center w-full min-h-full py-10 transition-opacity duration-200 ${isTransitioning && !isFlipped ? 'opacity-0' : 'opacity-100'}`}>
              <h2 className="text-4xl sm:text-5xl font-extrabold mb-4 text-center break-words w-full drop-shadow-md leading-normal py-2">
                {currentWord.translation}
              </h2>
              {currentWord.uzbekExplanation && (
                <div className="mt-6 p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 w-full text-center">
                  <p className="text-blue-100 text-sm font-semibold mb-2 uppercase tracking-wider">Qanday ishlatiladi:</p>
                  <p className="text-white text-lg leading-relaxed">
                    {currentWord.uzbekExplanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="w-full mt-8 px-4 h-16">
        {!isFlipped ? (
          <div className="flex gap-4 w-full h-full">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }}
              disabled={isTransitioning}
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            >
              <Eye className="w-6 h-6" /> Bilmayman
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleNext(true); }}
              disabled={isTransitioning}
              className="flex-1 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50 dark:shadow-none disabled:opacity-50"
            >
              <CheckCircle2 className="w-6 h-6" /> Bilaman
            </button>
          </div>
        ) : (
          <div className="flex w-full h-full">
            <button 
              onClick={(e) => { e.stopPropagation(); handleNext(false); }}
              disabled={isTransitioning}
              className="flex-1 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 dark:shadow-none disabled:opacity-50"
            >
              Keyingi so'z <ArrowRight className="w-6 h-6 ml-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ListeningMode({ words, setWords, setStats, onBack }: any) {
  const [questions, setQuestions] = useState<Word[]>([]);
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [options, setOptions] = useState<Word[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<'word' | 'description' | 'dictation'>('word');
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [userInput, setUserInput] = useState('');
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialized = useRef(false);
  const totalQuestions = words.length;
  const messageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      const shuffledWords = [...words].sort(() => 0.5 - Math.random());
      setQuestions(shuffledWords);
      initialized.current = true;
    }
  }, [words]);

  useEffect(() => {
    if (questions.length > 0 && questionCount < questions.length) {
      const word = questions[questionCount];
      if (currentWord?.id !== word.id) {
        loadNewQuestion(word);
      }
    }
  }, [questions, questionCount]);

  const generateAudio = (text: string) => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    
    if (!('speechSynthesis' in window)) {
      setIsGeneratingAudio(false);
      setAudioError("Brauzeringiz ovozli o'qishni qo'llab-quvvatlamaydi.");
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;

    utterance.onstart = () => {
      setIsGeneratingAudio(false);
      setIsPlaying(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
    };

    utterance.onerror = (e) => {
      console.error("Speech error:", e);
      setIsGeneratingAudio(false);
      setIsPlaying(false);
      if (e.error !== 'canceled') {
        setAudioError("Ovozni chalishda xatolik yuz berdi.");
      }
    };

    timeoutRef.current = setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  const loadNewQuestion = (target: Word) => {
    setResult(null);
    setAudioError(null);
    setUserInput('');
    
    const progressRatio = questionCount / totalQuestions;
    let type: 'word' | 'description' | 'dictation' = 'word';

    if (progressRatio >= 0.6) {
      type = 'dictation';
    } else if (progressRatio >= 0.3) {
      if (target.description && target.description.trim().length > 0) {
        type = 'description';
      } else {
        type = 'word';
      }
    } else {
      type = 'word';
    }
    
    setQuestionType(type);
    setCurrentWord(target);
    
    if (type !== 'dictation') {
      const wrongOptions = [...words].filter((w: Word) => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const allOptions = [target, ...wrongOptions].sort(() => 0.5 - Math.random());
      setOptions(allOptions);
    } else {
      setOptions([]);
    }
    
    let textToRead = type === 'description' ? target.description! : target.original;
    if (type === 'description') {
      const regex = new RegExp(`\\b${target.original}\\b`, 'gi');
      textToRead = textToRead.replace(regex, 'this word');
    }
    generateAudio(textToRead);
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const checkCorrectness = (isCorrect: boolean) => {
    if (isCorrect) {
      setResult('correct');
      setScore(s => s + 1);
      
      setWords((prev: Word[]) => prev.map(w => {
        if (w.id === currentWord!.id) {
          return updateWordProgress(w, 'listening', true);
        }
        return w;
      }));

      if (currentWord!.status === 'new') {
        const today = new Date().toISOString().split('T')[0];
        setStats((prev: any) => ({
          ...prev,
          [today]: {
            ...prev[today],
            wordsLearned: (prev[today]?.wordsLearned || 0) + 1
          }
        }));
      }
    } else {
      setResult('incorrect');
      setWords((prev: Word[]) => prev.map(w => {
        if (w.id === currentWord!.id) {
          return updateWordProgress(w, 'listening', false);
        }
        return w;
      }));
    }
    
    setTimeout(() => {
      setQuestionCount(c => c + 1);
    }, 2000);
  };

  const handleAnswer = (selected: Word) => {
    if (result) return;
    checkCorrectness(selected.id === currentWord?.id);
  };

  const checkDictation = () => {
    if (result || !currentWord) return;
    const normalize = (str: string) => str.toLowerCase().replace(/[.,!?]/g, '').trim();
    const isCorrect = normalize(userInput) === normalize(currentWord.original);
    checkCorrectness(isCorrect);
  };

  const playAudio = () => {
    if (currentWord) {
      let textToRead = questionType === 'description' ? currentWord.description! : currentWord.original;
      if (questionType === 'description') {
        const regex = new RegExp(`\\b${currentWord.original}\\b`, 'gi');
        textToRead = textToRead.replace(regex, 'this word');
      }
      generateAudio(textToRead);
    }
  };

  if (questionCount >= totalQuestions) {
    const percentage = totalQuestions > 0 ? score / totalQuestions : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;
    return (
      <div className="max-w-2xl mx-auto text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl shadow-pink-100/50 dark:shadow-none border border-white dark:border-slate-700">
        <Trophy className="w-24 h-24 text-pink-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">Mashq yakunlandi!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">Natijangiz: {score} / {totalQuestions}</p>
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button 
          onClick={onBack}
          className="px-8 py-4 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-colors"
        >
          Menyuga qaytish
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack}
          className="p-2 bg-white/50 dark:bg-slate-800/50 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
          {questionCount + 1} / {totalQuestions}
        </div>
        <div className="text-pink-600 dark:text-pink-400 font-bold">
          {score} to'g'ri
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-pink-100/50 dark:shadow-none border border-white dark:border-slate-700 text-center">
        <div className="mb-8">
          <button 
            onClick={playAudio}
            disabled={isPlaying || isGeneratingAudio}
            className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto transition-all duration-300 ${
              (isPlaying || isGeneratingAudio) 
                ? 'bg-pink-100 dark:bg-pink-900/50 text-pink-500 scale-110 shadow-lg shadow-pink-200/50 dark:shadow-none' 
                : audioError
                ? 'bg-red-100 dark:bg-red-900/50 text-red-500 hover:bg-red-200 dark:hover:bg-red-800/50'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-pink-50 dark:hover:bg-slate-600 hover:text-pink-600'
            }`}
          >
            {isGeneratingAudio ? <Loader2 className="w-10 h-10 animate-spin" /> : <Volume2 className="w-10 h-10" />}
          </button>
          
          {audioError ? (
            <p className="mt-4 text-red-500 dark:text-red-400 font-medium px-4">
              {audioError}
            </p>
          ) : (
            <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">
              {questionType === 'description' 
                ? "Ta'rifni tinglang va mos so'zni tanlang" 
                : questionType === 'dictation'
                ? "So'zni tinglang va uni yozing"
                : "So'zni tinglang va to'g'ri tarjimani tanlang"}
            </p>
          )}
        </div>

        {questionType === 'dictation' ? (
          <div className="flex flex-col items-center gap-4 mt-8">
            <span className="text-xs font-bold bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-3 py-1 rounded-full uppercase tracking-wider mb-2">Qiyinroq (Yozish)</span>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={result !== null}
              placeholder="Eshitgan so'zingizni yozing..."
              className={`w-full max-w-md p-4 bg-transparent border-2 rounded-xl outline-none font-bold text-lg transition-colors text-center ${
                result === 'correct' 
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                  : result === 'incorrect' 
                  ? 'border-red-500 text-red-600 dark:text-red-400' 
                  : 'border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 focus:border-indigo-500'
              }`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && userInput.trim() && !result) {
                  checkDictation();
                }
              }}
            />
            
            {result === 'incorrect' && (
              <div className="text-red-600 dark:text-red-400 font-medium mt-2">
                To'g'ri javob: <strong className="font-black">{currentWord?.original}</strong>
              </div>
            )}

            {!result && (
              <button 
                onClick={checkDictation}
                disabled={!userInput.trim()}
                className="w-full max-w-md py-4 mt-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Tekshirish
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswer(option)}
                disabled={result !== null}
                className={`p-4 rounded-xl font-bold text-lg transition-all border-2 ${
                  result && option.id === currentWord?.id
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                    : result && result === 'incorrect' && option.id !== currentWord?.id
                    ? 'bg-red-100 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-400 opacity-50'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400'
                }`}
              >
                {questionType === 'description' ? option.original : option.translation}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchingMode({ words, setWords, setStats, onBack }: any) {
  const [queue, setQueue] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<Word[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'won'>('start');
  const [speed, setSpeed] = useState(4.0); // seconds to fall (faster)
  const [attemptKey, setAttemptKey] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const initialized = useRef(false);
  const messageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      const shuffled = [...words].sort(() => 0.5 - Math.random());
      setQueue(shuffled);
      initialized.current = true;
    }
  }, [words]);

  useEffect(() => {
    if (gameState === 'playing' && currentIndex < queue.length) {
      const current = queue[currentIndex];
      const wrongOptions = words
        .filter((w: Word) => w.id !== current.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);
      const allOptions = [current, ...wrongOptions].sort(() => 0.5 - Math.random());
      setOptions(allOptions);
      setAttemptKey(prev => prev + 1);
      setFeedback(null);
    } else if (gameState === 'playing' && currentIndex >= queue.length) {
      setGameState('won');
    }
  }, [currentIndex, gameState, queue, words]);

  const handleAnswer = (selectedId: string) => {
    if (gameState !== 'playing' || feedback) return;
    const current = queue[currentIndex];
    const isCorrect = selectedId === current.id;

    if (isCorrect) {
      setFeedback('correct');
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === current.id ? updateWordProgress(w, 'matching', true) : w));
      
      if (current.status === 'new') {
        const today = new Date().toISOString().split('T')[0];
        setStats((prev: any) => {
          const currentStat = prev[today] || { timeSpent: 0, wordsLearned: 0 };
          return { ...prev, [today]: { ...currentStat, wordsLearned: currentStat.wordsLearned + 1 } };
        });
      }

      setSpeed(s => Math.max(2.5, s * 0.9)); // Speed up faster
      
      setTimeout(() => {
        setCurrentIndex(i => i + 1);
      }, 300);
    } else {
      handleMistake();
    }
  };

  const handleMiss = () => {
    if (gameState !== 'playing' || feedback) return;
    handleMistake();
  };

  const handleMistake = () => {
    setFeedback('incorrect');
    const current = queue[currentIndex];
    setWords((prev: Word[]) => prev.map(w => w.id === current.id ? updateWordProgress(w, 'matching', false) : w));
    
    setLives(l => {
      const newLives = l - 1;
      setTimeout(() => {
        if (newLives <= 0) {
          setGameState('gameover');
        } else {
          setCurrentIndex(i => i + 1);
        }
      }, 500);
      return newLives;
    });
  };

  if (gameState === 'start') {
    return (
      <div className="max-w-2xl mx-auto text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl border border-white dark:border-slate-700">
        <Zap className="w-24 h-24 text-emerald-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">So'z Yomg'iri</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">Tepadan tushayotgan inglizcha so'zning to'g'ri o'zbekcha tarjimasini u yerga yetib borguncha toping!</p>
        <div className="flex justify-center gap-4">
          <button onClick={onBack} className="px-8 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Orqaga</button>
          <button onClick={() => setGameState('playing')} className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors">Boshlash</button>
        </div>
      </div>
    );
  }

  if (gameState === 'gameover' || gameState === 'won') {
    const isWon = gameState === 'won';
    const percentage = words.length > 0 ? score / words.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;
    return (
      <div className="max-w-2xl mx-auto text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl border border-white dark:border-slate-700">
        {isWon ? <Trophy className="w-24 h-24 text-emerald-500 mx-auto mb-6" /> : <XCircle className="w-24 h-24 text-red-500 mx-auto mb-6" />}
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">{isWon ? "Ajoyib natija!" : "O'yin tugadi"}</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">Siz {score} ta so'zni to'g'ri topdingiz.</p>
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button onClick={onBack} className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors">Menyuga qaytish</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-[70vh] min-h-[500px] flex flex-col bg-slate-50 dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 relative">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md z-20 border-b border-slate-200 dark:border-slate-700">
        <button onClick={onBack} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-slate-600 dark:text-slate-300">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="flex space-x-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart key={i} className={`w-6 h-6 ${i < lives ? 'text-red-500 fill-red-500' : 'text-slate-300 dark:text-slate-600'}`} />
          ))}
        </div>

        <div className="text-lg font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-4 py-1.5 rounded-xl">
          {score} / {queue.length}
        </div>
      </div>

      {/* Game Canvas */}
      <div className={`flex-1 relative overflow-hidden ${feedback === 'incorrect' ? 'bg-red-50 dark:bg-red-900/20 animate-shake' : feedback === 'correct' ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''} transition-colors duration-300`}>
        <AnimatePresence>
          {!feedback && queue[currentIndex] && (
            <motion.div
              key={attemptKey}
              initial={{ top: '-15%', opacity: 0 }}
              animate={{ top: '100%', opacity: 1 }}
              transition={{ duration: speed, ease: 'linear' }}
              onAnimationComplete={handleMiss}
              className="absolute left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 px-8 py-4 rounded-2xl shadow-xl border-2 border-emerald-500 text-3xl font-black text-slate-800 dark:text-slate-100 z-10 whitespace-nowrap"
            >
              {queue[currentIndex].original}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Options */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 z-20">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleAnswer(opt.id)}
            disabled={!!feedback}
            className={`p-4 rounded-xl shadow-sm text-lg font-bold transition-all border-2 ${
              feedback && opt.id === queue[currentIndex]?.id
                ? 'bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                : feedback && opt.id !== queue[currentIndex]?.id
                  ? 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-50'
                  : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-emerald-300 dark:hover:border-emerald-500 hover:shadow-md active:scale-95'
            }`}
          >
            {opt.translation}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpellingMode({ words, setWords, setStats, onBack }: any) {
  const [questions, setQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const initialized = useRef(false);
  const messageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      setQuestions([...words].sort(() => 0.5 - Math.random()));
      initialized.current = true;
    }
  }, [words]);

  const currentWord = questions[currentIndex];

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWord || feedback) return;
    
    const normalizedInput = input.trim().toLowerCase();
    const normalizedTarget = currentWord.original.trim().toLowerCase();
    
    if (normalizedInput === normalizedTarget) {
      setFeedback('correct');
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord.id ? updateWordProgress(w, 'spelling', true) : w));
      
      if (currentWord.status === 'new') {
        const today = new Date().toISOString().split('T')[0];
        setStats((prev: any) => {
           const currentStat = prev[today] || { timeSpent: 0, wordsLearned: 0 };
           return { ...prev, [today]: { ...currentStat, wordsLearned: currentStat.wordsLearned + 1 } };
        });
      }
    } else {
      setFeedback('incorrect');
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord.id ? updateWordProgress(w, 'spelling', false) : w));
    }
  };

  const handleNext = () => {
    setFeedback(null);
    setInput('');
    setCurrentIndex(i => i + 1);
  };

  if (currentIndex >= questions.length || words.length === 0) {
    const percentage = questions.length > 0 ? score / questions.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;
    return (
      <div className="max-w-2xl mx-auto text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-12 rounded-3xl shadow-xl shadow-cyan-100/50 dark:shadow-none border border-white dark:border-slate-700">
        <Edit3 className="w-24 h-24 text-cyan-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4">Mashq yakunlandi!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">Natija: {score} / {questions.length}</p>
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button 
          onClick={onBack}
          className="px-8 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-colors"
        >
          Menyuga qaytish
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack}
          className="p-2 bg-white/50 dark:bg-slate-800/50 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
          So'z {currentIndex + 1} / {questions.length}
        </div>
        <div className="text-cyan-600 dark:text-cyan-400 font-bold">
          {score} to'g'ri
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-cyan-100/50 dark:shadow-none border border-white dark:border-slate-700">
        <div className="mb-8 text-center">
          <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2">{currentWord.translation}</h3>
          {currentWord.partOfSpeech && (
            <span className="inline-block px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-sm font-medium rounded-full mb-4">
              {currentWord.partOfSpeech}
            </span>
          )}
          <p className="text-slate-500 dark:text-slate-400">Inglizcha tarjimasini yozing</p>
        </div>

        <form onSubmit={handleCheck} className="space-y-6">
          <div>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={!!feedback}
              autoFocus
              autoComplete="off"
              className={`w-full text-center text-3xl font-bold p-4 bg-slate-50 dark:bg-slate-900 border-2 rounded-2xl focus:outline-none transition-colors ${
                feedback === 'correct' 
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' 
                  : feedback === 'incorrect'
                    ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:border-cyan-500'
              }`}
              placeholder="Kiriting..."
            />
          </div>

          <AnimatePresence mode="wait">
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg ${
                  feedback === 'correct' 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {feedback === 'correct' ? (
                  <>
                    <CheckCircle2 className="w-6 h-6" />
                    To'g'ri! {currentWord.pronunciation && `[${currentWord.pronunciation}]`}
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6" />
                    Xato. To'g'ri javob: <span className="underline ml-1">{currentWord.original}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {!feedback ? (
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-full py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tekshirish
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="w-full py-4 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            >
              Keyingisi
            </button>
          )}
        </form>
      </div>
    </div>
  );
}


function ExamMode({ words, setWords, setStats, onBack, setCoins }: any) {
  const [examType, setExamType] = useState<'select' | 'new' | 'all'>('select');
  const [examWords, setExamWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(6000);
  const messageRef = useRef<string | null>(null);

  const startExam = (type: 'new' | 'all') => {
    const shuffleArray = (array: any[]) => {
      const newArray = [...array];
      for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
      }
      return newArray;
    };

    let eligibleWords = [];
    if (type === 'new') {
      eligibleWords = words.filter((w: Word) => w.status === 'ready_for_exam');
    } else {
      eligibleWords = words.filter((w: Word) => w.status === 'ready_for_exam' || w.status === 'mastered');
    }
    
    const shuffled = shuffleArray(eligibleWords).slice(0, 10);
    setExamWords(shuffled);
    setExamType(type);
  };

  const currentWord = examWords[currentIndex];

  const handleCorrect = useCallback(() => {
    setFeedback('correct');
    setScore(s => s + 1);
    
    // Add 1 coin for every correct answer
    setCoins((c: number) => c + 1);
    
    setWords((prev: Word[]) => prev.map(w => 
      w.id === currentWord.id ? updateWordProgress(w, 'exam', true) : w
    ));

    const today = new Date().toISOString().split('T')[0];
    setStats((prev: Record<string, DailyStats>) => ({
      ...prev,
      [today]: {
        ...prev[today] || { timeSpent: 0, wordsLearned: 0 },
        wordsLearned: (prev[today]?.wordsLearned || 0) + 1
      }
    }));
  }, [currentWord, setWords, setStats, setCoins]);

  const handleIncorrect = useCallback(() => {
    setFeedback('incorrect');
    setShowAnswer(true);
    
    setWords((prev: Word[]) => prev.map(w => 
      w.id === currentWord.id ? updateWordProgress(w, 'exam', false) : w
    ));
  }, [currentWord, setWords]);

  // Auto-submit when typing correctly
  useEffect(() => {
    if (feedback === null && currentWord && userInput.trim().toLowerCase() === currentWord.original.toLowerCase()) {
      handleCorrect();
    }
  }, [userInput, feedback, currentWord, handleCorrect]);

  // Timer logic
  useEffect(() => {
    if (examType === 'select' || feedback !== null || showResult || examWords.length === 0) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 6000 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0) {
        clearInterval(timer);
        handleIncorrect();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [feedback, showResult, examWords.length, currentIndex, handleIncorrect, examType]);

  if (examType === 'select') {
    const newCount = words.filter((w: Word) => w.status === 'ready_for_exam').length;
    const allCount = words.filter((w: Word) => w.status === 'ready_for_exam' || w.status === 'mastered').length;

    return (
      <div className="max-w-2xl mx-auto text-center bg-white dark:bg-slate-800/50 backdrop-blur-xl p-12 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50">
        <Trophy className="w-24 h-24 text-amber-400 mx-auto mb-6" />
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8">Mukammal Test</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => startExam('new')}
            disabled={newCount === 0}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${newCount > 0 ? 'border-amber-200 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-600 bg-amber-50/50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed'}`}
          >
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Yangi so'zlar</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Faqat testga tayyor bo'lgan yangi so'zlar ({newCount} ta)</p>
          </button>
          <button
            onClick={() => startExam('all')}
            disabled={allCount === 0}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${allCount > 0 ? 'border-purple-200 dark:border-purple-900/50 hover:border-purple-400 dark:hover:border-purple-600 bg-purple-50/50 dark:bg-purple-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed'}`}
          >
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Barcha so'zlar</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Tayyor va oldin yodlangan barcha so'zlar ({allCount} ta)</p>
          </button>
        </div>
        <button onClick={onBack} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Orqaga
        </button>
      </div>
    );
  }

  if (examWords.length === 0) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-sm max-w-2xl mx-auto">
        <Trophy className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Testga tayyor so'zlar yo'q</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Mukammal test topshirish uchun avval so'zlarni boshqa mashqlarda o'rganing.</p>
        <button onClick={onBack} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Orqaga
        </button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || feedback !== null) return;

    const isCorrect = userInput.trim().toLowerCase() === currentWord.original.toLowerCase();
    if (isCorrect) {
      handleCorrect();
    } else {
      handleIncorrect();
    }
  };

  const handleNext = () => {
    if (currentIndex < examWords.length - 1) {
      setCurrentIndex(c => c + 1);
      setUserInput('');
      setFeedback(null);
      setShowAnswer(false);
      setTimeLeft(6000);
    } else {
      setShowResult(true);
    }
  };

  const displayTime = Math.ceil(timeLeft / 1000);

  if (showResult) {
    const earnedCoins = score; // Every correct word = 1 coin

    const percentage = examWords.length > 0 ? score / examWords.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;

    return (
      <div className="max-w-2xl mx-auto text-center bg-white dark:bg-slate-800/50 backdrop-blur-xl p-12 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50">
        <Trophy className="w-24 h-24 text-amber-400 mx-auto mb-6" />
        <h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-4">Test Yakunlandi!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-4">
          Siz {examWords.length} ta so'zdan <span className="font-bold text-amber-500">{score}</span> tasini to'g'ri topdingiz.
        </p>
        {earnedCoins > 0 && (
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center justify-center gap-2">
            <span className="text-3xl">🪙</span> +{earnedCoins} tanga jamg'ardingiz!
          </p>
        )}
        <p className="text-lg text-emerald-600 dark:text-emerald-400 font-medium mb-8">
          {message}
        </p>
        <button 
          onClick={onBack}
          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-8 py-4 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Menyuga qaytish
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-4">
      <div className="bg-white dark:bg-slate-800/50 backdrop-blur-xl p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700/50 text-center relative overflow-hidden">
        {/* Timer Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-2 bg-slate-100 dark:bg-slate-700">
          <div 
            className={`h-full ${timeLeft <= 1500 ? 'bg-red-500' : 'bg-amber-500'}`}
            style={{ width: `${(timeLeft / 6000) * 100}%`, transition: feedback !== null ? 'none' : 'width 50ms linear' }}
          />
        </div>
        
        <div className="flex items-center justify-between mb-8 mt-2">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
            <span className={`text-xl font-black ${timeLeft <= 1500 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>
              {displayTime}
            </span>
          </div>

          <div className="text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 px-4 py-1.5 rounded-full border border-slate-100 dark:border-slate-700">
            {currentIndex + 1} / {examWords.length}
          </div>
        </div>

        <div className="mb-8 mt-4">
          <p className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-4 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" /> Mukammal Test
          </p>
          <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2">{currentWord.translation}</h3>
          {currentWord.uzbekExplanation && (
            <p className="text-slate-500 dark:text-slate-400 italic">{currentWord.uzbekExplanation}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={feedback !== null}
            placeholder="Inglizcha tarjimasini yozing..."
            className={`w-full text-center text-2xl px-6 py-4 rounded-2xl border-2 outline-none transition-all ${
              feedback === 'correct' ? 'bg-lime-50 dark:bg-lime-900/20 border-lime-400 text-lime-700 dark:text-lime-400' :
              feedback === 'incorrect' ? 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-700 dark:text-red-400' :
              'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20'
            }`}
            autoFocus
          />
          
          {feedback === null && (
            <button type="submit" className="mt-4 w-full py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors">
              Tekshirish
            </button>
          )}
        </form>

        {feedback === 'correct' && (
          <div className="mb-6 p-4 bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400 rounded-xl flex items-center justify-center gap-3 border border-lime-200 dark:border-lime-800/30 animate-bounce">
            <Sparkles className="w-6 h-6 shrink-0" />
            <p className="font-bold text-lg">Qoyilmaqom! So'zni yodladingiz!</p>
          </div>
        )}

        {showAnswer && (
          <div className="mb-6 p-6 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30 text-left">
            <p className="text-red-600 dark:text-red-400 font-bold mb-2 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> Noto'g'ri. To'g'ri javob:
            </p>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-1">{currentWord.original}</p>
            {currentWord.pronunciation && <p className="text-slate-500 dark:text-slate-400">[{currentWord.pronunciation}]</p>}
          </div>
        )}

        {feedback !== null && (
          <button 
            onClick={handleNext}
            className="w-full py-4 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors"
          >
            {currentIndex < examWords.length - 1 ? "Keyingi so'z" : "Natijani ko'rish"}
          </button>
        )}
      </div>
    </div>
  );
}