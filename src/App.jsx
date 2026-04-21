import NoSleep from 'nosleep.js';
import { supabase } from "./lib/supabase";
import { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  PhotoIcon,
  CameraIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  ArchiveBoxIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import Paywall from "./components/Paywall";

/* ================= CONFIG ================= */
const DEFAULT_PLAN = "free";
const PLAN_LIMITS = {
  free: { daily: 2, monthly: 60 },
  freemium: { daily: 20, monthly: 300 },
  premium: { daily: null, monthly: 1500 },
};
const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  // ================= STATES =================
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [usage, setUsage] = useState({ daily: 0, monthly: 0, lastScan: null });
  const [authChecked, setAuthChecked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [texts, setTexts] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeCardIndex, setActiveCardIndex] = useState(null);
  const [playerState, setPlayerState] = useState("idle");
  const [continuous, setContinuous] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Escolha como deseja importar o conteúdo.");
  const [loading, setLoading] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(null);
  const [customRate, setCustomRate] = useState(1);
  const [customPitch, setCustomPitch] = useState(1);
  const [currentSpeakingIndex, setCurrentSpeakingIndex] = useState(0);

  const safePlan = plan || "free";
  const isPremium = safePlan === "premium";
  const isFreemium = safePlan === "freemium";
  const limits = PLAN_LIMITS[safePlan] || PLAN_LIMITS.free;
  const monthlyPercent = Math.min(((usage?.monthly || 0) / limits.monthly) * 100, 100);
  const canUseAccessibility = plan === "freemium" || plan === "premium";

  /* ================= REFS ================= */
  const noSleepVideoRef = useRef(null);
  const noSleepRef = useRef(null);
  const noSleepAudioRef = useRef(null);
  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const activeIndexRef = useRef(null);
  const warmedUpRef = useRef(false);
  const abortProcessingRef = useRef(false);
  const processingRef = useRef(false);
  const wakeLockRef = useRef(null);
  const cardsContainerRef = useRef(null);
  const cameraInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const wasPlayingBeforeBackgroundRef = useRef(false);

  // ================= PERSISTÊNCIA =================
  // ================= PERSISTÊNCIA DO PONTO DE LEITURA =================
useEffect(() => {
  if (!authChecked) return;
  const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
  const savedPlayback = localStorage.getItem(`${prefix}-playback`);
  if (savedPlayback) {
    const { activeIndex, blockIndex } = JSON.parse(savedPlayback);
    if (activeIndex !== null && texts[activeIndex]) {
      activeIndexRef.current = activeIndex;
      blockIndexRef.current = blockIndex || 0;
      setActiveCardIndex(activeIndex);
      // não inicia automaticamente, mas o usuário pode dar play e ele continua do ponto
    }
  }
}, [authChecked, user, texts]);

// ================= AUTH REFRESH (evita desconectar ao voltar) =================
useEffect(() => {
  const refreshAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && (!user || user.id !== session.user.id)) {
      // recarrega dados do usuário
      await loadUserData(session); // se loadUserData estiver no escopo, ou chame a lógica
    }
  };

  window.addEventListener("focus", refreshAuth);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshAuth();
  });

  return () => {
    window.removeEventListener("focus", refreshAuth);
  };
}, [user]);

// Salva sempre que muda
useEffect(() => {
  const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
  if (activeIndexRef.current !== null) {
    localStorage.setItem(`${prefix}-playback`, JSON.stringify({
      activeIndex: activeIndexRef.current,
      blockIndex: blockIndexRef.current,
    }));
  } else {
    localStorage.removeItem(`${prefix}-playback`);
  }
}, [activeIndexRef.current, blockIndexRef.current, user]);
  // ================= VOZ PREMIUM =================
  useEffect(() => {
    if (isPremium) {
      const saved = localStorage.getItem("heitor-premium-voice");
      if (saved) setSelectedVoiceURI(saved);
    }
  }, [isPremium]);

  useEffect(() => {
    if (isPremium && selectedVoiceURI) localStorage.setItem("heitor-premium-voice", selectedVoiceURI);
  }, [selectedVoiceURI, isPremium]);
  
  // ================= VOZES =================
  const loadVoices = () => {
    const available = speechSynthesis.getVoices().filter(v => v.lang.startsWith("pt"));
    setVoices(available);
    if (!selectedVoiceURI && available.length > 0) {
      const defaultVoice = available.find(v =>
        v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("maria") || v.name.toLowerCase().includes("brasil")
      ) || available[0];
      setSelectedVoiceURI(defaultVoice.voiceURI);
    }
  };

  useEffect(() => {
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  useEffect(() => {
    if (showVoiceSettings) setTimeout(loadVoices, 300);
  }, [showVoiceSettings]);

  // ================= WAKE LOCK =================
  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    if (playerState === "playing") requestWakeLock();
    else releaseWakeLock();
  }, [playerState]);

// ================= NO SLEEP ÁUDIO SILENCIOSO (self-contained) =================
useEffect(() => {
  const audio = document.createElement("audio");
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  audio.loop = true;
  audio.muted = true;
  audio.volume = 0;
  audio.style.display = "none";
  document.body.appendChild(audio);

  noSleepAudioRef.current = audio;

  return () => {
    if (audio) {
      audio.pause();
      audio.remove();
    }
  };
}, []);

// ================= NO SLEEP SELF-CONTAINED (sem npm) =================
useEffect(() => {
  const video = document.createElement("video");
  video.src = "https://cdn.jsdelivr.net/gh/richtr/NoSleep.js@latest/example/silent.mp4"; // vídeo silencioso público (1s em loop)
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.volume = 0;
  video.style.display = "none";
  document.body.appendChild(video); // adiciona escondido

  noSleepVideoRef.current = video;

  return () => {
    if (video) {
      video.pause();
      video.remove();
    }
  };
}, []);


  // ================= MEDIA SESSION =================
  const setupMediaSession = () => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Página ${activeCardIndex !== null ? activeCardIndex + 1 : 1}`,
      artist: "Heitor Reader",
    });
    navigator.mediaSession.setActionHandler("play", () => resumePlayback(activeIndexRef.current));
    navigator.mediaSession.setActionHandler("pause", () => pausePlayback(activeIndexRef.current));
    navigator.mediaSession.setActionHandler("stop", stopPlayback);
  };

  const clearMediaSession = () => {
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  };
   
    useEffect(() => {
  const video = document.createElement("video");
  video.src = "https://cdn.jsdelivr.net/gh/richtr/NoSleep.js@latest/example/silent.mp4";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.volume = 0;
  video.style.display = "none";
  document.body.appendChild(video);

  noSleepVideoRef.current = video;

  return () => {
    if (video) {
      video.pause();
      video.remove();
    }
  };
}, []);
     
// ================= VISIBILITY + BACKGROUND + NO SLEEP =================
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
      if (noSleepVideoRef.current) {
        noSleepVideoRef.current.play().catch(() => {});
      }
      if (wasPlayingBeforeBackgroundRef.current && activeIndexRef.current !== null) {
        resumePlayback(activeIndexRef.current);
        wasPlayingBeforeBackgroundRef.current = false;
      }
    } else if (playerState === "playing") {
      wasPlayingBeforeBackgroundRef.current = true;
    }
  };

  const handleFocus = () => {
    if (playerState === "playing" && activeIndexRef.current !== null) {
      resumePlayback(activeIndexRef.current);
    }
  };

  const handlePageShow = (e) => {
    if (e.persisted && playerState === "playing" && activeIndexRef.current !== null) {
      resumePlayback(activeIndexRef.current);
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("pageshow", handlePageShow);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("pageshow", handlePageShow);
  };
}, [playerState]);
  // ================= NO SLEEP (evita tela apagar) =================
useEffect(() => {
  noSleepRef.current = new NoSleep();
  
  return () => {
    if (noSleepRef.current) noSleepRef.current.disable();
  };
}, []);

  // ================= RESET 24H =================
  useEffect(() => {
    if (!usage.lastScan) return;
    const last = new Date(usage.lastScan);
    const now = new Date();
    const isDifferentDay =
      last.getDate() !== now.getDate() ||
      last.getMonth() !== now.getMonth() ||
      last.getFullYear() !== now.getFullYear();
    if (isDifferentDay) {
      setUsage(prev => ({
        daily: 0,
        monthly: prev.monthly,
        lastScan: new Date().toISOString(),
      }));
    }
  }, [usage.lastScan]);

  // ================= SCROLL MARCAÇÃO =================
  useEffect(() => {
    if (playerState === "playing" && activeCardIndex !== null) {
      const highlighted = document.getElementById(`block-${currentSpeakingIndex}`);
      if (highlighted) highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSpeakingIndex, playerState, activeCardIndex]);

  // ================= LIXEIRA + HISTÓRICO =================
  const moveToHistory = (id) => {
    const idx = texts.findIndex(t => t.id === id);
    if (idx === -1) return;
    if (activeCardIndex === idx) stopPlayback();
    if (activeCardIndex > idx) setActiveCardIndex(p => p - 1);
    const item = texts[idx];
    setTexts(prev => prev.filter((_, i) => i !== idx));
    setHistory(prev => [item, ...prev]);
    setStatusMessage("✅ Arquivado no histórico");
  };

  const restoreFromHistory = (id) => {
    const item = history.find(h => h.id === id);
    if (!item) return;
    setHistory(prev => prev.filter(h => h.id !== id));
    setTexts(prev => [...prev, item]);
    setStatusMessage("✅ Restaurado!");
  };

  const permanentDelete = (id) => {
    if (!window.confirm("Excluir permanentemente?")) return;
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  // ================= AUTH =================
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setStatusMessage("✅ Conta desconectada com sucesso!");
  };

  useEffect(() => {
    const loadUserData = async (session) => {
      try {
        await fetch("/.netlify/functions/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: session.user.id, email: session.user.email }),
        });
        const res = await fetch("/.netlify/functions/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const userData = await res.json();
        setUser(session.user);
        setPlan(userData.plan || "free");
        setUsage({
          daily: Number(userData.usage?.daily) || 0,
          monthly: Number(userData.usage?.monthly) || 0,
          lastScan: userData.usage?.lastScan || null,
        });
      } catch {
        setUser(null);
        setPlan(DEFAULT_PLAN);
        setUsage({ daily: 0, monthly: 0, lastScan: null });
      } finally {
        setAuthChecked(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) loadUserData(session);
      else {
        setUser(null);
        setPlan(DEFAULT_PLAN);
        setUsage({ daily: 0, monthly: 0, lastScan: null });
        setAuthChecked(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => data.session && loadUserData(data.session));
    return () => subscription.unsubscribe();
  }, []);

  // ================= TEXT FUNCTIONS =================
  function sanitizeText(text) {
    return text
      .replace(/[\[\]\(\)\{\}\*<>]/g, "")
      .replace(/_+/g, " ")
      .replace(/^NARRAÇÃO.*$/gim, "")
      .replace(/^Segue a transcrição.*$/gim, "")
      .replace(/^IA.*$/gim, "")
      .replace(/^[A-ZÁÀÂÃÉÈÍÓÔÕÚÇ\s]{5,}$/gm, "")
      .replace(/^\s*.+\s+\|\s+Página\s+\d+\s*$/gim, "")
      .replace(/^\s*Página\s+\d+\s*$/gim, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function splitIntoBlocks(text, maxLength = 160) {
    if (!text) return [];
    let normalized = text.replace(/\n\s*\n/g, "\n\n").trim();
    const paragraphs = normalized.split("\n\n");
    const blocks = [];
    let current = "";

    for (let para of paragraphs) {
      para = para.trim();
      if (!para) continue;
      const sentences = para.match(/[^.!?]+[.!?]+[\s"']*|[^.!?]+$/g) || [para];
      for (let sentence of sentences) {
        sentence = sentence.trim();
        if (!sentence) continue;
        const next = current ? current + " " + sentence : sentence;
        if (next.length <= maxLength) {
          current = next;
        } else {
          if (current) blocks.push(current);
          current = sentence;
          while (current.length > maxLength) {
            blocks.push(current.substring(0, maxLength));
            current = current.substring(maxLength).trim();
          }
        }
      }
      if (current) {
        blocks.push(current);
        current = "";
      }
    }
    return blocks.filter(b => b.length > 3);
  }

  // ================= VOICE & PLAYER =================
  function warmUpVoice() {
    if (warmedUpRef.current) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    warmedUpRef.current = true;
  }

  function getVoiceSettings() {
    return { rate: isPremium ? customRate : 1, pitch: isPremium ? customPitch : 1, volume: 1 };
  }

  function speakBlock(cardIndex) {
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;

    const u = new SpeechSynthesisUtterance(block);
    const s = getVoiceSettings();
    if (isPremium && selectedVoiceURI) {
      const chosen = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (chosen) u.voice = chosen;
    }
    u.rate = accessibilityMode ? 0.7 : s.rate;
    u.pitch = accessibilityMode ? 0.9 : s.pitch;
    u.volume = s.volume;

    utteranceRef.current = u;

    u.onstart = () => {
      setPlayerState("playing");
      setCurrentSpeakingIndex(blockIndexRef.current);
      setupMediaSession();
    };

    u.onend = () => {
      blockIndexRef.current += 1;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(cardIndex);
      } else if (continuous && activeIndexRef.current < texts.length - 1) {
        playFromStart(activeIndexRef.current + 1);
      } else {
        stopPlayback();
      }
    };

    speechSynthesis.speak(u);
  }

  
function playFromStart(index) {
  speechSynthesis.cancel();
  requestWakeLock();
  if (noSleepAudioRef.current) noSleepAudioRef.current.play().catch(() => {});

  warmUpVoice();
  activeIndexRef.current = index;
  setActiveCardIndex(index);
  const clean = sanitizeText(texts[index].text);
  blocksRef.current = splitIntoBlocks(clean);
  blockIndexRef.current = 0;
  speakBlock(index);
}

function pausePlayback(index) {
  if (activeCardIndex !== index) return;
  speechSynthesis.pause();
  setPlayerState("paused");
  if (noSleepAudioRef.current) noSleepAudioRef.current.pause();
  setStatusMessage("Leitura pausada");
}

function resumePlayback(index) {
  if (activeIndexRef.current !== index && activeCardIndex !== index) return;

  if (noSleepAudioRef.current) noSleepAudioRef.current.play().catch(() => {});
  requestWakeLock();

  if (!isMobile) {
    speechSynthesis.resume();
    setPlayerState("playing");
    setupMediaSession();
    return;
  }

  const block = blocksRef.current[blockIndexRef.current];
  if (!block) return;

  const u = new SpeechSynthesisUtterance(block);
  const s = getVoiceSettings();
  if (isPremium && selectedVoiceURI) {
    const chosen = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (chosen) u.voice = chosen;
  }
  u.rate = accessibilityMode ? 0.7 : s.rate;
  u.pitch = accessibilityMode ? 0.9 : s.pitch;
  u.volume = s.volume;

  u.onend = () => {
    blockIndexRef.current += 1;
    if (blockIndexRef.current < blocksRef.current.length) speakBlock(index);
    else stopPlayback();
  };

  utteranceRef.current = u;
  speechSynthesis.speak(u);
  setPlayerState("playing");
  setupMediaSession();
}

function stopPlayback() {
  speechSynthesis.cancel();
  releaseWakeLock();
  if (noSleepAudioRef.current) noSleepAudioRef.current.pause();
  clearMediaSession();
  activeIndexRef.current = null;
  setPlayerState("idle");
  setActiveCardIndex(null);
  setCurrentSpeakingIndex(0);
}

function resumePlayback(index) {
  if (activeCardIndex !== index && activeIndexRef.current !== index) return;

  // Reativa NoSleep + wakeLock
  if (noSleepVideoRef.current) noSleepVideoRef.current.play().catch(() => {});
  requestWakeLock();

  if (!isMobile) {
    speechSynthesis.resume();
    setPlayerState("playing");
    setupMediaSession();
    return;
  }

  // resto do seu resume original (o que recria o utterance)...
  const block = blocksRef.current[blockIndexRef.current];
  if (!block) return;
  const u = new SpeechSynthesisUtterance(block);
  // ... (mantenha o resto igual)
}

function stopPlayback() {
  speechSynthesis.cancel();
  releaseWakeLock();
  if (noSleepVideoRef.current) noSleepVideoRef.current.pause();
  clearMediaSession();
  activeIndexRef.current = null;
  setPlayerState("idle");
  setActiveCardIndex(null);
  setCurrentSpeakingIndex(0);
}
  // ================= HELPERS =================
  const hasDailyLimit = limits.daily !== null;

  // ================= PAYWALL =================
  const handleSelectPlan = async (selectedPlan) => {
    setShowPaywall(false);
    if (selectedPlan === "freemium") {
      if (plan === "freemium" || plan === "premium") {
        setStatusMessage("❌ Limite diário do Freemium atingido! Volte amanhã ou assine Premium para uso ilimitado.");
      } else {
        if (user) {
          await supabase.from("users").update({ plan: "freemium" }).eq("id", user.id);
        }
        setPlan("freemium");
        setStatusMessage("✅ Freemium ativado! (modo teste) - Limites ampliados. Pode continuar escaneando.");
      }
    }
  };

  // ================= OPEN PICKER =================
  const openScanner = () => {
    if (!user) {
      setStatusMessage("Faça login para escanear documentos.");
      return;
    }
    if (hasDailyLimit && usage.daily >= limits.daily) {
      setStatusMessage("❌ Você atingiu o limite diário de scans! Faça upgrade ou aguarde amanhã.");
      setShowPaywall(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  const openImage = () => {
    if (!user) {
      setStatusMessage("Faça login para escanear documentos.");
      return;
    }
    if (hasDailyLimit && usage.daily >= limits.daily) {
      setStatusMessage("❌ Você atingiu o limite diário de scans! Faça upgrade ou aguarde amanhã.");
      setShowPaywall(true);
      return;
    }
    imageInputRef.current?.click();
  };

  const openPdf = () => {
    if (!user) {
      setStatusMessage("Faça login para escanear documentos.");
      return;
    }
    if (hasDailyLimit && usage.daily >= limits.daily) {
      setStatusMessage("❌ Você atingiu o limite diário de scans! Faça upgrade ou aguarde amanhã.");
      setShowPaywall(true);
      return;
    }
    pdfInputRef.current?.click();
  };

  // ================= OCR =================
  async function handleImageUpload(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    await handleScan(file);
    e.target.value = "";
  }

  async function handleScan(file) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      setLoading(true);
      setStatusMessage("Scan Pag. 1");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (res.status === 403) {
        setStatusMessage("❌ Limite atingido!");
        setShowPaywall(true);
        return;
      }
      const data = await res.json();
      if (data.usage) {
        setUsage(prev => ({
          daily: data.usage.daily ?? prev.daily,
          monthly: data.usage.monthly ?? prev.monthly,
          lastScan: prev.lastScan,
        }));
      }
      if (data.text) {
        const clean = sanitizeText(data.text);
        if (clean.length > 10) {
          const newEntry = {
            id: `scan-${Date.now()}`,
            text: clean,
            timestamp: new Date().toISOString(),
          };
          setTexts(prev => [...prev, newEntry]);
        }
      }
      setStatusMessage("Escaneamento concluído!");
    } catch (err) {
      console.error("SCAN ERROR:", err);
      setStatusMessage("Erro ao escanear.");
    } finally {
      processingRef.current = false;
      setLoading(false);
    }
  }

  // ================= PDF =================
  async function handlePdfUpload(e) {
    if (processingRef.current) return;
    processingRef.current = true;
    abortProcessingRef.current = false;
    const file = e.target?.files?.[0];
    if (!file) {
      processingRef.current = false;
      return;
    }
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const maxPages = pdf.numPages;
      const hasDailyLimitLocal = limits.daily !== null;

      if (hasDailyLimitLocal) {
        const remaining = limits.daily - (usage.daily || 0);
        if (maxPages > remaining) {
          setStatusMessage(`⚠️ Este PDF tem ${maxPages} páginas e você só pode escanear ${remaining} hoje.`);
          if (window.confirm("Deseja fazer upgrade?")) setShowPaywall(true);
          processingRef.current = false;
          setLoading(false);
          e.target.value = "";
          return;
        }
      }

      const newEntries = [];
      for (let i = 1; i <= maxPages; i++) {
        if (abortProcessingRef.current) break;
        await new Promise(r => setTimeout(r, 0));
        setStatusMessage(`Scan Pag. ${i}/${maxPages}`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
        const formData = new FormData();
        formData.append("file", blob, `page-${i}.png`);
        const res = await fetch("/.netlify/functions/ocr", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        if (res.status === 403) {
          setStatusMessage("❌ Limite atingido! Aguarde reset ou faça upgrade.");
          setShowPaywall(true);
          break;
        }
        const data = await res.json();
        if (data.usage) {
          setUsage(prev => ({
            daily: data.usage.daily ?? prev.daily,
            monthly: data.usage.monthly ?? prev.monthly,
            lastScan: prev.lastScan,
          }));
        }
        if (data.text) {
          const clean = sanitizeText(data.text);
          if (clean.length > 20) {
            newEntries.push({
              id: `scan-${Date.now()}-${i}`,
              text: clean,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      if (newEntries.length > 0) {
        setTexts(prev => [...prev, ...newEntries]);
      }
      setStatusMessage("PDF processado com sucesso!");
    } catch (err) {
      console.error("PDF ERROR:", err);
      setStatusMessage("Erro ao processar PDF.");
    } finally {
      processingRef.current = false;
      setLoading(false);
      e.target.value = "";
    }
  }

  // ================= CANCEL =================
  const cancelScan = () => {
    abortProcessingRef.current = true;
    setLoading(false);
    setStatusMessage("Escaneamento cancelado.");
  };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-neutral-400">Verificando plano...</div>;
  }

  return (
    <div className={`min-h-screen text-neutral-200 p-4 ${isPremium ? "bg-neutral-800" : isFreemium ? "bg-neutral-900/95" : "bg-neutral-900"}`}>
      <div className={`max-w-6xl mx-auto rounded-2xl p-6 space-y-6 ${isPremium ? "bg-neutral-500 text-neutral-950 shadow-xl" : isFreemium ? "bg-neutral-800 text-neutral-100" : "bg-neutral-800 text-neutral-200"}`}>
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">Leitura assistida</p>
          {canUseAccessibility && (
            <button onClick={() => setAccessibilityMode(v => !v)} className={`mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs border ${accessibilityMode ? "bg-amber-700 border-amber-400 text-white" : "bg-neutral-700 border-neutral-600 text-neutral-300"}`}>
              👵 Modo 60+
            </button>
          )}
          {isPremium && (
            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className="mt-2 text-xs px-4 py-1 rounded-full border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-neutral-950 transition">
              🔊 Voz Premium
            </button>
          )}
          {user && (
            <button onClick={handleLogout} className="mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition">
              🚪 Sair da conta
            </button>
          )}
        </header>

        {isPremium && showVoiceSettings && (
          <div className="bg-neutral-900 p-4 rounded-xl text-sm mt-4">
            <label className="block mb-2">Voz em Português:</label>
            {voices.length > 0 ? (
              <select value={selectedVoiceURI || ""} onChange={e => setSelectedVoiceURI(e.target.value)} className="w-full bg-neutral-800 p-3 rounded text-neutral-200 border border-neutral-700">
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} {v.lang}</option>)}
              </select>
            ) : (
              <p className="text-amber-400 text-xs">Carregando vozes... (toque novamente se não aparecer)</p>
            )}
            <label className="block mt-4 mb-1">Velocidade: {customRate.toFixed(1)}x</label>
            <input type="range" min="0.5" max="2" step="0.1" value={customRate} onChange={e => setCustomRate(parseFloat(e.target.value))} className="w-full" />
            <label className="block mt-4 mb-1">Tom: {customPitch.toFixed(1)}</label>
            <input type="range" min="0.5" max="1.5" step="0.1" value={customPitch} onChange={e => setCustomPitch(parseFloat(e.target.value))} className="w-full" />
          </div>
        )}

        <div className="text-center text-cyan-400 text-sm min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
          {loading && (
            <button onClick={cancelScan} className="ml-4 bg-red-600 hover:bg-red-700 px-4 py-1 rounded text-xs transition">
              Cancelar scan
            </button>
          )}
        </div>

        <section className="flex justify-center gap-4 flex-wrap">
          <div onClick={openScanner} className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <CameraIcon className="h-8 w-8" />
            <span>Scanner</span>
            <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={handleImageUpload} />
          </div>
          <div onClick={openImage} className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <PhotoIcon className="h-8 w-8" />
            <span>Imagem de texto</span>
            <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={handleImageUpload} />
          </div>
          <div onClick={openPdf} className="w-36 h-28 bg-red-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <DocumentTextIcon className="h-8 w-8" />
            <span>PDF</span>
            <input ref={pdfInputRef} hidden type="file" accept="application/pdf" onChange={handlePdfUpload} />
          </div>
        </section>

        <label className="flex justify-center gap-2 text-sm">
          <input type="checkbox" checked={continuous} onChange={() => setContinuous(!continuous)} />
          Leitura contínua
        </label>

        <section ref={cardsContainerRef} className="flex gap-4 overflow-x-auto pb-4">
          {texts.map((entry, i) => {
            const isActive = activeCardIndex === i;
            const isAccessibleActive = accessibilityMode && isActive;
            const isPlaying = playerState === "playing" && isActive;
            return (
              <div
                key={entry.id}
                className={`min-w-[280px] p-5 rounded-xl border-2 transition-all ${
                  isPremium ? "bg-white text-neutral-900 border-amber-300" : isFreemium ? "bg-neutral-800 text-neutral-100 border-cyan-500/40" : "bg-neutral-900 text-neutral-200 border-neutral-700"
                } ${isActive ? "border-4 border-green-400 shadow-2xl" : ""} ${
                  isAccessibleActive ? "bg-neutral-950 text-amber-100 border-amber-400" : ""
                }`}
              >
                <div className="flex justify-between mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    <PlayIcon className="h-5 w-5 cursor-pointer text-green-400 hover:scale-110" onClick={() => playFromStart(i)} />
                    {playerState === "playing" && isActive ? (
                      <PauseIcon className="h-5 w-5 cursor-pointer text-yellow-400 hover:scale-110" onClick={() => pausePlayback(i)} />
                    ) : (
                      <PlayIcon className="h-5 w-5 cursor-pointer text-yellow-400 hover:scale-110" onClick={() => resumePlayback(i)} />
                    )}
                    <ArrowUturnLeftIcon className={`h-5 w-5 cursor-pointer text-blue-400 hover:scale-110 ${rewindFlash ? "opacity-100" : "opacity-70"}`} onClick={() => rewind(i)} />
                    <StopIcon className="h-5 w-5 cursor-pointer text-red-400 hover:scale-110" onClick={stopPlayback} />
                    <ArchiveBoxIcon className="h-5 w-5 cursor-pointer text-blue-400 hover:text-blue-500" onClick={() => moveToHistory(entry.id)} />
                  </div>
                </div>
                <div className={`overflow-y-auto whitespace-pre-wrap ${accessibilityMode ? "text-base leading-relaxed max-h-60" : "text-xs max-h-40"}`}>
                  {isPlaying ? (
                    blocksRef.current.map((block, idx) => (
                      <div
                        key={idx}
                        id={`block-${idx}`}
                        className={`mb-3 p-3 rounded-lg transition-all duration-300 ${
                          idx === currentSpeakingIndex
                            ? "bg-green-900/80 border-l-4 border-green-400 text-green-100"
                            : "opacity-70"
                        }`}
                      >
                        {block}
                      </div>
                    ))
                  ) : (
                    entry.text
                  )}
                </div>
                {isActive && playerState === "playing" && (
                  <div className="text-green-400 text-xs mt-2 flex items-center gap-1">
                    🔊 Lendo bloco {currentSpeakingIndex + 1} / {blocksRef.current.length}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {history.length > 0 && (
          <section className="mt-8 bg-neutral-950/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-300">🗃️ Histórico ({history.length})</h2>
              <button onClick={() => window.confirm("Limpar TODO o histórico?") && setHistory([])} className="text-xs text-red-400 hover:text-red-500">
                Limpar tudo
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-xl hover:bg-neutral-800 transition-all group text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="text-neutral-500">{new Date(entry.timestamp).toLocaleString("pt-BR")}</div>
                    <div className="text-neutral-300 truncate">{entry.text.substring(0, 65)}...</div>
                  </div>
                  <div className="flex gap-3 opacity-70 group-hover:opacity-100">
                    <button onClick={() => restoreFromHistory(entry.id)} className="text-green-400">↩️</button>
                    <button onClick={() => permanentDelete(entry.id)} className="text-red-400"><TrashIcon className="h-5 w-5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!user && (
          <button onClick={loginWithGoogle} className="bg-neutral-700 hover:bg-neutral-600 px-5 py-3 rounded-xl text-sm w-full max-w-xs mx-auto block">
            Entrar com Google
          </button>
        )}
      </div>

      <footer className="text-center text-xs mt-6 space-y-2">
        <span className={isPremium ? "text-amber-600 font-semibold" : isFreemium ? "text-cyan-400" : "text-neutral-400"}>Plano: {safePlan}</span>
        <div>Uso hoje: {usage.daily}</div>
        <div className="w-full bg-neutral-800 rounded-full h-2 mt-1">
          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${monthlyPercent}%` }} />
        </div>
        <div>{usage.monthly} / {limits.monthly} este mês</div>
      </footer>

      {showPaywall && (
        <Paywall
          onClose={() => setShowPaywall(false)}
          onSelectPlan={handleSelectPlan}
        />
      )}
    </div>
  );
}
