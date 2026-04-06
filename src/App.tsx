import React, { useState, useRef } from 'react';
import { Camera, Upload, Send, Volume2, Loader2, X, ChevronRight, MessageSquare, Sparkles, LogIn, LogOut, History, User as UserIcon, Mic, Video, Phone, PhoneOff, Download, FileText, Settings, Layers, Search, MapPin, Globe, BrainCircuit, Trash2, Trophy, BarChart3, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { solveMathProblem, generateSpeech, createChatSession, MathSolution, connectLive, MultiProblemResponse, MathStep } from './lib/gemini';
import { auth, db, googleProvider, githubProvider } from './firebase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { loadStripe } from '@stripe/stripe-js';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDocFromServer, getDoc, updateDoc, increment, deleteDoc, limit } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface AppSettings {
  voiceName: string;
  voiceLanguage: string;
  locationEnabled: boolean;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  autoDetectContext: boolean;
  searchEnabled: boolean;
}

const defaultSettings: AppSettings = {
  voiceName: 'Kore',
  voiceLanguage: 'English',
  locationEnabled: false,
  difficultyLevel: 'intermediate',
  autoDetectContext: true,
  searchEnabled: true,
};

const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const InteractiveStep = ({ step }: { step: MathStep }) => {
  const [vars, setVars] = useState(step.interactiveData?.data?.variables || []);
  
  const generatePoints = () => {
    if (step.interactiveData?.type === 'graph' && step.interactiveData.data?.expression) {
      const points = [];
      const expr = step.interactiveData.data.expression;
      // Generate points from -10 to 10
      for (let x = -10; x <= 10; x += 0.2) {
        let currentExpr = expr.replace(/x/g, `(${x})`);
        vars.forEach(v => {
          currentExpr = currentExpr.replace(new RegExp(v.name, 'g'), `(${v.value})`);
        });
        try {
          const y = eval(currentExpr);
          if (!isNaN(y) && isFinite(y)) {
            points.push({ x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(2)) });
          }
        } catch (e) { }
      }
      return points;
    }
    return step.interactiveData?.data?.points || [];
  };

  const points = generatePoints();
  
  if (!step.interactiveData || step.interactiveData.type === 'none') return null;

  if (step.interactiveData.type === 'graph') {
    return (
      <div className="mt-6 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interactive Visualization</h5>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Live Graph</span>
          </div>
        </div>

        <div className="h-64 w-full mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="x" 
                stroke="#94a3b8" 
                fontSize={10} 
                tick={{ fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={10} 
                tick={{ fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.9)', 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                  backdropFilter: 'blur(8px)'
                }}
                itemStyle={{ color: '#2563eb', fontWeight: 'bold' }}
                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
              />
              <Line 
                type="monotone" 
                dataKey="y" 
                stroke="#2563eb" 
                strokeWidth={4} 
                dot={false}
                activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }} 
                animationDuration={300}
              />
              <Brush 
                dataKey="x" 
                height={30} 
                stroke="#2563eb" 
                fill="#f8fafc"
                travellerWidth={10}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {vars.length > 0 && (
          <div className="space-y-6 pt-6 border-t border-slate-50 dark:border-slate-800">
            {vars.map((v, i) => (
              <div key={`${v.name}-${i}`} className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center text-[10px] font-black">{v.name}</span>
                    <span className="text-sm font-black text-slate-700 dark:text-slate-300">{v.value}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Range: {v.min} to {v.max}</span>
                </div>
                <input 
                  type="range" 
                  min={v.min} 
                  max={v.max} 
                  step={v.step} 
                  value={v.value}
                  onChange={(e) => {
                    const newVars = [...vars];
                    newVars[i].value = parseFloat(e.target.value);
                    setVars(newVars);
                  }}
                  className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.interactiveData.type === 'equation' && vars.length > 0) {
    const calculateResult = () => {
      try {
        let expr = step.interactiveData?.data?.expression || '';
        vars.forEach(v => {
          expr = expr.replace(new RegExp(v.name, 'g'), v.value.toString());
        });
        // Simple eval for demo purposes, in production use a math library
        return eval(expr);
      } catch (e) {
        return '?';
      }
    };

    return (
      <div className="mt-6 p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800">
        <h5 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-6">Interactive Equation</h5>
        <div className="space-y-6">
          {vars.map((v, i) => (
            <div key={`${v.name}-${i}`} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-700 dark:text-slate-300">{v.name} = {v.value}</span>
                <span className="text-[10px] text-slate-400 font-bold">Range: {v.min} to {v.max}</span>
              </div>
              <input 
                type="range" 
                min={v.min} 
                max={v.max} 
                step={v.step} 
                value={v.value}
                onChange={(e) => {
                  const newVars = [...vars];
                  newVars[i].value = parseFloat(e.target.value);
                  setVars(newVars);
                }}
                className="w-full h-1.5 bg-blue-200 dark:bg-blue-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          ))}
          <div className="pt-4 border-t border-blue-100 dark:border-blue-800 flex items-center justify-between">
            <span className="text-sm font-black text-blue-600">Result:</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">{calculateResult()}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [solutions, setSolutions] = useState<MathSolution[]>([]);
  const [activeSolutionIdx, setActiveSolutionIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [loadingSpeech, setLoadingSpeech] = useState(false);
  const [pdfName, setPdfName] = useState('MathSolution');
  const [isExporting, setIsExporting] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'canceled' | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  
  const solution = solutions[activeSolutionIdx];
  
  // New Context States
  const [standard, setStandard] = useState('10th');
  const [bookName, setBookName] = useState('');
  const [practiceSet, setPracticeSet] = useState('');
  const [showSetup, setShowSetup] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auth Listener
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', u.uid);
        try {
          // Use a separate setDoc for profile info to avoid resetting problemsSolved
          await setDoc(userRef, {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || u.email?.split('@')[0] || 'Anonymous',
            photoURL: u.photoURL,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Only initialize problemsSolved if it doesn't exist
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists() || userSnap.data().problemsSolved === undefined) {
            await setDoc(userRef, { problemsSolved: 0 }, { merge: true });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
        }

        // Load user data (settings and premium status)
        onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            if (data.settings) setSettings(data.settings);
            setIsPremium(!!data.isPremium);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        });

        // Test connection
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if(error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration. ");
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Save settings to Firestore
  React.useEffect(() => {
    if (user) {
      setDoc(doc(db, 'users', user.uid), { settings }, { merge: true })
        .catch(error => handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`));
    }
  }, [settings, user]);

  // Handle Location
  React.useEffect(() => {
    if (settings.locationEnabled && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Location error:", err)
      );
    } else {
      setLocation(null);
    }
  }, [settings.locationEnabled]);

  // History Listener
  React.useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'history');
    });
    return () => unsubscribe();
  }, [user]);

  // Leaderboard Listener
  React.useEffect(() => {
    // Check for payment status in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      setPaymentStatus('success');
      // In a real app, you'd verify this on the backend or via webhook
      window.history.replaceState({}, '', '/');
    } else if (params.get('canceled')) {
      setPaymentStatus('canceled');
      window.history.replaceState({}, '', '/');
    }

    if (!leaderboardOpen) return;
    const q = query(
      collection(db, 'users'),
      orderBy('problemsSolved', 'desc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeaderboard(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, [leaderboardOpen]);

  // Auto-speak first step when solution is loaded
  React.useEffect(() => {
    if (solution && solution.steps.length > 0) {
      setCurrentStepIdx(0);
      const firstStep = solution.steps[0];
      const speechText = `${firstStep.title}. ${firstStep.explanation}`.replace(/\$/g, '');
      handleSpeak(speechText, 0);
    }
  }, [solution]);

  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processImage(reader.result as string, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (base64Data: string, mimeType: string) => {
    setLoading(true);
    setError(null);
    setSolutions([]);
    setActiveSolutionIdx(0);
    setChatMessages([]);
    chatSessionRef.current = createChatSession();

    try {
      const base64Content = base64Data.split(',')[1];
      const result = await solveMathProblem(base64Content, mimeType, {
        standard,
        bookName,
        practiceSet
      });
      
      const solutionsWithIds = result.solutions.map((sol, idx) => ({
        ...sol,
        id: sol.id || `sol-${Date.now()}-${idx}`
      }));
      
      setSolutions(solutionsWithIds);
      
      // Generate suggested questions for the first problem
      if (solutionsWithIds.length > 0) {
        setSuggestedQuestions([
          "Can you explain the first step again?",
          "Is there another way to solve this?",
          "How do I check if my answer is correct?",
          "What are the key formulas used here?"
        ]);
      }

      // Save to History if logged in
      if (user && solutionsWithIds.length > 0) {
        try {
          await addDoc(collection(db, 'history'), {
            userId: user.uid,
            problem: solutionsWithIds[0].problem,
            solutions: solutionsWithIds,
            imageUrl: base64Data,
            createdAt: serverTimestamp()
          });

          // Increment problems solved
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            problemsSolved: increment(solutionsWithIds.length)
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'history');
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to solve the problem. Please try a clearer photo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = async (text: string, index: number) => {
    if (loadingSpeech) return;
    if (isSpeaking === index) {
      audioRef.current?.pause();
      setIsSpeaking(null);
      return;
    }

    // Stop and reset current audio if any
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    try {
      setLoadingSpeech(true);
      setIsSpeaking(index);
      const audioUrl = await generateSpeech(text, settings.voiceName, settings.voiceLanguage);
      
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current.src);
      }

      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
      } else {
        audioRef.current.src = audioUrl;
      }
      
      audioRef.current.play();
      audioRef.current.onended = () => setIsSpeaking(null);
    } catch (err) {
      console.error(err);
      setIsSpeaking(null);
    } finally {
      setLoadingSpeech(false);
    }
  };

  const handleSendMessage = async (overrideInput?: string) => {
    const message = (overrideInput || userInput).trim();
    if (!message || chatLoading) return;

    setUserInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: message }]);
    setChatLoading(true);

    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = createChatSession();
      }
      const response = await chatSessionRef.current.sendMessage({ message });
      setChatMessages(prev => [...prev, { role: 'model', text: response.text }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const login = async (provider: any) => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError("Login failed. Please try again.");
    }
  };

  const logout = () => signOut(auth);

  const handleUpgrade = async () => {
    if (!user) {
      alert('Please sign in to upgrade to Premium.');
      return;
    }

    try {
      setIsUpgrading(true);
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
        }),
      });

      const session = await response.json();
      if (session.error) {
        throw new Error(session.error);
      }

      const stripe = await stripePromise;
      if (stripe) {
        const { error } = await (stripe as any).redirectToCheckout({
          sessionId: session.id,
        });
        if (error) {
          console.error('Stripe redirect error:', error);
          alert('Failed to redirect to Stripe checkout.');
        }
      }
    } catch (error: any) {
      console.error('Upgrade error:', error);
      alert(`An error occurred: ${error.message}`);
    } finally {
      setIsUpgrading(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'history', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `history/${id}`);
    }
  };

  const exportToPDF = async () => {
    const element = document.getElementById('solution-content');
    if (!element) return;
    
    setIsExporting(true);
    const originalExpandAll = expandAll;
    const originalActiveIdx = activeSolutionIdx;
    
    try {
      setExpandAll(false);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Export all solutions
      for (let i = 0; i < solutions.length; i++) {
        if (i > 0) pdf.addPage();
        
        // Temporarily switch to the solution to capture it
        setActiveSolutionIdx(i);
        // Wait for re-render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: darkMode ? '#0f172a' : '#ffffff',
          onclone: (clonedDoc) => {
            // Fix for oklch colors not being supported by html2canvas
            // 1. Remove stylesheets that might contain oklch
            const styleSheets = clonedDoc.styleSheets;
            for (let j = 0; j < styleSheets.length; j++) {
              try {
                const rules = styleSheets[j].cssRules;
                for (let k = 0; k < rules.length; k++) {
                  if (rules[k].cssText.includes('oklch')) {
                    // This is a bit aggressive but helps avoid the parser error
                    (styleSheets[j] as CSSStyleSheet).deleteRule(k);
                    k--;
                  }
                }
              } catch (e) {
                // Cross-origin stylesheet, skip
              }
            }

            // 2. Force standard colors on elements
            const elements = clonedDoc.getElementsByTagName('*');
            for (let j = 0; j < elements.length; j++) {
              const el = elements[j] as HTMLElement;
              if (el.style) {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.color.includes('oklch')) {
                  el.style.color = darkMode ? '#f8fafc' : '#0f172a';
                }
                if (computedStyle.backgroundColor.includes('oklch')) {
                  el.style.backgroundColor = 'transparent';
                }
                if (computedStyle.borderColor.includes('oklch')) {
                  el.style.borderColor = darkMode ? '#1e293b' : '#e2e8f0';
                }
              }
            }
          }
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const contentHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        // Add Header
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text(`MathMaster AI - Solution Report (Problem ${i + 1})`, 10, 10);
        pdf.text(new Date().toLocaleDateString(), pdfWidth - 30, 10);
        pdf.setDrawColor(230);
        pdf.line(10, 12, pdfWidth - 10, 12);
        
        pdf.addImage(imgData, 'PNG', 0, 15, pdfWidth, contentHeight);
      }
      
      pdf.save(`${pdfName}.pdf`);
    } catch (err) {
      console.error('PDF Export failed:', err);
    } finally {
      setExpandAll(originalExpandAll);
      setActiveSolutionIdx(originalActiveIdx);
      setIsExporting(false);
    }
  };

  if (!authReady) return null;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 font-sans relative overflow-x-hidden">
      {/* Decorative background elements */}
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] rounded-full -z-10" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-400/10 blur-[120px] rounded-full -z-10" />
      
      {/* Floating Math Symbols */}
      <div className="fixed inset-0 pointer-events-none -z-5 opacity-[0.03] overflow-hidden">
        {[
          { s: '∑', t: '10%', l: '10%', d: 0 },
          { s: 'π', t: '20%', l: '80%', d: 2 },
          { s: '√', t: '70%', l: '15%', d: 1 },
          { s: '∫', t: '80%', l: '85%', d: 3 },
          { s: '∞', t: '40%', l: '50%', d: 4 },
          { s: 'Δ', t: '15%', l: '40%', d: 1.5 },
          { s: 'θ', t: '60%', l: '70%', d: 2.5 },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ y: 0 }}
            animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: item.d }}
            className="absolute text-6xl font-serif"
            style={{ top: item.t, left: item.l }}
          >
            {item.s}
          </motion.div>
        ))}
      </div>

      {/* Header */}
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-6 mb-8 md:mb-12 relative z-10">
        <AnimatePresence>
          {paymentStatus && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-md p-4 rounded-2xl text-center font-bold shadow-xl z-50 ${
                paymentStatus === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{paymentStatus === 'success' ? '🎉 Upgrade Successful! Welcome to Premium.' : '❌ Payment Canceled.'}</span>
                <button onClick={() => setPaymentStatus(null)}><X className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ rotate: 15, scale: 1.1 }}
              className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2 rounded-xl md:p-2.5 md:rounded-2xl shadow-xl shadow-blue-200"
            >
              <Sparkles className="text-white w-5 h-5 md:w-6 md:h-6" />
            </motion.div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">MathMaster AI</h1>
              <p className="text-[8px] md:text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]">1-12th Std Solution Expert</p>
            </div>
          </div>
          
          {/* Mobile Theme Toggle */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="sm:hidden p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm"
          >
            {darkMode ? <Sparkles className="w-5 h-5 text-yellow-400" /> : <Sparkles className="w-5 h-5 text-slate-600" />}
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4 w-full sm:w-auto justify-center sm:justify-end">
          {settings.searchEnabled && (
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Search problems..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none w-48 transition-all focus:w-64"
              />
            </div>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setLeaderboardOpen(true)}
                className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all shadow-sm"
              >
                <Trophy className="w-5 h-5 text-yellow-500" />
              </button>
              <button 
                onClick={() => setQuizOpen(true)}
                className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all shadow-sm"
              >
                <Brain className="w-5 h-5 text-purple-500" />
              </button>
              <button 
                onClick={() => setSettingsOpen(true)}
                className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all shadow-sm"
              >
                <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
              <button 
                onClick={() => setHistoryOpen(true)}
                className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all shadow-sm"
              >
                <History className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
              <div className="flex items-center gap-2 md:gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 md:p-1.5 pr-3 md:pr-4 rounded-xl md:rounded-2xl shadow-sm">
                <img src={user.photoURL || ''} alt="avatar" className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl" referrerPolicy="no-referrer" />
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <button onClick={logout} className="text-[10px] md:text-xs font-bold text-slate-500 hover:text-red-500 transition-colors">Logout</button>
                    {isPremium && (
                      <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Premium</span>
                    )}
                  </div>
                  {!isPremium && (
                    <button 
                      onClick={handleUpgrade}
                      disabled={isUpgrading}
                      className="text-[8px] font-black text-blue-600 uppercase tracking-wider hover:underline disabled:opacity-50"
                    >
                      {isUpgrading ? 'Processing...' : 'Upgrade to Premium'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => login(googleProvider)}
              className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all shadow-sm flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span className="text-xs font-bold">Login</span>
            </button>
          )}
          
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="hidden sm:block p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-2xl transition-all shadow-sm"
          >
            {darkMode ? <Sparkles className="w-5 h-5 text-yellow-400" /> : <Sparkles className="w-5 h-5 text-slate-600" />}
          </button>
          
          <button 
            onClick={() => setChatOpen(!chatOpen)}
            className="p-2.5 md:p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl transition-all relative shadow-sm hover:shadow-md active:scale-95"
          >
            <MessageSquare className="w-5 h-5 text-slate-600" />
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white text-[10px] text-white flex items-center justify-center font-bold">
                {chatMessages.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl flex flex-col gap-10 relative z-10">
        {/* Setup Section */}
        {showSetup && !solution && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border border-white/80 dark:border-slate-800 w-full max-w-2xl mx-auto"
          >
            <h2 className="text-xl md:text-2xl font-black mb-6 text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="text-blue-600 w-5 h-5 md:w-6 md:h-6" />
              Personalize Your Learning
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Standard</label>
                <select 
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl py-3.5 md:py-4 px-4 font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm md:text-base"
                >
                  {Array.from({ length: 12 }, (_, i) => `${i + 1}${['st', 'nd', 'rd'][i] || 'th'}`).map(std => (
                    <option key={std} value={std}>{std} Standard</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Book Name (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. NCERT, RD Sharma"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl py-3.5 md:py-4 px-4 font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm md:text-base"
                />
              </div>
              
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Practice Set / Exercise (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. Exercise 1.2, Practice Set 5"
                  value={practiceSet}
                  onChange={(e) => setPracticeSet(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl md:rounded-2xl py-3.5 md:py-4 px-4 font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm md:text-base"
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setShowSetup(false)}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-[0.98] text-sm md:text-base"
              >
                Save Preferences
              </button>
              <button 
                onClick={() => setShowSetup(false)}
                className="flex-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black py-4 md:py-5 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-[0.98] text-sm md:text-base"
              >
                Skip (Auto-Detect)
              </button>
            </div>
          </motion.div>
        )}

        {/* Input Section */}
        {!showSetup && !solution && !loading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-6 md:p-16 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl shadow-slate-200/50 dark:shadow-none border border-white/80 dark:border-slate-800 flex flex-col items-center text-center relative overflow-hidden"
          >
            <button 
              onClick={() => setShowSetup(true)}
              className="absolute top-4 left-4 md:top-6 md:left-6 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              ← Change Standard
            </button>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-inner"
            >
              <Camera className="w-10 h-10 md:w-12 md:h-12 text-blue-600 dark:text-blue-400" />
            </motion.div>
            
            <h2 className="text-2xl md:text-3xl font-black mb-3 md:mb-4 text-slate-900 dark:text-white">Snap. Solve. Learn.</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 md:mb-10 max-w-md text-base md:text-lg leading-relaxed">
              Expert solutions for 1st to 12th Standard. Get step-by-step logic and voice guidance for any problem.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 md:gap-5 w-full max-w-lg">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 md:py-5 px-6 md:px-8 rounded-xl md:rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-200 group text-sm md:text-base"
              >
                <Camera className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
                Take Photo
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-4 md:py-5 px-6 md:px-8 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-3 transition-all active:scale-95 shadow-sm hover:shadow-md text-sm md:text-base"
              >
                <Upload className="w-5 h-5 md:w-6 md:h-6" />
                Upload Image
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileUpload} 
              />
            </div>
            
            <div className="mt-12 flex items-center gap-6 text-slate-400">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 overflow-hidden">
                    <img src={`https://picsum.photos/seed/${i + 10}/32/32`} alt="user" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium">Trusted by 10,000+ students</p>
            </div>
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="fixed inset-0 bg-slate-900 z-[200] flex flex-col items-center justify-center p-8">
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
              <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-500 blur-[150px] rounded-full" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-500 blur-[150px] rounded-full" />
            </div>
            
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex flex-col items-center gap-12 text-center"
            >
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-40 h-40 border-4 border-blue-500/20 border-t-blue-500 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-16 h-16 text-blue-400 animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-4xl font-black text-white tracking-tighter">AI is Thinking...</h3>
                <p className="text-slate-400 text-lg font-medium max-w-xs mx-auto">
                  Analyzing your problem and crafting a detailed step-by-step solution.
                </p>
              </div>
              
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                    className="w-3 h-3 bg-blue-500 rounded-full"
                  />
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* Solution Section */}
        {solutions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 flex flex-col gap-8">
              {/* Multi-Problem Selector & Expand Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {solutions.map((sol, idx) => (
                    <button
                      key={`${sol.id}-${idx}`}
                      onClick={() => {
                        setActiveSolutionIdx(idx);
                        setCurrentStepIdx(0);
                        setExpandAll(false);
                      }}
                      className={`px-6 py-3 rounded-2xl font-black text-xs whitespace-nowrap transition-all ${
                        !expandAll && activeSolutionIdx === idx 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                          : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Question {idx + 1}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setExpandAll(!expandAll)}
                  className={`px-6 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all ${
                    expandAll 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                      : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  {expandAll ? 'Show Single' : 'Expand All Questions'}
                </button>
              </div>

              <div id="solution-content" className="flex flex-col gap-8">
                {expandAll ? (
                  solutions.map((sol, sIdx) => (
                    <div key={`${sol.id}-${sIdx}`} className="flex flex-col gap-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 px-4">
                        <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-black">
                          {sIdx + 1}
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Question {sIdx + 1}</h2>
                      </div>
                      
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {sol.problem}
                        </ReactMarkdown>
                      </div>

                      <div className="space-y-4">
                        {sol.steps.map((step, stIdx) => (
                          <div key={stIdx} className="bg-white dark:bg-slate-900 p-6 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Step {stIdx + 1}</span>
                              <h4 className="font-bold text-slate-900 dark:text-white">{step.title}</h4>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {step.explanation}
                              </ReactMarkdown>
                            </div>
                            {step.math && (
                              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl overflow-x-auto">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {`$$${step.math}$$`}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="bg-blue-600 p-6 rounded-[2rem] text-white relative group">
                        <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-70">Final Answer</h3>
                        <div className="text-xl font-black">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {sol.finalAnswer}
                          </ReactMarkdown>
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(sol.finalAnswer);
                            // Optional: add a toast or feedback
                          }}
                          className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    {/* Problem Card */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-800 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                        <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Problem Statement</h3>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-[9px] font-black text-blue-600 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-800">
                            {solution.context?.standard || standard} Std
                          </span>
                          {(solution.context?.bookName || bookName) && (
                            <span className="px-2 py-1 bg-slate-50 dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 rounded-lg border border-slate-100 dark:border-slate-700">
                              {solution.context?.bookName || bookName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {solution.problem}
                        </ReactMarkdown>
                      </div>
                    </motion.div>

                    {/* Step Navigation */}
                    <div className="flex flex-col gap-4 md:gap-6">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step {currentStepIdx + 1} of {solution.steps.length}</h3>
                        <div className="flex gap-2">
                          <button 
                            disabled={currentStepIdx === 0 || loadingSpeech}
                            onClick={() => {
                              const newIdx = currentStepIdx - 1;
                              setCurrentStepIdx(newIdx);
                              const speechText = `${solution.steps[newIdx].title}. ${solution.steps[newIdx].explanation}`.replace(/\$/g, '');
                              handleSpeak(speechText, newIdx);
                            }}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-30 transition-all active:scale-90"
                          >
                            <ChevronRight className="w-5 h-5 rotate-180" />
                          </button>
                          <button 
                            disabled={currentStepIdx === solution.steps.length - 1 || loadingSpeech}
                            onClick={() => {
                              const newIdx = currentStepIdx + 1;
                              setCurrentStepIdx(newIdx);
                              const speechText = `${solution.steps[newIdx].title}. ${solution.steps[newIdx].explanation}`.replace(/\$/g, '');
                              handleSpeak(speechText, newIdx);
                            }}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-30 transition-all active:scale-90"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      
                      <motion.div 
                        key={`${activeSolutionIdx}-${currentStepIdx}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] shadow-lg shadow-slate-200/30 dark:shadow-none border transition-all duration-500 ${
                          isSpeaking === currentStepIdx ? 'border-blue-500 ring-4 ring-blue-500/5' : 'border-slate-100 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row items-start justify-between gap-4 md:gap-6">
                          <div className="flex-1 w-full">
                            <div className="flex items-center gap-3 mb-4">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black transition-colors flex-shrink-0 ${
                                isSpeaking === currentStepIdx ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                              }`}>
                                {currentStepIdx + 1}
                              </div>
                              <h4 className="font-black text-base md:text-lg text-slate-900 dark:text-white tracking-tight">{solution.steps[currentStepIdx].title}</h4>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400 mb-6 text-base md:text-lg leading-relaxed font-medium">
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {solution.steps[currentStepIdx].explanation}
                              </ReactMarkdown>
                            </div>
                            {solution.steps[currentStepIdx].math && (
                              <div className="bg-slate-50/80 dark:bg-slate-800/50 p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 dark:border-slate-700 overflow-x-auto">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {`$$${solution.steps[currentStepIdx].math}$$`}
                                </ReactMarkdown>
                              </div>
                            )}
                            
                            <InteractiveStep step={solution.steps[currentStepIdx]} />
                          </div>
                          <button 
                            onClick={() => {
                              const speechText = `${solution.steps[currentStepIdx].title}. ${solution.steps[currentStepIdx].explanation}`.replace(/\$/g, '');
                              handleSpeak(speechText, currentStepIdx);
                            }}
                            disabled={loadingSpeech}
                            className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-all shadow-sm active:scale-90 self-end md:self-start ${
                              isSpeaking === currentStepIdx 
                                ? 'bg-blue-600 text-white shadow-blue-200' 
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-blue-50 hover:text-blue-600'
                            } ${loadingSpeech ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {loadingSpeech && isSpeaking === currentStepIdx ? (
                              <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                            ) : (
                              <Volume2 className={`w-5 h-5 md:w-6 md:h-6 ${isSpeaking === currentStepIdx ? 'animate-pulse' : ''}`} />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    </div>

                    {/* Final Answer */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-900 dark:to-slate-900 p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl shadow-slate-400/20 text-white relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] rounded-full" />
                      <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4">Conclusion</h3>
                      <div className="text-2xl md:text-4xl font-black tracking-tight">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {solution.finalAnswer}
                        </ReactMarkdown>
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(solution.finalAnswer);
                        }}
                        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all opacity-0 group-hover:opacity-100 flex items-center gap-2 text-xs font-bold"
                      >
                        <Download className="w-4 h-4" />
                        Copy Result
                      </button>
                    </motion.div>
                  </>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => { setSolutions([]); setImage(null); }}
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold py-5 rounded-[2rem] flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
                >
                  Start New Session
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="flex-1 flex gap-2">
                  <input 
                    type="text" 
                    value={pdfName}
                    onChange={(e) => setPdfName(e.target.value)}
                    placeholder="PDF Name"
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] px-6 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button 
                    onClick={exportToPDF}
                    disabled={isExporting}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-5 rounded-[2rem] transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-800 sticky top-8">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 px-2">Visual Context</h3>
                <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 relative group">
                  <img src={image!} alt="Problem" className="w-full h-auto object-contain max-h-[30rem] transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-bold leading-relaxed mb-4">
                    Tip: Use the chat to ask for more details about any specific step!
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setLiveOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95 text-[10px]"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Voice Tutor
                    </button>
                    <button 
                      onClick={() => setLiveOpen(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95 text-[10px]"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Video Call
                    </button>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-purple-600" />
                    <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-wider">Math Fact of the Day</h4>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-bold leading-relaxed italic">
                    "The number 0 was first used in India by Aryabhata and Brahmagupta in the 5th century."
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* History Overlay */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                      <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">Solution History</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Your previous math problems</p>
                    </div>
                  </div>
                  <button onClick={() => setHistoryOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                {history.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-slate-400 text-sm">No history found. Solve a problem to see it here!</p>
                  </div>
                )}
                {history
                  .filter(item => 
                    !searchQuery || 
                    item.problem?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item, idx) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        setSolutions(item.solutions || [item.solution]);
                        setActiveSolutionIdx(0);
                        setImage(item.imageUrl);
                        setHistoryOpen(false);
                      }}
                      className="w-full text-left bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-blue-500 transition-all group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSolutions(item.solutions || [item.solution]);
                          setActiveSolutionIdx(0);
                          setImage(item.imageUrl);
                          setHistoryOpen(false);
                        }
                      }}
                    >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 flex-shrink-0">
                        <img src={item.imageUrl} alt="thumb" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.problem}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {item.createdAt?.toDate().toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Chat Overlay */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Math Tutor</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Ask anything about the steps</p>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-slate-900 dark:text-white font-bold mb-2">How can I help you today?</p>
                    <p className="text-slate-400 text-xs">Ask me to explain a step, show another method, or give you a similar practice problem.</p>
                    
                    {suggestedQuestions.length > 0 && (
                      <div className="mt-8 flex flex-col gap-2">
                        {suggestedQuestions.map((q, i) => (
                          <button 
                            key={i}
                            onClick={() => {
                              setUserInput(q);
                              handleSendMessage(q);
                            }}
                            className="text-left p-3 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-slate-300 text-xs rounded-xl border border-slate-100 dark:border-slate-700 transition-all"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[90%] p-4 rounded-2xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-100 dark:border-slate-700'
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <input 
                    type="text" 
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask a follow-up question..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl py-4 pl-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <button 
                    onClick={() => handleSendMessage()}
                    disabled={!userInput.trim() || chatLoading}
                    className="absolute right-2 top-2 bottom-2 w-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Live Tutor Overlay */}
      <AnimatePresence>
        {liveOpen && (
          <LiveTutor onClose={() => setLiveOpen(false)} settings={settings} />
        )}
      </AnimatePresence>

      {/* Quiz Mode Overlay */}
      <AnimatePresence>
        {quizOpen && (
          <QuizMode onClose={() => setQuizOpen(false)} settings={settings} />
        )}
      </AnimatePresence>

      {/* Leaderboard Overlay */}
      <AnimatePresence>
        {leaderboardOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeaderboardOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[150]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[160] rounded-[3rem] border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-br from-blue-600 to-indigo-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                    <Trophy className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Leaderboard</h3>
                    <p className="text-xs text-blue-100 font-bold">Top MathMasters</p>
                  </div>
                </div>
                <button onClick={() => setLeaderboardOpen(false)} className="p-3 bg-white/10 text-white hover:bg-white/20 rounded-2xl transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {leaderboard.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-slate-400 text-sm">No data yet. Be the first to solve a problem!</p>
                  </div>
                )}
                {leaderboard.map((entry, idx) => (
                  <div 
                    key={entry.id}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      entry.id === user?.uid 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                      idx === 0 ? 'bg-yellow-400 text-white' :
                      idx === 1 ? 'bg-slate-300 text-slate-600' :
                      idx === 2 ? 'bg-orange-400 text-white' :
                      'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <img src={entry.photoURL || ''} alt="avatar" className="w-10 h-10 rounded-xl" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">{entry.displayName || 'Anonymous'}</p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold truncate">{entry.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-blue-600 dark:text-blue-400">{entry.problemsSolved || 0}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase">Solved</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                  Keep solving to climb the ranks!
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {settingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-none">
                    <Settings className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Settings</h3>
                    <p className="text-xs text-slate-500 font-bold">Customize your experience</p>
                  </div>
                </div>
                <button onClick={() => setSettingsOpen(false)} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 rounded-2xl transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto scrollbar-hide">
                {/* Voice Language */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-blue-600" />
                    <label className="text-sm font-black text-slate-900 dark:text-white">Explanation Language</label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => setSettings({ ...settings, voiceLanguage: lang })}
                        className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                          settings.voiceLanguage === lang 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Tone */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 text-blue-600" />
                    <label className="text-sm font-black text-slate-900 dark:text-white">Explanation Voice Tone</label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'Kore', label: 'Kore (Default)' },
                      { id: 'Puck', label: 'Puck (Deep)' },
                      { id: 'Charon', label: 'Charon (Calm)' },
                      { id: 'Fenrir', label: 'Fenrir (Bold)' },
                      { id: 'Zephyr', label: 'Zephyr (Soft)' }
                    ].map(voice => (
                      <button
                        key={voice.id}
                        onClick={() => setSettings({ ...settings, voiceName: voice.id })}
                        className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                          settings.voiceName === voice.id 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        }`}
                      >
                        {voice.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      <MapPin className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Allow Location</p>
                      <p className="text-[10px] text-slate-500 font-bold">Help us detect your region</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, locationEnabled: !settings.locationEnabled })}
                    className={`w-12 h-6 rounded-full transition-all relative ${settings.locationEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.locationEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Search Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      <Search className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Search Option</p>
                      <p className="text-[10px] text-slate-500 font-bold">Enable problem search bar</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, searchEnabled: !settings.searchEnabled })}
                    className={`w-12 h-6 rounded-full transition-all relative ${settings.searchEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.searchEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Difficulty Level */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="w-5 h-5 text-blue-600" />
                    <label className="text-sm font-black text-slate-900 dark:text-white">Learning Level</label>
                  </div>
                  <div className="flex gap-2">
                    {['beginner', 'intermediate', 'advanced'].map(level => (
                      <button
                        key={level}
                        onClick={() => setSettings({ ...settings, difficultyLevel: level as any })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                          settings.difficultyLevel === level 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                            : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Detect Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      <Globe className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Auto-Detect Context</p>
                      <p className="text-[10px] text-slate-500 font-bold">Identify book & standard from image</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, autoDetectContext: !settings.autoDetectContext })}
                    className={`w-12 h-6 rounded-full transition-all relative ${settings.autoDetectContext ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.autoDetectContext ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => setSettingsOpen(false)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none transition-all active:scale-95"
                >
                  Save & Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuizMode({ onClose, settings }: { onClose: () => void; settings: AppSettings }) {
  const [question, setQuestion] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);

  const generateQuestion = async () => {
    setLoading(true);
    setSelectedAnswer(null);
    try {
      const chat = createChatSession();
      const response = await chat.sendMessage({ 
        message: `Generate a multiple choice math question for a ${settings.difficultyLevel} student. Return ONLY a JSON object with fields: question, options (array of 4), and correct_answer.` 
      });
      const data = JSON.parse(response.text || '{}');
      setQuestion(data.question);
      setOptions(data.options);
      setCorrectAnswer(data.correct_answer);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    generateQuestion();
  }, []);

  const handleAnswer = (option: string) => {
    setSelectedAnswer(option);
    if (option === correctAnswer) {
      setScore(prev => prev + 10);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-br from-purple-600 to-indigo-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
              <Brain className="text-white w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Math Quiz</h3>
              <p className="text-xs text-purple-100 font-bold">Score: {score}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white/10 text-white hover:bg-white/20 rounded-2xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
              <p className="text-slate-500 font-bold">Generating challenge...</p>
            </div>
          ) : question ? (
            <>
              <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
                <p className="text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                  {question}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {options.map((option, i) => (
                  <button
                    key={i}
                    disabled={!!selectedAnswer}
                    onClick={() => handleAnswer(option)}
                    className={`p-4 rounded-2xl text-left font-bold transition-all border ${
                      selectedAnswer === option
                        ? option === correctAnswer 
                          ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-200'
                          : 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-200'
                        : selectedAnswer && option === correctAnswer
                          ? 'bg-green-500/20 text-green-600 border-green-500'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {selectedAnswer && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={generateQuestion}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl shadow-xl shadow-purple-200 dark:shadow-none transition-all"
                >
                  Next Question
                </motion.button>
              )}
            </>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
function LiveTutor({ onClose, settings }: { onClose: () => void; settings: AppSettings }) {
  const [connected, setConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  React.useEffect(() => {
    const startSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
        await audioContextRef.current.resume();
        
        const callbacks = {
          onopen: () => {
            setConnected(true);
            startStreaming();
          },
          onmessage: (msg: any) => {
            if (msg.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setIsAiSpeaking(false);
              if (currentSourceRef.current) {
                currentSourceRef.current.stop();
                currentSourceRef.current = null;
              }
            }
            if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64 = msg.serverContent.modelTurn.parts[0].inlineData.data;
              const binary = atob(base64);
              const bytes = new Int16Array(binary.length / 2);
              for (let i = 0; i < bytes.length; i++) {
                bytes[i] = (binary.charCodeAt(i * 2) & 0xFF) | (binary.charCodeAt(i * 2 + 1) << 8);
              }
              audioQueueRef.current.push(bytes);
              if (!isPlayingRef.current) playNextInQueue();
            }
            if (msg.serverContent?.modelTurn?.parts?.[0]?.text) {
              setTranscript(prev => [...prev.slice(-4), msg.serverContent.modelTurn.parts[0].text]);
            }
          },
          onclose: () => setConnected(false),
          onerror: (err: any) => console.error(err),
        };

        sessionRef.current = await connectLive(callbacks, settings.voiceLanguage);
      } catch (err) {
        console.error(err);
        onClose();
      }
    };

    startSession();

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      sessionRef.current?.close();
      audioContextRef.current?.close();
    };
  }, []);

  const startStreaming = () => {
    if (!streamRef.current || !sessionRef.current) return;

    // Audio streaming
    const audioTrack = streamRef.current.getAudioTracks()[0];
    const source = audioContextRef.current!.createMediaStreamSource(new MediaStream([audioTrack]));
    const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (isMuted || !sessionRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        output[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
      }
      const base64 = btoa(String.fromCharCode(...new Uint8Array(output.buffer)));
      sessionRef.current.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
    };

    source.connect(processor);
    processor.connect(audioContextRef.current!.destination);

    // Video streaming
    const interval = setInterval(() => {
      if (isCameraOff || !videoRef.current || !canvasRef.current || !sessionRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
      sessionRef.current.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } });
    }, 1000);

    return () => {
      clearInterval(interval);
      processor.disconnect();
      source.disconnect();
    };
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setIsAiSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsAiSpeaking(true);
    const data = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, data.length, 16000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      channel[i] = data[i] / 0x7FFF;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    currentSourceRef.current = source;
    source.onended = () => {
      currentSourceRef.current = null;
      playNextInQueue();
    };
    source.start();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4 md:p-8"
    >
      <div className="w-full max-w-4xl bg-slate-900 rounded-[3rem] border border-slate-800 overflow-hidden shadow-2xl flex flex-col h-[80vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <motion.div 
                animate={isAiSpeaking ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : {}}
                transition={{ duration: 0.5, repeat: Infinity }}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${isAiSpeaking ? 'bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-slate-800'}`}
              >
                <Sparkles className={`w-6 h-6 ${isAiSpeaking ? 'text-white' : 'text-slate-400'}`} />
              </motion.div>
              {connected && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-4 border-slate-900">
                  <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-white font-black">Live Math Tutor</h3>
              <p className="text-xs text-slate-400">
                {isAiSpeaking ? 'Tutor is explaining...' : connected ? 'Listening to you...' : 'Connecting to Neural Engine...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-2xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {/* Neural Engine Status */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 z-10">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Neural Engine {connected ? 'Active' : 'Offline'}</span>
          </div>

          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover transition-opacity duration-500 ${isCameraOff ? 'opacity-0' : 'opacity-100'}`}
          />
          <canvas ref={canvasRef} width={320} height={240} className="hidden" />
          
          {isCameraOff && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center">
                <UserIcon className="w-16 h-16 text-slate-600" />
              </div>
            </div>
          )}

          {/* Transcript Overlay */}
          <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-2 pointer-events-none">
            {transcript.map((text, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 text-white text-sm max-w-[80%] self-start"
              >
                {text}
              </motion.div>
            ))}
          </div>

          {!connected && (
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-white font-bold">Waking up your tutor...</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-8 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-6">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-5 rounded-3xl transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {isMuted ? <Mic className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </button>
          
          <button 
            onClick={onClose}
            className="p-6 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-xl shadow-red-900/20 active:scale-90 transition-all"
          >
            <PhoneOff className="w-8 h-8" />
          </button>

          <button 
            onClick={() => setIsCameraOff(!isCameraOff)}
            className={`p-5 rounded-3xl transition-all ${isCameraOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {isCameraOff ? <Video className="w-7 h-7" /> : <Video className="w-7 h-7" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
