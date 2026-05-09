/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, 
  Settings, 
  Layout as LayoutIcon, 
  Plus, 
  Brain, 
  Award, 
  User as UserIcon,
  ChevronRight,
  LogOut,
  Bell,
  Sparkles,
  LucideIcon
} from 'lucide-react';
import { auth, db, signIn, logOut, handleFirestoreError, OperationType } from './lib/firebase.ts';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  limit,
  orderBy
} from 'firebase/firestore';
import { cn } from './lib/utils.ts';
import { SRSCard, calculateNextReview } from './lib/srs.ts';
import { generateIELTSCards, generateDailyTest } from './lib/gemini.ts';
import { format } from 'date-fns';

// --- Types ---
type View = 'dashboard' | 'study' | 'cards' | 'test' | 'settings';

interface DailyTest {
  id: string;
  type: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  status: 'pending' | 'completed';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [cards, setCards] = useState<SRSCard[]>([]);
  const [dailyTest, setDailyTest] = useState<DailyTest | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch Cards
    const cardsQuery = query(collection(db, 'cards'), where('userId', '==', user.uid));
    const unsubCards = onSnapshot(cardsQuery, (snapshot) => {
      const cardData = snapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        // Handle Firestore Timestamps
        nextReview: d.data().nextReview?.toDate?.() || new Date(d.data().nextReview)
      } as unknown as SRSCard));
      setCards(cardData);
    });

    // Fetch Daily Test
    const testsQuery = query(
      collection(db, 'tests'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsubTests = onSnapshot(testsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const test = snapshot.docs[0];
        setDailyTest({ id: test.id, ...test.data() } as DailyTest);
      } else {
        setDailyTest(null);
      }
    });

    return () => {
      unsubCards();
      unsubTests();
    };
  }, [user]);

  const handleCreateTest = async () => {
    if (!user) return;
    try {
      const testData = await generateDailyTest();
      await addDoc(collection(db, 'tests'), {
        ...testData,
        userId: user.uid,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'tests');
    }
  };

  const handleGenerateCards = async () => {
    if (!user) return;
    try {
      const newCards = await generateIELTSCards();
      for (const card of newCards) {
        await addDoc(collection(db, 'cards'), {
          ...card,
          userId: user.uid,
          status: 'new',
          ease: 2.5,
          interval: 0,
          repetitions: 0,
          nextReview: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'cards');
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50 text-emerald-600">
      <Sparkles className="animate-pulse w-12 h-12" />
    </div>
  );

  if (!user) return (
    <div className="flex h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-teal-100 font-sans">
      <div className="max-w-xs text-center space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-xl space-y-4">
          <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <Brain className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">IELTS Ace</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Prepare for your IELTS exam with a smart Spaced Repetition System. AI-powered flashcards and daily practice tests.
          </p>
        </div>
        <button 
          onClick={signIn}
          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-semibold shadow-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" className="w-5 h-5 bg-white rounded p-0.5" alt="Google" />
          Sign in with Google
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-gray-50 font-sans text-gray-900 max-w-md mx-auto relative overflow-hidden shadow-2xl">
      {/* --- Top Bar --- */}
      <header className="p-6 flex items-center justify-between pb-2">
        <div>
          <h2 className="text-2xl font-bold">Hello, {user.displayName?.split(' ')[0]}</h2>
          <p className="text-gray-500 text-xs font-medium uppercase tracking-widest pt-1">Ready for IELTS?</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNotification(!showNotification)} className="p-2 bg-white rounded-full shadow-sm relative">
            <Bell size={20} className={cn(cards.filter(c => new Date(c.nextReview) <= new Date()).length > 0 && "text-emerald-600 animate-bounce")} />
            {cards.filter(c => new Date(c.nextReview) <= new Date()).length > 0 && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>
          <button onClick={() => setCurrentView('settings')} className="overflow-hidden w-10 h-10 rounded-full border-2 border-white shadow-sm bg-gray-200">
            {user.photoURL && <img src={user.photoURL} alt="avatar" />}
          </button>
        </div>
      </header>

      {/* --- Notification Toast (Simulated Push) --- */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-6 right-6 z-50 bg-white p-4 rounded-2xl shadow-2xl border border-emerald-100 flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <Brain size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold">Time for review!</h4>
              <p className="text-xs text-gray-500">You have {cards.filter(c => new Date(c.nextReview) <= new Date()).length} words due today.</p>
            </div>
            <button onClick={() => { setCurrentView('study'); setShowNotification(false); }} className="text-emerald-600 p-2 font-bold text-sm">Review</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        {currentView === 'dashboard' && (
          <Dashboard 
            cards={cards} 
            test={dailyTest} 
            onCreateTest={handleCreateTest}
            onGenerateCards={handleGenerateCards}
            setView={setCurrentView}
          />
        )}
        {currentView === 'study' && (
          <StudyView 
            cards={cards.filter(c => new Date(c.nextReview) <= new Date() || c.status === 'new')} 
            onComplete={() => setCurrentView('dashboard')}
          />
        )}
        {currentView === 'test' && dailyTest && (
          <TestView test={dailyTest} onComplete={() => setCurrentView('dashboard')} />
        )}
        {currentView === 'cards' && (
          <CardManager cards={cards} />
        )}
        {currentView === 'settings' && (
          <SettingsView user={user} onLogOut={logOut} />
        )}
      </main>

      {/* --- Tab Bar --- */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-xl border-t border-gray-100 px-8 py-4 flex items-center justify-between z-40">
        <NavButton Icon={LayoutIcon} label="Home" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
        <NavButton Icon={BookOpen} label="Study" active={currentView === 'study'} onClick={() => setCurrentView('study')} />
        <NavButton Icon={Brain} label="Cards" active={currentView === 'cards'} onClick={() => setCurrentView('cards')} />
        <NavButton Icon={Settings} label="Profile" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
      </nav>
    </div>
  );
}

// --- Sub-components ---

function NavButton({ Icon, label, active, onClick }: { Icon: LucideIcon, label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1 transition-all",
      active ? "text-emerald-600 scale-110" : "text-gray-400"
    )}>
      <Icon size={24} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Dashboard({ cards, test, onCreateTest, onGenerateCards, setView }: any) {
  const dueCount = cards.filter((c: any) => new Date(c.nextReview) <= new Date()).length;
  const newCount = cards.filter((c: any) => c.status === 'new').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Grid */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-200/50 relative overflow-hidden h-32">
          <div className="relative z-10">
            <span className="text-4xl font-bold">{dueCount}</span>
            <p className="text-sm opacity-80 font-medium">Due Today</p>
          </div>
          <Award className="absolute -bottom-2 -right-2 text-white/10 w-24 h-24" />
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32">
          <div>
            <span className="text-3xl font-bold text-gray-900">{newCount}</span>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">New Words</p>
          </div>
          <button onClick={onGenerateCards} className="mt-2 text-xs text-emerald-600 font-bold flex items-center gap-1 hover:underline">
            <Plus size={14} /> Get More
          </button>
        </div>
      </section>

      {/* Daily Test Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Daily Practice</h3>
          <Award className="text-amber-500" />
        </div>
        {!test ? (
          <div className="bg-white p-8 rounded-3xl border-2 border-dashed border-gray-200 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 px-4">Generate your custom IELTS reading or listening test for today.</p>
            <button 
              onClick={onCreateTest}
              className="bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg hover:bg-black transition active:scale-95"
            >
              Generate Test
            </button>
          </div>
        ) : (
          <div 
            onClick={() => setView('test')}
            className={cn(
              "p-6 rounded-3xl cursor-pointer transition relative group",
              test.status === 'completed' ? "bg-gray-100 border-none" : "bg-white border border-gray-200 hover:border-emerald-300"
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className={cn(
                  "text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg mb-2 inline-block",
                  test.status === 'completed' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                )}>
                  {test.type} • {test.status}
                </span>
                <h4 className="font-bold text-gray-900 line-clamp-2">{test.question}</h4>
              </div>
              <ChevronRight className="text-gray-300 group-hover:text-emerald-500 transition" />
            </div>
          </div>
        )}
      </section>

      {/* Deck Quick Look */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Your Vocabulary</h3>
          <button onClick={() => setView('cards')} className="text-sm text-emerald-600 font-bold">See All</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {cards.slice(0, 3).map((card: any) => (
            <div key={card.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-2 h-8 bg-emerald-100 rounded-full group-hover:bg-emerald-500 transition-colors" />
                <div>
                  <h5 className="text-sm font-bold text-gray-900">{card.front}</h5>
                  <p className="text-xs text-gray-400">{format(new Date(card.nextReview), 'MMM d, yyyy')}</p>
                </div>
              </div>
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">{card.status}</span>
            </div>
          ))}
          {cards.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No cards yet. Start by generating or adding cards!</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StudyView({ cards, onComplete }: { cards: SRSCard[], onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const currentCard = cards[index];

  const handleRate = async (quality: number) => {
    if (!currentCard || !currentCard.id) return;
    
    const update = calculateNextReview(currentCard, quality);
    try {
      await updateDoc(doc(db, 'cards', currentCard.id), update);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `cards/${currentCard.id}`);
    }
    
    setIsFlipped(false);
    if (index < cards.length - 1) {
      setIndex(index + 1);
    } else {
      onComplete();
    }
  };

  if (cards.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
      <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center">
        <Award className="w-12 h-12 text-emerald-600" />
      </div>
      <div className="space-y-2">
        <h3 className="text-2xl font-bold">Session Complete!</h3>
        <p className="text-gray-500 text-sm px-8">You've finished all your cards for today. Keep it up!</p>
      </div>
      <button onClick={onComplete} className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold">Return to Dashboard</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-8 animate-in slide-in-from-bottom duration-500">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
          <span>Reviewing {index + 1} of {cards.length}</span>
          <span>{Math.round(((index + 1) / cards.length) * 100)}%</span>
        </div>
        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${((index + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 perspective-1000 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard.id}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: isFlipped ? 180 : 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full h-[400px] cursor-pointer preserve-3d"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* Front */}
            <div className="absolute inset-0 bg-white p-12 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col items-center justify-center text-center backface-hidden">
              <span className="absolute top-8 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Question</span>
              <h2 className="text-4xl font-bold text-gray-900 leading-tight">{currentCard.front}</h2>
              <p className="mt-8 text-xs text-gray-400 font-bold uppercase tracking-wider animate-pulse">Tap to show answer</p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 bg-gray-900 p-12 rounded-[40px] shadow-2xl border border-gray-800 flex flex-col items-center justify-center text-center backface-hidden [transform:rotateY(180deg)]">
              <span className="absolute top-8 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Answer</span>
              <h2 className="text-2xl font-medium text-emerald-50 leading-relaxed overflow-y-auto">{currentCard.back}</h2>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="pt-4 pb-8 h-24">
        {!isFlipped ? (
            <button onClick={() => setIsFlipped(true)} className="w-full h-full bg-emerald-600 text-white rounded-3xl font-bold text-lg shadow-xl shadow-emerald-200 active:scale-95 transition">
              Show Answer
            </button>
        ) : (
          <div className="grid grid-cols-4 gap-3 h-full">
            <RateButton label="Again" sub="<1m" color="bg-red-500" onClick={() => handleRate(1)} />
            <RateButton label="Hard" sub="2d" color="bg-amber-500" onClick={() => handleRate(3)} />
            <RateButton label="Good" sub="4d" color="bg-emerald-500" onClick={() => handleRate(4)} />
            <RateButton label="Easy" sub="7d" color="bg-teal-500" onClick={() => handleRate(5)} />
          </div>
        )}
      </div>
    </div>
  );
}

function RateButton({ label, sub, color, onClick }: any) {
  return (
    <button onClick={onClick} className={cn(
      "h-full flex flex-col items-center justify-center rounded-2xl text-white transition active:scale-90",
      color
    )}>
      <span className="text-xs font-bold">{label}</span>
      <span className="text-[9px] opacity-80 uppercase font-bold">{sub}</span>
    </button>
  );
}

function TestView({ test, onComplete }: { test: DailyTest, onComplete: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleSubmit = async () => {
    if (selected === test.correctAnswer) {
      try {
        await updateDoc(doc(db, 'tests', test.id), { status: 'completed' });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `tests/${test.id}`);
      }
    }
    setShowResult(true);
  };

  return (
    <div className="space-y-6 h-full pb-12 animate-in slide-in-from-right duration-500">
      <div className="flex items-center gap-2">
        <button onClick={onComplete} className="p-2"><ChevronRight className="rotate-180" /></button>
        <h3 className="font-bold text-lg">Daily Test</h3>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-lg space-y-6 overflow-y-auto max-h-[70vh]">
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{test.type} Challenge</span>
          <h4 className="text-xl font-bold leading-snug">{test.question}</h4>
        </div>

        <div className="space-y-3">
          {test.options.map((opt, i) => (
            <button 
              key={i}
              disabled={showResult}
              onClick={() => setSelected(opt)}
              className={cn(
                "w-full p-5 rounded-2xl text-left border-2 transition relative overflow-hidden",
                selected === opt ? "border-emerald-500 bg-emerald-50/50" : "border-gray-100 hover:border-gray-200",
                showResult && opt === test.correctAnswer && "border-emerald-500 bg-emerald-50",
                showResult && selected === opt && opt !== test.correctAnswer && "border-red-500 bg-red-50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm pr-4">{opt}</span>
                {showResult && opt === test.correctAnswer && <Award className="text-emerald-600" size={18} />}
              </div>
            </button>
          ))}
        </div>

        {showResult && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "p-5 rounded-2xl",
              selected === test.correctAnswer ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            )}
          >
            <h5 className="font-bold text-sm mb-1">{selected === test.correctAnswer ? "Correct!" : "Keep learning!"}</h5>
            <p className="text-xs leading-relaxed opacity-80">{test.explanation}</p>
          </motion.div>
        )}

        {!showResult ? (
          <button 
            disabled={!selected}
            onClick={handleSubmit} 
            className="w-full bg-gray-900 text-white py-5 rounded-2xl font-bold shadow-xl disabled:opacity-50"
          >
            Submit Answer
          </button>
        ) : (
          <button onClick={onComplete} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-bold shadow-xl">
            Finish Session
          </button>
        )}
      </div>
    </div>
  );
}

function CardManager({ cards }: { cards: any[] }) {
  const [search, setSearch] = useState("");
  const filtered = cards.filter(c => c.front.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">My Collection</h3>
        <button className="bg-emerald-600 text-white p-2 rounded-xl shadow-lg active:scale-95 transition"><Plus size={20} /></button>
      </div>

      <div className="relative">
        <input 
          type="text" 
          placeholder="Search your cards..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white px-6 py-4 rounded-2xl border border-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(card => (
          <div key={card.id} className="bg-white p-5 rounded-3xl border border-gray-100 hover:border-emerald-200 transition shadow-sm group">
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-emerald-500 transition-colors">IELTS Vocabulary</span>
              <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded-md text-[9px] font-bold uppercase tracking-widest">{card.status || 'new'}</span>
            </div>
            <h4 className="font-bold text-lg text-gray-900 mb-1">{card.front}</h4>
            <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{card.back}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
              <BookOpen className="text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">No cards yet. Start by generating or adding cards!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ user, onLogOut }: any) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl mx-auto overflow-hidden bg-gray-200">
          {user.photoURL && <img src={user.photoURL} alt="" />}
        </div>
        <div>
          <h3 className="text-xl font-bold">{user.displayName}</h3>
          <p className="text-sm text-gray-400">{user.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
        <SettingsItem icon={<UserIcon className="text-blue-500" />} label="Account Settings" />
        <SettingsItem icon={<Bell className="text-amber-500" />} label="Notification Reminders" />
        <SettingsItem icon={<LayoutIcon className="text-emerald-500" />} label="Study Settings" />
        <button 
          onClick={onLogOut}
          className="w-full px-6 py-5 flex items-center gap-4 hover:bg-red-50 text-red-500 transition-colors border-t border-gray-100"
        >
          <LogOut size={20} />
          <span className="font-bold text-sm">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-bold">IELTS Ace v1.0.0 • AI-Powered SRS</p>
    </div>
  );
}

function SettingsItem({ icon, label }: any) {
  return (
    <div className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-4">
        {icon}
        <span className="font-bold text-sm text-gray-700">{label}</span>
      </div>
      <ChevronRight size={16} className="text-gray-300" />
    </div>
  );
}
