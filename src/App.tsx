import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Plus, Image as ImageIcon, Volume2, Search, BookOpen, Trash2, ArrowRight, ArrowLeft, List, Play, Loader2, Compass, ShoppingBag, Plane, Coffee, Briefcase, GraduationCap, Trophy, Sparkles, CheckCircle2, Dumbbell, BarChart2, CheckCircle, XCircle, Timer, Award, Target, Zap, Moon, Sun, Flame, Download, Upload, Mic, UserCircle, LogOut, Edit3, Save, X, Camera, Keyboard, Layers, Link as LinkIcon, Eye, Heart, Gamepad2, Ghost, Skull, Lock, Crown, Users, PieChart, Clock, Star, Book, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signInAnonymously, signOut, onAuthStateChanged, User } from 'firebase/auth';
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

// Universal TTS Helper to support mobile/Telegram WebApp natively where speechSynthesis fails

export const playUniversalTTS = (text: string, onStart?: () => void, onEnd?: () => void, onError?: (err: any) => void) => {
  try {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Chunk long text for Google TTS which has a ~200 char limit
    const chunkText = (str: string, size: number) => {
      const chunks = [];
      let i = 0;
      while (i < str.length) {
        chunks.push(str.substring(i, i + size));
        i += size;
      }
      return chunks;
    };

    const playFallbackAudio = () => {
      const isSentence = text.trim().split(/\s+/).length > 2;
      const chunks = chunkText(text, 180); 
      
      let currentChunk = 0;
      const playNextChunk = () => {
        if (currentChunk >= chunks.length) {
          onEnd?.();
          return;
        }

        const chunk = chunks[currentChunk];
        const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(chunk)}&type=2`;
        const googleUrl = `https://translate.google.com/translate_tts?client=tw-ob&ie=UTF-8&tl=en-US&q=${encodeURIComponent(chunk)}`;
        
        const primaryUrl = isSentence ? googleUrl : youdaoUrl;
        const audio = new Audio(primaryUrl);
        
        audio.onplay = () => { if (currentChunk === 0) onStart?.(); };
        audio.onended = () => {
          currentChunk++;
          playNextChunk();
        };
        audio.onerror = (e) => {
          console.error("Fallback TTS chunk error", e);
          if (primaryUrl === googleUrl) {
            const secondaryAudio = new Audio(youdaoUrl);
            secondaryAudio.onended = () => { currentChunk++; playNextChunk(); };
            secondaryAudio.onerror = (err) => onError?.(err);
            secondaryAudio.play().catch(err => onError?.(err));
          } else {
            onError?.(e);
          }
        };
        
        audio.play().catch(e => {
          console.warn("Audio play blocked", e);
          onError?.(e);
        });
      };

      playNextChunk();
    };

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85; 
      
      const voices = window.speechSynthesis.getVoices();
      let voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('English')));
      if (!voice) voice = voices.find(v => v.lang.startsWith('en'));
      if (voice) utterance.voice = voice;
      
      utterance.onstart = () => onStart?.();
      utterance.onend = () => onEnd?.();
      utterance.onerror = (err) => {
        console.warn("SpeechSynthesis error", err);
        if (err.error !== 'canceled') {
          playFallbackAudio();
        }
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      playFallbackAudio();
    }
  } catch (error) {
    console.error("TTS System Error:", error);
    onError?.(error);
  }
};

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
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-3xl font-[800] tracking-tighter text-primary-500">oooson</span>
      <div className="flex gap-0.5 mt-[-10px]">
        <div className="w-1.5 h-1.5 rounded-full bg-secondary-400 animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-coin animate-pulse delay-75" />
      </div>
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

  const [streak, setStreak] = useState(() => {
    try {
      const saved = localStorage.getItem('oson-soz-streak');
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = getLocalDate();
        const yesterday = getLocalDate(Date.now() - 86400000);
        if (parsed.lastActive === today) return parsed.count;
        if (parsed.lastActive === yesterday) return parsed.count;
        return 0;
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

  const [activeTab, setActiveTab] = useState<'home' | 'list' | 'topics' | 'practice' | 'profile' | 'admin'>('home');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (tg) return tg.colorScheme === 'dark';
    try { return localStorage.getItem('oson-soz-theme') === 'dark'; } catch { return false; }
  });
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevelReached, setNewLevelReached] = useState(1);
  const [newTitleReached, setNewTitleReached] = useState('');
  
  const totalLearned = useMemo(() => words.filter(w => w.status === 'mastered').length, [words]);
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'shavkatovakbarali75@gmail.com';

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
            const tgUser = tg?.initDataUnsafe?.user;
            
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
            
            // Prefer Telegram user info if available (for seamless guest login)
            let displayName = tgUser ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() : currentUser.displayName;
            let photoURL = tgUser?.photo_url || currentUser.photoURL;
            let phone = undefined;

            if (tgUser) {
              try {
                const tgDoc = await getDoc(doc(db, 'telegram_users', tgUser.id.toString()));
                if (tgDoc.exists()) {
                  const data = tgDoc.data();
                  if (data.name) displayName = data.name;
                  if (data.phone) phone = data.phone;
                }
              } catch (e) {
                console.error("Failed to fetch telegram user data", e);
              }
            }

            if (displayName) {
              payload.displayName = displayName;
              publicPayload.displayName = displayName;
            } else if (currentUser.isAnonymous) {
              payload.displayName = 'Mehmon (Telegram)';
              publicPayload.displayName = 'Mehmon (Telegram)';
            }
            
            if (phone) {
              payload.phone = phone;
            }
            
            if (photoURL) {
              payload.photoURL = photoURL;
              publicPayload.photoURL = photoURL;
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
      // Agar Telegram ichida bo'lsa, avtomatik Anonim (Mehmon) kirish qilinadi
      if (tg) {
        await signInAnonymously(auth);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("Brauzeringizda popup bloki bor. Siz mehmon sifatida tizimga kiritilmoqdasiz...");
        try {
          await signInAnonymously(auth);
        } catch (anonErr: any) {
          if (anonErr.code === 'auth/operation-not-allowed') {
            alert("Xatolik: Iltimos dasturchi bilan bog'lanib, Firebase'da Anonymous Auth yoqilganligini tekshiring.");
          }
        }
      } else if (error.code === 'auth/operation-not-allowed') {
        alert("Xatolik: Tizimga kirish turi o'chirilgan. Iltimos Firebase Console -> Authentication -> Sign-in method da yoqing.");
      } else {
        alert(`Tizimga kirishda xatolik: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

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

function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-500/10 dark:bg-primary-500/5 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary-500/10 dark:bg-secondary-500/5 blur-[120px] rounded-full animate-pulse delay-700" />
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-pink-500/10 dark:bg-pink-500/5 blur-[120px] rounded-full animate-pulse delay-1000" />
    </div>
  );
}

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b0b0d] text-slate-900 dark:text-slate-100 font-sans selection:bg-primary-200 dark:selection:bg-primary-500/30 transition-colors duration-500">
        <BackgroundBlobs />
        
        <header className="bg-white/70 dark:bg-[#0b0b0d]/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm sticky top-0 z-50 transition-colors duration-500">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <Logo className="w-28 sm:w-36" />
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-500' : 'text-slate-300'}`} />
                    <span className="font-black text-sm">{streak}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="text-lg">🪙</span>
                    <span className="font-black text-sm">{coins}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center transition-all active:scale-90"
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {user ? (
                  <button 
                    onClick={() => setShowProfileModal(true)}
                    className="group flex items-center shrink-0"
                  >
                    <div className="w-10 h-10 rounded-2xl p-0.5 bg-gradient-to-br from-primary-400 to-secondary-600 group-hover:shadow-lg group-hover:shadow-primary-500/20 transition-all">
                      {userProfile?.photoURL || user.photoURL ? (
                        <img src={userProfile?.photoURL || user.photoURL || ''} alt="Profile" className="w-full h-full rounded-[0.85rem] object-cover bg-white dark:bg-slate-900" />
                      ) : (
                        <div className="w-full h-full rounded-[0.85rem] bg-white dark:bg-slate-900 flex items-center justify-center text-primary-500 font-black text-sm">
                          {(userProfile?.displayName || user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold rounded-2xl shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCircle className="w-5 h-5" />}
                    <span>Kirish</span>
                  </button>
                )}
              </div>
          </div>
        </header>
        {/* Bottom Navigation */}
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/20 dark:border-slate-800/50 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] sm:bottom-8">
          <div className="flex items-center justify-between px-3 py-2">
            {[
              { id: 'home' as const, icon: Compass, label: 'Asosiy' },
              { id: 'list' as const, icon: Book, label: "Lug'at" },
              { id: 'topics' as const, icon: Sparkles, label: 'Kashfiyot' },
              { id: 'practice' as const, icon: Zap, label: 'Mashq' },
              { id: 'profile' as const, icon: UserCircle, label: 'Profil' },
              ...(isAdmin ? [{ id: 'admin' as const, icon: Shield, label: 'Admin' }] : []),
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 transition-all duration-500 relative py-2 px-3 rounded-2xl ${
                    isActive ? 'text-primary-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <motion.div
                    animate={isActive ? { y: -2, scale: 1.1 } : { y: 0, scale: 1 }}
                    className="relative z-10"
                  >
                    <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  </motion.div>
                  <span className={`text-[9px] font-black uppercase tracking-tighter transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 scale-90'}`}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div 
                      layoutId="nav-glow"
                      className="absolute inset-0 bg-primary-500/10 dark:bg-primary-500/20 rounded-2xl -z-10" 
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10 pb-32 sm:pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {activeTab === 'home' && <HomeTab words={words} userProfile={userProfile} streak={streak} coins={coins} setActiveTab={setActiveTab} />}
              {activeTab === 'list' && <DictionaryTab words={words} setWords={setWords} />}
              {activeTab === 'topics' && <TopicsTab words={words} setWords={setWords} />}
              {activeTab === 'practice' && <PracticeTab words={words} setWords={setWords} setStats={setStats} setCoins={setCoins} />}
              {activeTab === 'profile' && <ProfileTab words={words} stats={stats} userProfile={userProfile} streak={streak} user={user!} onEditProfile={() => setShowProfileModal(true)} />}
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

function HomeTab({ words, userProfile, streak, coins, setActiveTab }: { words: Word[], userProfile: UserProfile | null, streak: number, coins: number, setActiveTab: (tab: any) => void }) {
  const learnedToday = useMemo(() => {
    const today = getLocalDate();
    return words.filter(w => w.status === 'learned' && w.createdAt?.startsWith(today)).length;
  }, [words]);
  
  const dailyGoal = 5;
  const progress = Math.min(100, (learnedToday / dailyGoal) * 100);

  const wordOfTheDay = useMemo(() => {
    if (words.length === 0) return null;
    const seed = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % words.length;
    return words[index];
  }, [words]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Xayrli tun";
    if (hour < 12) return "Xayrli tong";
    if (hour < 18) return "Xayrli kun";
    return "Xayrli kech";
  }, []);

  return (
    <div className="space-y-8 pb-12">
      <header className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em] mb-1">{greeting}</p>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white">
            {userProfile?.displayName?.split(' ')[0] || 'Do\'stim'} <span className="inline-block animate-bounce">👋</span>
          </h1>
        </div>
        <button className="relative w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-500 hover:text-primary-500 transition-colors group">
          <Bell className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-orange-400 to-rose-500 p-0.5 rounded-[2rem] shadow-lg shadow-orange-500/20 group transition-all hover:scale-[1.02]">
          <div className="bg-white dark:bg-slate-900 rounded-[1.9rem] p-5 flex items-center gap-4 h-full">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
              <Flame className="w-6 h-6 text-orange-500 animate-pulse" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{streak}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Kunlik seriya</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-400 to-yellow-600 p-0.5 rounded-[2rem] shadow-lg shadow-amber-500/20 group transition-all hover:scale-[1.02]">
          <div className="bg-white dark:bg-slate-900 rounded-[1.9rem] p-5 flex items-center gap-4 h-full">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-2xl">
              🪙
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{coins}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Jami tangalar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black text-primary-500 uppercase tracking-[0.2em] mb-1">Kunlik progress</p>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {learnedToday} / {dailyGoal} <span className="text-slate-400 font-bold text-lg">so'z</span>
              </h2>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
              <Target className="w-7 h-7 text-primary-500" />
            </div>
          </div>
          
          <div className="relative h-4 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mb-8">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-400 to-secondary-500 rounded-full shadow-[0_0_20px_rgba(var(--primary-500),0.3)]"
            />
          </div>

          <button 
            onClick={() => setActiveTab('practice')}
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] hover:shadow-primary-500/20 flex items-center justify-center gap-3 group"
          >
            Mashqni boshlash
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {wordOfTheDay && (
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[3rem] p-8 text-white shadow-2xl shadow-indigo-500/30">
          <div className="relative z-10 flex flex-col items-center text-center">
            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.3em] mb-4">Kun so'zi</p>
            <span className="text-5xl mb-4">{wordOfTheDay.emoji || '📖'}</span>
            <h3 className="text-4xl font-black mb-1">{wordOfTheDay.original}</h3>
            <p className="text-lg text-indigo-100 font-medium opacity-80 mb-6 italic">{wordOfTheDay.translation}</p>
            
            <div className="w-full p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-sm text-left">
              <p className="font-bold text-indigo-200 mb-1">Ta'rif:</p>
              <p className="line-clamp-2">{wordOfTheDay.description || "Ushbu so'z uchun hali ta'rif qo'shilmagan."}</p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl" />
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-black text-slate-800 dark:text-white">Tezkor amallar</h3>
          <button className="text-xs font-bold text-primary-500">Hammasi</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { id: 'list', name: 'Lug\'at', icon: Book, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
            { id: 'topics', name: 'Kashfiyot', icon: Sparkles, color: 'text-secondary-500', bg: 'bg-secondary-50 dark:bg-secondary-500/10' },
            { id: 'practice', name: 'Tezkor Quiz', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
            { id: 'practice', name: 'Flashcards', icon: LayoutGrid, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          ].map((action, i) => (
            <button 
              key={i}
              onClick={() => setActiveTab(action.id as any)}
              className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all active:scale-95 flex flex-col items-center gap-4 group"
            >
              <div className={`w-16 h-16 rounded-[1.5rem] ${action.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <action.icon className={`w-8 h-8 ${action.color}`} />
              </div>
              <span className="font-black text-slate-700 dark:text-slate-200">{action.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopicsTab({ words, setWords }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>> }) {
  const TOPICS = [
    { id: 'shopping', name: 'Xaridlar', icon: ShoppingBag, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10', border: 'border-pink-100', gradient: 'from-pink-500 to-rose-500' },
    { id: 'travel', name: 'Sayohat', icon: Plane, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10', border: 'border-sky-100', gradient: 'from-sky-500 to-blue-500' },
    { id: 'food', name: 'Ovqat', icon: Coffee, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-100', gradient: 'from-amber-500 to-orange-500' },
    { id: 'business', name: 'Biznes', icon: Briefcase, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100', gradient: 'from-emerald-500 to-teal-500' },
    { id: 'education', name: 'Ta\'lim', icon: GraduationCap, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-100', gradient: 'from-indigo-500 to-purple-500' },
    { id: 'sports', name: 'Sport', icon: Trophy, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-100', gradient: 'from-orange-500 to-red-500' },
  ];

  const LEVELS = [
    { id: 'A1-A2', name: 'Boshlang\'ich', desc: 'Eng ko\'p ishlatiladigan oddiy so\'zlar', icon: '🌱' },
    { id: 'B1-B2', name: 'O\'rta', desc: 'Kundalik muloqot uchun kerakli so\'zlar', icon: '🌿' },
    { id: 'C1-C2', name: 'Murakkab', desc: 'Professional darajadagi atamalar', icon: '🌳' },
  ];

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('A1-A2');
  const [generatedWords, setGeneratedWords] = useState<any[]>([]);
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
      Return ONLY a JSON array of objects with 'original', 'translation', 'pronunciation', 'description', 'partOfSpeech', 'emoji', and 'uzbekExplanation' string properties. Do not include markdown formatting like \`\`\`json.`;
      
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      if (!response.text) throw new Error("No text returned");
      const newWords = JSON.parse(response.text.trim());
      if (Array.isArray(newWords)) {
        setGeneratedWords(newWords);
      }
    } catch (error) {
      console.error(error);
      alert("Xatolik yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddWord = (word: any) => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    setWords(prev => [{ ...word, id: newId, status: 'new', progress: 0, createdAt: new Date().toISOString() }, ...prev]);
    setAddedWords(prev => new Set(prev).add(word.original));
  };

  const handleAddAll = () => {
    const wordsToAdd = generatedWords.filter(w => !addedWords.has(w.original));
    if (wordsToAdd.length === 0) return;
    const newEntries = wordsToAdd.map(w => ({ ...w, id: Date.now().toString() + Math.random().toString(36).substring(7), status: 'new' as const, progress: 0, createdAt: new Date().toISOString() }));
    setWords(prev => [...newEntries, ...prev]);
    setAddedWords(new Set(generatedWords.map(w => w.original)));
  };

  return (
    <div className="space-y-8 pb-12">
      <header className="px-1">
        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Kashfiyot Hubi</h2>
        <p className="text-slate-500 font-medium">AI yordamida har qanday mavzuda so'zlar kashf qiling.</p>
      </header>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Mashhur mavzular</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => { setSelectedTopic(topic.id); setCustomTopic(''); }}
                  className={`relative p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 group overflow-hidden ${
                    selectedTopic === topic.id 
                      ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-500/10' 
                      : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${topic.bg} ${topic.color}`}>
                    <topic.icon className="w-7 h-7" />
                  </div>
                  <span className="font-black text-slate-700 dark:text-slate-200">{topic.name}</span>
                  {selectedTopic === topic.id && (
                    <motion.div layoutId="topic-active" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Yoki o'z mavzungiz</h3>
            <div className="relative group">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Masalan: 'Kosmos', 'Tibbiyot', 'Kriptovalyuta'..."
                value={customTopic}
                onChange={(e) => { setCustomTopic(e.target.value); setSelectedTopic(null); }}
                className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl text-sm font-bold focus:border-primary-500 outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Qiyinchilik darajasi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${
                    selectedLevel === level.id 
                      ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-500/10' 
                      : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50'
                  }`}
                >
                  <span className="text-2xl">{level.icon}</span>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white leading-tight">{level.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{level.id}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || (!selectedTopic && !customTopic.trim())}
            className="w-full py-5 bg-primary-500 hover:bg-primary-600 text-white font-black rounded-2xl shadow-xl shadow-primary-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
          >
            {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
            {isGenerating ? "AI kashf qilmoqda..." : "Yangi so'zlarni kashf qilish"}
          </button>
        </div>
      </div>

      {generatedWords.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white">Natijalar</h3>
              <p className="text-xs text-slate-400 font-bold">AI siz uchun 10 ta so'z tanladi</p>
            </div>
            <button 
              onClick={handleAddAll} 
              className="px-5 py-2.5 bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              Hammasini qo'shish
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatePresence>
              {generatedWords.map((word, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={idx} 
                  className="bg-white dark:bg-slate-800 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4 group hover:shadow-xl transition-all"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">
                    {word.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-slate-800 dark:text-white truncate text-lg">{word.original}</span>
                      <span className="text-[9px] font-black text-primary-500 uppercase bg-primary-50 dark:bg-primary-500/10 px-2 py-0.5 rounded italic">
                        {word.partOfSpeech}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-400 truncate">{word.translation}</p>
                  </div>
                  <button
                    onClick={() => handleAddWord(word)}
                    disabled={addedWords.has(word.original)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      addedWords.has(word.original) 
                        ? 'bg-emerald-50 text-emerald-500' 
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-400 hover:bg-primary-500 hover:text-white'
                    }`}
                  >
                    {addedWords.has(word.original) ? <CheckCircle2 className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}


function DictionaryTab({ words, setWords }: { words: Word[], setWords: React.Dispatch<React.SetStateAction<Word[]>> }) {
  const [newOriginal, setNewOriginal] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newPronunciation, setNewPronunciation] = useState('');
  const [newPartOfSpeech, setNewPartOfSpeech] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUzbekExplanation, setNewUzbekExplanation] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'learning' | 'mastered'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(words));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "oson-soz-lugat.json");
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setWords(prev => {
            const existing = new Set(prev.map(w => w.original.toLowerCase()));
            const next = [...prev];
            imported.forEach(iw => {
              if (iw.original && !existing.has(iw.original.toLowerCase())) {
                next.push({ ...iw, id: Date.now().toString() + Math.random().toString(36).substring(7), status: iw.status || 'new', progress: iw.progress || 0 });
              }
            });
            return next;
          });
          alert("Lug'at yuklandi!");
        }
      } catch (err) { alert("Xatolik!"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSuggest = async () => {
    if (!newOriginal.trim()) return;
    setIsSuggesting(true);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Analyze the word "${newOriginal.trim()}". Return JSON with 'original', 'translation', 'pronunciation', 'description', 'partOfSpeech', 'emoji', and 'uzbekExplanation'.`,
        config: { responseMimeType: "application/json" }
      });
      if (!response.text) throw new Error("No text");
      const data = JSON.parse(response.text.trim());
      setNewOriginal(data.original || newOriginal);
      setNewTranslation(data.translation || '');
      setNewPronunciation(data.pronunciation || '');
      setNewPartOfSpeech(data.partOfSpeech || '');
      setNewEmoji(data.emoji || '');
      setNewDescription(data.description || '');
      setNewUzbekExplanation(data.uzbekExplanation || '');
    } catch (error) { console.error(error); }
    finally { setIsSuggesting(false); }
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOriginal.trim() || !newTranslation.trim()) return;
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    setWords(prev => [{
      id: newId, original: newOriginal.trim(), translation: newTranslation.trim(), pronunciation: newPronunciation.trim(),
      description: newDescription.trim(), partOfSpeech: newPartOfSpeech.trim(), emoji: newEmoji.trim(),
      uzbekExplanation: newUzbekExplanation.trim(), status: 'new', progress: 0, createdAt: new Date().toISOString()
    }, ...prev]);
    setNewOriginal(''); setNewTranslation(''); setNewPronunciation(''); setNewPartOfSpeech(''); setNewEmoji(''); setNewDescription(''); setNewUzbekExplanation('');
  };

  const handleDelete = (id: string) => setWords(prev => prev.filter(w => w.id !== id));

  const filteredWords = words
    .filter(w => filter === 'all' ? true : w.status === filter)
    .filter(w => w.original.toLowerCase().includes(searchQuery.toLowerCase()) || w.translation.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-8 pb-24">
      <header className="px-1 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Mening Lug'atim</h2>
          <p className="text-slate-500 font-medium">{words.length} ta so'z mavjud</p>
        </div>
        <div className="flex gap-2">
          <label className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-primary-500 transition-all cursor-pointer">
            <Upload className="w-5 h-5" />
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleExport} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-primary-500 transition-all">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6 ml-1">Yangi so'z qo'shish</h3>
        <form onSubmit={handleAddWord} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative group">
              <input 
                type="text" 
                placeholder="Inglizcha so'z *" 
                value={newOriginal} 
                onChange={e => setNewOriginal(e.target.value)} 
                className="w-full pl-6 pr-14 py-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl text-sm font-bold focus:border-primary-500 outline-none transition-all" 
                required 
              />
              <button 
                type="button" 
                onClick={handleSuggest} 
                disabled={!newOriginal.trim() || isSuggesting} 
                className="absolute right-2.5 top-2.5 w-10 h-10 flex items-center justify-center text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-2xl transition-all disabled:opacity-30"
              >
                {isSuggesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              </button>
            </div>
            <input 
              type="text" 
              placeholder="O'zbekcha tarjimasi *" 
              value={newTranslation} 
              onChange={e => setNewTranslation(e.target.value)} 
              className="w-full px-6 py-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl text-sm font-bold focus:border-primary-500 outline-none transition-all" 
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={!newOriginal.trim() || !newTranslation.trim()} 
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Plus className="w-6 h-6" /> Lug'atga qo'shish
          </button>
        </form>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-1">
          <div className="relative w-full md:w-72 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Qidirish..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[1.5rem] w-full md:w-auto overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'Hammasi' },
              { id: 'new', label: 'Yangi' },
              { id: 'learning', label: 'O\'rganishda' },
              { id: 'mastered', label: 'Yodlangan' }
            ].map(f => (
              <button 
                key={f.id} 
                onClick={() => setFilter(f.id as any)} 
                className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === f.id ? 'bg-white dark:bg-slate-700 text-primary-500 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredWords.map((word, idx) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                key={word.id} 
                className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5 group hover:shadow-xl hover:border-primary-500/30 transition-all"
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform shadow-inner">
                  {word.emoji || '📖'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-slate-800 dark:text-white text-xl">{word.original}</span>
                    {word.partOfSpeech && (
                      <span className="text-[9px] font-black text-primary-500 uppercase bg-primary-50 dark:bg-primary-500/10 px-2 py-0.5 rounded italic">
                        {word.partOfSpeech}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-400">{word.translation}</p>
                </div>
                <div className="flex items-center gap-2">
                  {word.status === 'mastered' && (
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  <button 
                    onClick={() => handleDelete(word.id)} 
                    className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {filteredWords.length === 0 && (
            <div className="py-24 text-center bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">So'zlar topilmadi</h3>
              <p className="text-slate-400 font-bold">Qidiruv natijasida hech narsa topilmadi.</p>
            </div>
          )}
        </div>
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
    
    playUniversalTTS(
      currentWord.original,
      undefined,
      () => setIsSpeaking(false),
      () => setIsSpeaking(false)
    );
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
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{safeIndex + 1} / {words.length}</p>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Flashcards</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${((safeIndex + 1) / words.length) * 100}%` }}
              className="h-full bg-primary-500 rounded-full"
            />
          </div>
          <span className="text-xs font-bold text-primary-500">{Math.round(((safeIndex + 1) / words.length) * 100)}%</span>
        </div>
      </div>

      <div className="perspective-1000 w-full aspect-[3/4] sm:aspect-[4/5] cursor-pointer" onClick={handleFlip}>
        <motion.div
          className="w-full h-full relative preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 200, damping: 20 }}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-white dark:bg-slate-800 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 p-12 flex flex-col items-center justify-center text-center group">
            <div className="absolute top-8 left-8">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900 px-3 py-1 rounded-full">{currentWord.partOfSpeech || 'word'}</span>
            </div>
            
            <button 
              onClick={playTTS}
              disabled={isSpeaking}
              className="absolute top-6 right-6 p-4 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-500 hover:scale-110 active:scale-95 transition-all"
            >
              {isSpeaking ? <Loader2 className="w-6 h-6 animate-spin" /> : <Volume2 className="w-6 h-6" />}
            </button>

            <div className="w-32 h-32 rounded-[2.5rem] bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-7xl mb-8 group-hover:scale-110 transition-transform">
              {currentWord.emoji || '📖'}
            </div>
            
            <h2 className="text-5xl font-black text-slate-800 dark:text-slate-100 mb-4">{currentWord.original}</h2>
            {currentWord.pronunciation && <p className="text-xl text-slate-400 font-medium mb-6">[{currentWord.pronunciation}]</p>}
            {currentWord.description && <p className="text-slate-500 dark:text-slate-400 max-w-sm line-clamp-3 leading-relaxed">{currentWord.description}</p>}
            
            <div className="absolute bottom-8 text-slate-300 font-bold text-[10px] uppercase tracking-[0.2em] animate-pulse">Aylantirish uchun bosing</div>
          </div>

          {/* Back */}
          <div 
            className="absolute inset-0 backface-hidden bg-primary-500 rounded-[3.5rem] shadow-2xl p-12 flex flex-col items-center justify-center text-center text-white"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <h2 className="text-5xl font-black mb-8 drop-shadow-lg">{currentWord.translation}</h2>
            {currentWord.uzbekExplanation && (
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 max-w-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-2">Izoh</p>
                <p className="text-lg font-medium leading-relaxed">{currentWord.uzbekExplanation}</p>
              </div>
            )}
            <div className="absolute bottom-8 text-white/40 font-bold text-[10px] uppercase tracking-[0.2em]">Asliga qaytish</div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <button onClick={handlePrev} className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-primary-500 hover:scale-110 active:scale-95 transition-all shadow-sm">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <button 
          onClick={fetchExamples}
          disabled={isLoadingExamples || !!examples}
          className="px-10 py-5 bg-primary-500 text-white font-bold rounded-3xl shadow-lg hover:shadow-primary-500/25 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
        >
          {isLoadingExamples ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
          Misollar ko'rish
        </button>

        <button onClick={handleNext} className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-primary-500 hover:scale-110 active:scale-95 transition-all shadow-sm">
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>

      <AnimatePresence>
        {examples && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm"
          >
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary-500" />
              Qidiruv natijalari
            </h3>
            <div className="prose dark:prose-invert max-w-full text-slate-600 dark:text-slate-400">
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
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Foydalanuvchilar</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{users.length}</p>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Faol Seriyalar</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{activeStreakUsers}</p>
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Yodlangan</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{totalWords}</p>
            <GraduationCap className="w-5 h-5 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Jami Tangalar</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{totalCoins}</p>
            <span className="text-xl">🪙</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            Boshqaruv
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Qidiruv..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none w-full md:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foydalanuvchi</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Tanga</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">So'zlar</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">O't</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Sana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                        {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">{u.displayName?.[0]}</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm">{u.displayName || 'Anonim'}</div>
                        <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-amber-500 text-sm">{u.coins || 0}</td>
                  <td className="px-6 py-4 text-center font-bold text-primary-500 text-sm">{u.wordsLearned || 0}</td>
                  <td className="px-6 py-4 text-center font-bold text-orange-500 text-sm">{u.streak || 0}</td>
                  <td className="px-6 py-4 text-right text-[10px] font-bold text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function ProfileTab({ words, stats, userProfile, streak, user, onEditProfile }: { words: Word[], stats: Record<string, DailyStats>, userProfile: UserProfile | null, streak: number, user: User, onEditProfile: () => void }) {
  const totalLearned = words.filter(w => w.status === 'learned' || w.status === 'mastered').length;
  const totalWords = words.length;
  const coins = userProfile?.coins || 0;

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
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'public_profiles'), orderBy('wordsLearned', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const users: any[] = [];
      querySnapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() });
      });
      setLeaderboard(users);
      setIsLoadingLeaderboard(false);
    }, (error) => {
      setIsLoadingLeaderboard(false);
    });
    return () => unsubscribe();
  }, []);

  const totalTime = Object.values(stats || {}).reduce((acc, curr) => acc + ((curr as any)?.timeSpent || 0), 0);
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} soat ${m} daqiqa`;
    return `${m} daqiqa`;
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-6 right-6">
          <button onClick={onEditProfile} className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-primary-500 transition-all flex items-center justify-center">
            <Edit3 className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative mb-6">
          <div className="w-32 h-32 rounded-[2.5rem] p-1 bg-gradient-to-br from-primary-400 to-secondary-600 shadow-2xl">
            <div className="w-full h-full rounded-[2.3rem] overflow-hidden bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-800">
              {userProfile?.photoURL || user.photoURL ? (
                <img src={userProfile?.photoURL || user.photoURL || ''} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary-500 text-white text-4xl font-black">
                  {(userProfile?.displayName || user.displayName || '?')[0]}
                </div>
              )}
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 w-8 h-8 rounded-full border-4 border-white dark:border-slate-800 flex items-center justify-center shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
          </div>
        </div>

        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-1">
          {userProfile?.displayName || user.displayName || 'Bilimdon'}
        </h2>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 dark:bg-primary-500/10 rounded-full mb-8">
          <Trophy className="w-3.5 h-3.5 text-primary-500" />
          <span className="text-[10px] font-black text-primary-500 uppercase tracking-[0.2em]">{getLevelTitle(totalLearned)}</span>
        </div>

        <div className="grid grid-cols-3 w-full gap-4 pt-8 border-t border-slate-100 dark:border-slate-700">
          <div className="text-center">
            <p className="text-2xl font-black text-slate-800 dark:text-white">{totalLearned}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">So'zlar</p>
          </div>
          <div className="text-center border-x border-slate-100 dark:border-slate-700">
            <p className="text-2xl font-black text-slate-800 dark:text-white">{streak}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Seriya</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-slate-800 dark:text-white">{coins}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tangalar</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-primary-500" />
            </div>
            Statistika
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Jami o'qilgan vaqt</span>
              </div>
              <span className="text-lg font-black text-slate-800 dark:text-white">{formatTime(totalTime)}</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">O'rtacha aniqlik</span>
              </div>
              <span className="text-lg font-black text-slate-800 dark:text-white">85%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-500" />
            </div>
            Leaderboard
          </h3>
          <div className="space-y-3">
            {isLoadingLeaderboard ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
            ) : leaderboard.map((l, i) => (
              <div key={l.uid} className={`flex items-center justify-between p-3 rounded-2xl transition-all ${l.uid === user?.uid ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20 scale-[1.02]' : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-amber-600 text-amber-50' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                    {i + 1}
                  </div>
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0 border-2 border-white/20">
                    <img src={l.photoURL || `https://ui-avatars.com/api/?name=${l.displayName || 'U'}&background=random`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold truncate text-sm">{l.displayName || 'Noma\'lum'}</span>
                </div>
                <span className={`text-sm font-black ${l.uid === user?.uid ? 'text-white' : 'text-primary-500'}`}>{l.wordsLearned} so'z</span>
              </div>
            ))}
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
      <div className="text-center py-24 px-4 bg-white dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm max-w-2xl mx-auto">
        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
          <Dumbbell className="w-12 h-12 text-slate-300" />
        </div>
        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">So'zlar yetarli emas</h2>
        <p className="text-slate-500 font-medium max-w-sm mx-auto">Mashqlarni boshlash uchun lug'atda kamida 5 ta so'z bo'lishi kerak. Hozirda sizda {words.length} ta so'z bor.</p>
      </div>
    );
  }

  if (mode === 'menu') {
    const MODES = [
      { id: 'flashcards', name: 'Flashcards', desc: 'Xotirani mustahkamlash', icon: Layers, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
      { id: 'quiz', name: 'Tezkor Test', desc: 'Variantlar orasidan toping', icon: Zap, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
      { id: 'listening', name: 'Eshitib Topish', desc: 'Talaffuzga e\'tibor bering', icon: Volume2, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
      { id: 'spelling', name: 'Yozma Mashq', desc: 'To\'g\'ri yozishni o\'rganing', icon: Edit3, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
      { id: 'matching', name: 'So\'z Yomg\'iri', desc: 'Tezlik va aniqlik testi', icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
      { id: 'exam', name: 'Mukammal Test', desc: 'Yulduzli bilimdon bo\'ling', icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', premium: true },
    ];

    return (
      <div className="space-y-10 pb-24">
        <header className="px-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Bilimingizni Sinang</h2>
          <p className="text-slate-500 font-medium">Har bir to'g'ri javob uchun XP va tangalar oling.</p>
        </header>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODES.map((m, idx) => (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={`p-8 rounded-[3.5rem] border-2 transition-all text-left group relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 ${
                m.premium 
                ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-primary-500/50'
              }`}
            >
              <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-inner ${m.premium ? 'bg-white/10 dark:bg-slate-900/10' : m.bg}`}>
                <m.icon className={`w-8 h-8 ${m.premium ? 'text-white dark:text-slate-900' : m.color}`} />
              </div>
              <h3 className={`text-2xl font-black mb-1 ${m.premium ? 'text-white dark:text-slate-900' : 'text-slate-800 dark:text-white'}`}>{m.name}</h3>
              <p className={`text-sm font-bold ${m.premium ? 'text-white/60 dark:text-slate-900/60' : 'text-slate-400'}`}>{m.desc}</p>
              
              {m.premium && (
                <div className="absolute top-6 right-6">
                  <div className="px-3 py-1 bg-amber-400 text-amber-950 text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg">Premium</div>
                </div>
              )}
              
              {!m.premium && (
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-slate-50 dark:bg-slate-900/50 rounded-full blur-2xl group-hover:bg-primary-500/10 transition-colors" />
              )}
            </motion.button>
          ))}
        </div>
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
            <Target className="w-6 h-6 text-primary-500" />
            Yodlash tizimi haqida
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 mt-1 font-bold">1</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">Har bir so'z 0% dan boshlanadi. 4 xil mashqdan o'tishingiz kerak: Test, Yomg'ir, Eshitish va Yozish.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 mt-1 font-bold">2</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">Har bir mashq so'zga 25% o'sish beradi. 100% bo'lganda so'z "Yodlangan" deb hisoblanadi.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 mt-1 font-bold">3</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">"Mukammal Test" faqat 100% li so'zlar uchun. Undan o'tsangiz so'z butunlay master qilinadi.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 mt-1 font-bold">4</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">Agar mashqda xato qilsangiz, so'zning o'rganish darajasi pasayishi mumkin. Ehtiyot bo'ling!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'quiz') return <QuizMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  if (mode === 'flashcards') return <FlashcardsMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  if (mode === 'listening') return <ListeningMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  if (mode === 'matching') return <MatchingMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  if (mode === 'spelling') return <SpellingMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} />;
  if (mode === 'exam') return <ExamMode words={words} setWords={setWords} setStats={setStats} onBack={() => setMode('menu')} setCoins={setCoins} />;

  return null;
}

function QuizMode({ words, setWords, setStats, onBack }: any) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      const q = [...words].sort(() => 0.5 - Math.random()).map(word => {
        const others = [...words].filter(w => w.id !== word.id).sort(() => 0.5 - Math.random()).slice(0, 3);
        const options = [word, ...others].sort(() => 0.5 - Math.random());
        return { word, options };
      });
      setQuestions(q);
      initialized.current = true;
    }
  }, [words]);

  const handleAnswer = (optionId: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(optionId);
    
    const isCorrect = optionId === questions[currentIndex].word.id;
    if (isCorrect) {
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === questions[currentIndex].word.id ? updateWordProgress(w, 'quiz', true) : w));
    } else {
      setWords((prev: Word[]) => prev.map(w => w.id === questions[currentIndex].word.id ? updateWordProgress(w, 'quiz', false) : w));
    }

    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(i => i + 1);
        setSelectedAnswer(null);
      } else {
        setShowResult(true);
      }
    }, 1000);
  };

  if (questions.length === 0) return null;

  if (showResult) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Trophy className="w-12 h-12 text-indigo-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">Test Yakunlandi!</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">Natijangiz: <span className="text-indigo-600 font-black text-2xl">{score} / {questions.length}</span></p>
          <button 
            onClick={onBack} 
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl transition-all active:scale-[0.98]"
          >
            Menyuga qaytish
          </button>
        </motion.div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jarayon</span>
          <div className="text-sm font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 px-4 py-1 rounded-full">
            {currentIndex + 1} / {questions.length}
          </div>
        </div>
        <div className="text-indigo-600 font-black text-lg bg-indigo-50 dark:bg-indigo-500/10 px-4 py-1 rounded-full shadow-sm">
          {score}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 to-transparent dark:from-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mb-4">Tarjimasini toping</p>
        <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-4 group-hover:scale-105 transition-transform duration-500">{currentQ.word.original}</h2>
        {currentQ.word.pronunciation && (
          <div className="inline-flex items-center px-4 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">
            <Volume2 className="w-4 h-4 text-slate-400 mr-2" />
            <p className="text-sm font-bold text-slate-400 font-mono">[{currentQ.word.pronunciation}]</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="contents"
          >
            {currentQ.options.map((opt: any) => {
              let stateClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-white hover:border-indigo-500 hover:shadow-lg hover:-translate-y-1";
              if (selectedAnswer) {
                if (opt.id === currentQ.word.id) stateClass = "bg-emerald-500 border-emerald-400 text-white shadow-xl scale-[1.02] z-10";
                else if (opt.id === selectedAnswer) stateClass = "bg-rose-500 border-rose-400 text-white shadow-xl";
                else stateClass = "opacity-40 bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 scale-95";
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleAnswer(opt.id)}
                  disabled={!!selectedAnswer}
                  className={`p-6 rounded-[2.5rem] border-2 font-black text-lg transition-all flex items-center justify-between ${stateClass}`}
                >
                  {opt.translation}
                  <div className="flex items-center">
                    {selectedAnswer && opt.id === currentQ.word.id && <CheckCircle2 className="w-7 h-7" />}
                    {selectedAnswer && opt.id === selectedAnswer && opt.id !== currentQ.word.id && <XCircle className="w-7 h-7" />}
                  </div>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
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
      }, 450); 
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
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Layers className="w-12 h-12 text-blue-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">Mashq Yakunlandi!</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">Natijangiz: <span className="text-blue-600 font-black text-2xl">{score} / {questions.length}</span></p>
          <p className="text-lg text-emerald-600 dark:text-emerald-400 font-bold mb-12">{message}</p>
          <button 
            onClick={onBack} 
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl transition-all active:scale-[0.98]"
          >
            Menyuga qaytish
          </button>
        </motion.div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jarayon</span>
          <div className="text-sm font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 px-4 py-1 rounded-full">
            {currentIndex + 1} / {questions.length}
          </div>
        </div>
        <div className="text-blue-600 font-black text-lg bg-blue-50 dark:bg-blue-500/10 px-4 py-1 rounded-full shadow-sm">
          {score}
        </div>
      </div>

      <div className="relative w-full aspect-[3/4.5] sm:aspect-[3/4] perspective-1000 cursor-pointer group" onClick={() => !isTransitioning && setIsFlipped(!isFlipped)}>
        <motion.div 
          className="w-full h-full relative preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        >
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white dark:bg-slate-800 rounded-[3.5rem] shadow-2xl border-2 border-slate-50 dark:border-slate-700 flex flex-col items-center justify-center p-12 text-center">
            <div className="absolute top-8 left-8 w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
              <Eye className="w-6 h-6" />
            </div>
            {currentWord.emoji && <span className="text-8xl mb-8 group-hover:scale-110 transition-transform duration-500">{currentWord.emoji}</span>}
            <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-6 leading-tight break-words w-full">
              {currentWord.original}
            </h2>
            {currentWord.pronunciation && (
              <div className="px-6 py-2 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">
                <p className="text-lg font-bold text-slate-400 font-mono">[{currentWord.pronunciation}]</p>
              </div>
            )}
            <p className="text-slate-300 font-black text-[10px] uppercase tracking-[0.3em] absolute bottom-12">Tarjimasini ko'rish uchun bosing</p>
          </div>

          {/* Back */}
          <div 
            className="absolute w-full h-full backface-hidden bg-slate-900 dark:bg-white rounded-[3.5rem] shadow-2xl border-2 border-slate-800 dark:border-slate-100 flex flex-col items-center justify-center p-12 overflow-y-auto text-center"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <div className={`flex flex-col items-center justify-center w-full min-h-full transition-all duration-300 ${isTransitioning && !isFlipped ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
              <span className="text-blue-500 font-black text-[10px] uppercase tracking-[0.3em] mb-8">O'zbekcha tarjimasi</span>
              <h2 className="text-5xl font-black text-white dark:text-slate-900 mb-8 leading-tight break-words w-full">
                {currentWord.translation}
              </h2>
              {currentWord.uzbekExplanation && (
                <div className="p-6 bg-white/5 dark:bg-slate-900/5 rounded-3xl border border-white/10 dark:border-slate-900/10 w-full">
                  <p className="text-slate-400 dark:text-slate-500 text-sm font-bold leading-relaxed">
                    {currentWord.uzbekExplanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="w-full h-20">
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div 
              key="controls-front"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-4 h-full"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }}
                disabled={isTransitioning}
                className="flex-1 bg-white dark:bg-slate-800 text-slate-400 font-black rounded-3xl border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 shadow-sm"
              >
                <Eye className="w-6 h-6" /> Bilmayman
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleNext(true); }}
                disabled={isTransitioning}
                className="flex-1 bg-emerald-500 text-white font-black rounded-3xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 disabled:opacity-50 active:scale-95"
              >
                <CheckCircle2 className="w-6 h-6" /> Bilaman
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="controls-back"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex h-full"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); handleNext(false); }}
                disabled={isTransitioning}
                className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl hover:opacity-90 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
              >
                Keyingi so'z <ArrowRight className="w-6 h-6" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
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
  
  const initialized = useRef(false);
  const totalQuestions = words.length;

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      setQuestions([...words].sort(() => 0.5 - Math.random()));
      initialized.current = true;
    }
  }, [words]);

  useEffect(() => {
    if (questions.length > 0 && questionCount < questions.length) {
      loadNewQuestion(questions[questionCount]);
    }
  }, [questions, questionCount]);

  const generateAudio = (text: string) => {
    if (!text) return;
    setIsGeneratingAudio(true);
    setAudioError(null);
    playUniversalTTS(
      text,
      () => { setIsGeneratingAudio(false); setIsPlaying(true); },
      () => { setIsPlaying(false); },
      (err) => {
        console.error("Speech error:", err);
        setIsGeneratingAudio(false);
        setIsPlaying(false);
        setAudioError("Ovozni chalishda xatolik yuz berdi.");
      }
    );
  };

  const playAudio = () => {
    if (!currentWord || isPlaying || isGeneratingAudio) return;
    let textToRead = questionType === 'description' ? (currentWord.description || currentWord.original) : currentWord.original;
    if (questionType === 'description' && currentWord.description) {
      const regex = new RegExp(`\\b${currentWord.original}\\b`, 'gi');
      textToRead = currentWord.description.replace(regex, 'this word');
    }
    generateAudio(textToRead);
  };

  const loadNewQuestion = (target: Word) => {
    setResult(null);
    setAudioError(null);
    setUserInput('');
    const progressRatio = questionCount / totalQuestions;
    let type: 'word' | 'description' | 'dictation' = 'word';
    if (progressRatio >= 0.7) type = 'dictation';
    else if (progressRatio >= 0.4 && target.description) type = 'description';
    
    setQuestionType(type);
    setCurrentWord(target);
    
    if (type !== 'dictation') {
      const wrong = [...words].filter(w => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      setOptions([target, ...wrong].sort(() => 0.5 - Math.random()));
    }

    setTimeout(() => {
      let text = type === 'description' ? (target.description || target.original) : target.original;
      if (type === 'description' && target.description) {
        const regex = new RegExp(`\\b${target.original}\\b`, 'gi');
        text = target.description.replace(regex, 'this word');
      }
      generateAudio(text);
    }, 800);
  };

  const handleAnswer = (option: Word) => {
    if (result) return;
    const isCorrect = option.id === currentWord?.id;
    setResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord!.id ? updateWordProgress(w, 'listening', true) : w));
    } else {
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord!.id ? updateWordProgress(w, 'listening', false) : w));
    }
    setTimeout(() => setQuestionCount(c => c + 1), 1500);
  };

  const checkDictation = () => {
    if (result || !userInput.trim()) return;
    const isCorrect = userInput.trim().toLowerCase() === currentWord?.original.toLowerCase();
    setResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord!.id ? updateWordProgress(w, 'listening', true) : w));
    } else {
      setWords((prev: Word[]) => prev.map(w => w.id === currentWord!.id ? updateWordProgress(w, 'listening', false) : w));
    }
    setTimeout(() => setQuestionCount(c => c + 1), 2000);
  };

  if (questionCount >= totalQuestions && totalQuestions > 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-pink-50 dark:bg-pink-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Trophy className="w-12 h-12 text-pink-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">Mashq Yakunlandi!</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">Natijangiz: <span className="text-pink-600 font-black text-2xl">{score} / {totalQuestions}</span></p>
          <button 
            onClick={onBack} 
            className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl transition-all active:scale-[0.98]"
          >
            Menyuga qaytish
          </button>
        </motion.div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jarayon</span>
          <div className="text-sm font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 px-4 py-1 rounded-full">
            {questionCount + 1} / {totalQuestions}
          </div>
        </div>
        <div className="text-pink-600 font-black text-lg bg-pink-50 dark:bg-pink-500/10 px-4 py-1 rounded-full shadow-sm">
          {score}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-pink-50/50 to-transparent dark:from-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <button
          onClick={playAudio}
          disabled={isPlaying || isGeneratingAudio}
          className={`w-36 h-36 rounded-[2.5rem] flex items-center justify-center mx-auto transition-all relative z-10 ${
            isPlaying || isGeneratingAudio ? 'bg-pink-500 text-white scale-110 shadow-2xl shadow-pink-500/40' : 'bg-slate-50 dark:bg-slate-900 text-pink-500 hover:bg-pink-50 shadow-inner'
          }`}
        >
          {isGeneratingAudio ? <Loader2 className="w-16 h-16 animate-spin" /> : (
            <div className="relative">
              <Volume2 className="w-16 h-16" />
              {isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-white/20 rounded-full animate-ping" />
                </div>
              )}
            </div>
          )}
        </button>
        
        <div className="mt-10">
          <p className="text-xl font-black text-slate-800 dark:text-white mb-2">
            {questionType === 'description' ? "Ta'rifni tinglang" : questionType === 'dictation' ? "So'zni tinglang" : "So'zni tinglang"}
          </p>
          <p className="text-sm text-slate-400 font-bold">
            {questionType === 'description' ? "va so'zni variantlar orasidan toping" : questionType === 'dictation' ? "va uni to'g'ri yozing" : "va tarjimasini toping"}
          </p>
        </div>

        {audioError && (
          <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-500 text-xs font-bold rounded-xl border border-rose-100 dark:border-rose-900/30">
            {audioError}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={questionCount}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-4"
        >
          {questionType === 'dictation' ? (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  disabled={!!result}
                  placeholder="Shu yerga yozing..."
                  className={`w-full p-8 bg-white dark:bg-slate-800 border-2 rounded-[2rem] outline-none font-black text-2xl text-center shadow-sm transition-all ${
                    result === 'correct' ? 'border-emerald-500 text-emerald-600' : result === 'incorrect' ? 'border-rose-500 text-rose-600' : 'border-slate-100 dark:border-slate-700 focus:border-pink-500'
                  }`}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && checkDictation()}
                />
                {!result && (
                  <button 
                    onClick={checkDictation}
                    className="absolute right-4 top-4 bottom-4 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl shadow-lg active:scale-95 transition-all"
                  >
                    OK
                  </button>
                )}
              </div>
              {result === 'incorrect' && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="p-6 bg-rose-50 dark:bg-rose-500/10 rounded-3xl border border-rose-100 dark:border-rose-900/30 text-center"
                >
                  <p className="text-rose-400 text-[10px] font-black uppercase tracking-widest mb-1">To'g'ri javob</p>
                  <p className="text-rose-600 dark:text-rose-400 text-2xl font-black">{currentWord?.original}</p>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {options.map((opt, i) => {
                 let stateClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-pink-500 hover:shadow-lg hover:-translate-y-1";
                 if (result) {
                   if (opt.id === currentWord?.id) stateClass = "bg-emerald-500 border-emerald-400 text-white shadow-xl scale-[1.02] z-10";
                   else if (result === 'incorrect' && opt.id !== currentWord?.id) stateClass = "opacity-40 pointer-events-none scale-95";
                 }
                 return (
                   <button
                     key={i}
                     onClick={() => handleAnswer(opt)}
                     disabled={!!result}
                     className={`p-6 rounded-[2rem] border-2 font-black text-lg transition-all flex items-center justify-center gap-3 ${stateClass}`}
                   >
                     {questionType === 'description' ? opt.original : opt.translation}
                     {result && opt.id === currentWord?.id && <CheckCircle2 className="w-5 h-5" />}
                   </button>
                 );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
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
  const [speed, setSpeed] = useState(4.0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      setQueue([...words].sort(() => 0.5 - Math.random()));
      initialized.current = true;
    }
  }, [words]);

  useEffect(() => {
    if (gameState === 'playing' && currentIndex < queue.length) {
      const current = queue[currentIndex];
      const others = words.filter((w: Word) => w.id !== current.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      setOptions([current, ...others].sort(() => 0.5 - Math.random()));
      setFeedback(null);
    } else if (gameState === 'playing' && currentIndex >= queue.length) {
      setGameState('won');
    }
  }, [currentIndex, gameState, queue, words]);

  const handleAnswer = (selectedId: string) => {
    if (gameState !== 'playing' || feedback) return;
    if (selectedId === 'timeout') {
      handleMistake();
      return;
    }
    const isCorrect = selectedId === queue[currentIndex].id;
    if (isCorrect) {
      setFeedback('correct');
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === queue[currentIndex].id ? updateWordProgress(w, 'matching', true) : w));
      setSpeed(s => Math.max(2.0, s * 0.95));
      setTimeout(() => setCurrentIndex(i => i + 1), 300);
    } else {
      handleMistake();
    }
  };

  const handleMistake = () => {
    setFeedback('incorrect');
    setWords((prev: Word[]) => prev.map(w => w.id === queue[currentIndex].id ? updateWordProgress(w, 'matching', false) : w));
    setLives(l => {
      if (l <= 1) { setGameState('gameover'); return 0; }
      setTimeout(() => setCurrentIndex(i => i + 1), 500);
      return l - 1;
    });
  };

  if (gameState === 'start') {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Sparkles className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-4">So'z Yomg'iri</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">So'zlar tushib ketmasidan ularning tarjimasini toping! Tezlik va aniqlik muhim.</p>
          <div className="flex gap-4">
            <button onClick={onBack} className="flex-1 py-5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-black rounded-3xl active:scale-95 transition-all">Orqaga</button>
            <button onClick={() => setGameState('playing')} className="flex-1 py-5 bg-emerald-500 text-white font-black rounded-3xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all">Boshlash</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'gameover' || gameState === 'won') {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          {gameState === 'won' ? <Trophy className="w-24 h-24 text-emerald-500 mx-auto mb-8" /> : <XCircle className="w-24 h-24 text-rose-500 mx-auto mb-8" />}
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">{gameState === 'won' ? 'G\'alaba!' : 'O\'yin Tugadi'}</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">Natijangiz: <span className="text-emerald-600 font-black text-2xl">{score} / {queue.length}</span></p>
          <button onClick={onBack} className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl active:scale-95 transition-all">Menyuga qaytish</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-[650px] bg-white dark:bg-slate-800 rounded-[3.5rem] border-4 border-slate-100 dark:border-slate-700 overflow-hidden relative flex flex-col shadow-2xl">
      <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl flex justify-between items-center z-10 border-b border-slate-100 dark:border-slate-700">
        <div className="flex gap-1.5">
          {[...Array(3)].map((_, i) => (
            <motion.div
              animate={{ scale: i < lives ? 1 : 0.8, opacity: i < lives ? 1 : 0.3 }}
              key={i}
            >
              <Heart className={`w-7 h-7 ${i < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-300 dark:text-slate-600'}`} />
            </motion.div>
          ))}
        </div>
        <div className="px-4 py-1 bg-slate-100 dark:bg-slate-900 rounded-full">
           <span className="text-sm font-black text-slate-800 dark:text-white">{score} / {queue.length}</span>
        </div>
      </div>

      <div className={`flex-1 relative overflow-hidden transition-colors duration-300 ${feedback === 'incorrect' ? 'bg-rose-50/50 dark:bg-rose-900/10' : feedback === 'correct' ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-slate-50/30 dark:bg-slate-900/20'}`}>
        <AnimatePresence>
          {!feedback && queue[currentIndex] && (
            <motion.div
              key={currentIndex}
              initial={{ top: '-10%', opacity: 0 }}
              animate={{ top: '100%', opacity: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: speed, ease: 'linear' }}
              onAnimationComplete={() => handleAnswer('timeout')}
              className="absolute left-1/2 -translate-x-1/2"
            >
              <div className="px-10 py-5 bg-white dark:bg-slate-700 rounded-3xl shadow-2xl border-2 border-emerald-500/30 flex flex-col items-center gap-2">
                 {queue[currentIndex].emoji && <span className="text-4xl">{queue[currentIndex].emoji}</span>}
                 <span className="text-3xl font-black text-slate-800 dark:text-white whitespace-nowrap">{queue[currentIndex].original}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {feedback === 'incorrect' && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-rose-500/10 backdrop-blur-[2px]">
              <XCircle className="w-24 h-24 text-rose-500" />
           </motion.div>
        )}
        {feedback === 'correct' && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 backdrop-blur-[2px]">
              <CheckCircle2 className="w-24 h-24 text-emerald-500" />
           </motion.div>
        )}
      </div>

      <div className="p-8 grid grid-cols-2 gap-4 bg-white dark:bg-slate-800 z-10 border-t border-slate-100 dark:border-slate-700">
        {options.map((opt, idx) => (
          <motion.button
            whileTap={{ scale: 0.95 }}
            key={opt.id + idx}
            onClick={() => handleAnswer(opt.id)}
            disabled={!!feedback}
            className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 font-black text-slate-700 dark:text-white hover:border-emerald-500 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            {opt.translation}
          </motion.button>
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
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && words.length > 0) {
      setQuestions([...words].sort(() => 0.5 - Math.random()));
      initialized.current = true;
    }
  }, [words]);

  const currentWord = questions[currentIndex];

  const playWordAudio = () => {
    if (!currentWord || isGeneratingAudio) return;
    setIsGeneratingAudio(true);
    playUniversalTTS(currentWord.original, () => {}, () => setIsGeneratingAudio(false), () => setIsGeneratingAudio(false));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (feedback || !input.trim()) return;
    const isCorrect = input.trim().toLowerCase() === questions[currentIndex].original.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setScore(s => s + 1);
      setWords((prev: Word[]) => prev.map(w => w.id === questions[currentIndex].id ? updateWordProgress(w, 'spelling', true) : w));
    } else {
      setWords((prev: Word[]) => prev.map(w => w.id === questions[currentIndex].id ? updateWordProgress(w, 'spelling', false) : w));
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      setInput('');
      setFeedback(null);
    } else {
      setFeedback('done' as any);
    }
  };

  if (questions.length === 0) return null;
  if (feedback === 'done' as any) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-cyan-50 dark:bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Edit3 className="w-12 h-12 text-cyan-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">Mashq Yakunlandi!</h2>
          <p className="text-lg text-slate-500 font-medium mb-12">Natijangiz: <span className="text-cyan-600 font-black text-2xl">{score} / {questions.length}</span></p>
          <button onClick={onBack} className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl shadow-xl active:scale-95 transition-all">Menyuga qaytish</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Jarayon</span>
          <div className="text-sm font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 px-4 py-1 rounded-full">
            {currentIndex + 1} / {questions.length}
          </div>
        </div>
        <div className="text-cyan-600 font-black text-lg bg-cyan-50 dark:bg-cyan-500/10 px-4 py-1 rounded-full shadow-sm">
          {score}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-50/50 to-transparent dark:from-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] mb-8">O'zbekchadan tarjima qiling</p>
        <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-4 group-hover:scale-105 transition-transform duration-500">{currentWord.translation}</h2>
        <button 
          type="button"
          onClick={playWordAudio} 
          disabled={isGeneratingAudio}
          className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 text-cyan-500 hover:bg-cyan-50 transition-all border border-slate-100 dark:border-slate-800 active:scale-90"
        >
          {isGeneratingAudio ? <Loader2 className="w-6 h-6 animate-spin" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!!feedback}
            placeholder="Inglizcha so'zni yozing..."
            className={`w-full p-8 bg-white dark:bg-slate-800 border-2 rounded-[2.5rem] outline-none font-black text-3xl text-center shadow-xl transition-all ${
              feedback === 'correct' ? 'border-emerald-500 text-emerald-600' : feedback === 'incorrect' ? 'border-rose-500 text-rose-600' : 'border-slate-100 dark:border-slate-700 focus:border-cyan-500'
            }`}
            autoFocus
          />
          {input && !feedback && (
             <motion.button 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               type="submit"
               className="absolute right-4 top-4 bottom-4 px-8 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-[1.5rem] shadow-lg active:scale-95 transition-all"
             >
               OK
             </motion.button>
          )}
        </div>

        {feedback === 'incorrect' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 bg-rose-50 dark:bg-rose-500/10 rounded-[2.5rem] border border-rose-100 dark:border-rose-900/30 text-center"
          >
            <p className="text-rose-400 text-[10px] font-black uppercase tracking-widest mb-2">To'g'ri javob</p>
            <p className="text-rose-600 dark:text-rose-400 text-4xl font-black">{currentWord.original}</p>
          </motion.div>
        )}
        {feedback && (
          <button type="button" onClick={handleNext} className="w-full py-6 bg-cyan-500 text-white font-black text-xl rounded-[2rem] shadow-lg active:scale-95 transition-all">Keyingisi</button>
        )}
      </form>
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
    let eligibleWords = [];
    if (type === 'new') {
      eligibleWords = words.filter((w: Word) => w.status === 'ready_for_exam');
    } else {
      eligibleWords = words.filter((w: Word) => w.status === 'ready_for_exam' || w.status === 'mastered');
    }
    
    const shuffled = [...eligibleWords].sort(() => 0.5 - Math.random()).slice(0, 10);
    setExamWords(shuffled);
    setExamType(type);
    setCurrentIndex(0);
    setScore(0);
    setFeedback(null);
    setShowResult(false);
    setUserInput('');
    setTimeLeft(6000);
  };

  const currentWord = examWords[currentIndex];

  const handleCorrect = useCallback(() => {
    if (feedback) return;
    setFeedback('correct');
    setScore(s => s + 1);
    setCoins((c: number) => c + 1);
    setWords((prev: Word[]) => prev.map(w => w.id === currentWord.id ? { ...w, status: 'mastered', progress: 100 } : w));
    setTimeout(handleNext, 1500);
  }, [currentWord, setWords, setCoins, feedback]);

  const handleIncorrect = useCallback(() => {
    if (feedback) return;
    setFeedback('incorrect');
    setShowAnswer(true);
    setWords((prev: Word[]) => prev.map(w => w.id === currentWord.id ? updateWordProgress(w, 'exam', false) : w));
    setTimeout(handleNext, 2500);
  }, [currentWord, setWords, feedback]);

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
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl"
        >
          <div className="w-24 h-24 bg-amber-50 dark:bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Trophy className="w-12 h-12 text-amber-500" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-8">Mukammal Test</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-12">
            <motion.button 
              whileHover={{ y: -5 }}
              onClick={() => startExam('new')} 
              disabled={newCount === 0} 
              className={`p-8 rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden ${newCount > 0 ? 'border-amber-100 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-400' : 'border-slate-100 bg-slate-50 dark:bg-slate-800 opacity-50 cursor-not-allowed'}`}
            >
              <div className="relative z-10">
                <h3 className="text-xl font-black text-amber-700 dark:text-amber-400 mb-1">Yangi so'zlar</h3>
                <p className="text-sm text-amber-600/70 font-bold">{newCount} ta so'z tayyor</p>
              </div>
              <Sparkles className="absolute -bottom-2 -right-2 w-16 h-16 text-amber-500/10" />
            </motion.button>
            <motion.button 
              whileHover={{ y: -5 }}
              onClick={() => startExam('all')} 
              disabled={allCount === 0} 
              className={`p-8 rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden ${allCount > 0 ? 'border-purple-100 bg-purple-50/50 dark:bg-purple-900/10 hover:border-purple-400' : 'border-slate-100 bg-slate-50 dark:bg-slate-800 opacity-50 cursor-not-allowed'}`}
            >
              <div className="relative z-10">
                <h3 className="text-xl font-black text-purple-700 dark:text-purple-400 mb-1">Barcha so'zlar</h3>
                <p className="text-sm text-purple-600/70 font-bold">{allCount} ta so'z jami</p>
              </div>
              <Layers className="absolute -bottom-2 -right-2 w-16 h-16 text-purple-500/10" />
            </motion.button>
          </div>
          <button onClick={onBack} className="w-full py-5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-black rounded-3xl active:scale-95 transition-all">Orqaga</button>
        </motion.div>
      </div>
    );
  }

  if (showResult) {
    const percentage = examWords.length > 0 ? score / examWords.length : 0;
    if (!messageRef.current) messageRef.current = getMotivationalMessage(percentage);
    const message = messageRef.current;

    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 dark:bg-white p-12 rounded-[4rem] shadow-2xl relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent" />
          <div className="relative z-10">
            <Trophy className="w-24 h-24 text-amber-400 mx-auto mb-8 animate-bounce" />
            <h2 className="text-5xl font-black text-white dark:text-slate-900 mb-4">Test Yakunlandi!</h2>
            <div className="flex justify-center gap-8 mb-12">
               <div className="text-center">
                  <p className="text-white/40 dark:text-slate-400 text-xs font-bold uppercase mb-1">Natija</p>
                  <p className="text-white dark:text-slate-900 text-3xl font-black">{score} / {examWords.length}</p>
               </div>
               <div className="text-center">
                  <p className="text-white/40 dark:text-slate-400 text-xs font-bold uppercase mb-1">Tangalar</p>
                  <p className="text-amber-400 text-3xl font-black">+{score}</p>
               </div>
            </div>
            <p className="text-amber-400/80 font-bold mb-12 text-lg italic">"{message}"</p>
            <button onClick={onBack} className="w-full py-6 bg-amber-400 text-slate-900 font-black rounded-[2rem] shadow-xl hover:bg-amber-300 transition-all active:scale-95">Menyuga qaytish</button>
          </div>
        </motion.div>
      </div>
    );
  }

  const displayTime = Math.ceil(timeLeft / 1000);

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className={`px-4 py-1 rounded-full font-black text-lg shadow-sm transition-colors ${displayTime <= 2 ? 'bg-rose-500 text-white animate-pulse' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-500'}`}>
            {displayTime}s
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-sm font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 px-6 py-1.5 rounded-full">
            {currentIndex + 1} / {examWords.length}
          </div>
        </div>
        <div className="text-amber-500 font-black text-xl flex items-center gap-2">
           <Trophy className="w-5 h-5" /> {score}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-12 rounded-[4rem] border-4 border-slate-100 dark:border-slate-700 shadow-2xl text-center relative overflow-hidden group">
        <div className="absolute top-0 left-0 h-2 bg-amber-500 transition-all duration-100" style={{ width: `${(timeLeft / 6000) * 100}%` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 to-transparent dark:from-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-8">Mukammal imtihon</p>
        <h2 className="text-5xl font-black text-slate-800 dark:text-white mb-6 group-hover:scale-105 transition-transform duration-500">{currentWord.translation}</h2>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Inglizcha tarjimasini yozing</p>
      </div>

      <form 
        onSubmit={(e) => { 
          e.preventDefault(); 
          if (userInput.trim().toLowerCase() === currentWord.original.toLowerCase()) handleCorrect(); 
          else handleIncorrect(); 
        }} 
        className="space-y-6"
      >
        <div className="relative">
          <input
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            disabled={!!feedback}
            placeholder="Bu yerga yozing..."
            className={`w-full p-8 bg-white dark:bg-slate-800 border-4 rounded-[3rem] outline-none font-black text-3xl text-center shadow-2xl transition-all ${
              feedback === 'correct' ? 'border-emerald-500 text-emerald-600' : feedback === 'incorrect' ? 'border-rose-500 text-rose-600' : 'border-slate-100 dark:border-slate-700 focus:border-amber-500'
            }`}
            autoFocus
          />
          {userInput && !feedback && (
             <button 
              type="submit"
              className="absolute right-6 top-6 bottom-6 px-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-[2rem] shadow-xl active:scale-95"
             >
               OK
             </button>
          )}
        </div>

        {showAnswer && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 bg-rose-50 dark:bg-rose-500/10 rounded-[3rem] border border-rose-100 dark:border-rose-900/30 text-center"
          >
            <p className="text-rose-400 text-[10px] font-black uppercase tracking-widest mb-2">To'g'ri javob</p>
            <p className="text-rose-600 dark:text-rose-400 text-4xl font-black">{currentWord.original}</p>
          </motion.div>
        )}
      </form>
    </div>
  );
}
