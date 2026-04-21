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
  const safePlan = plan || "free";
  const isPremium = safePlan === "premium";
  const isFreemium = safePlan === "freemium";
  const limits = PLAN_LIMITS[safePlan] || PLAN_LIMITS.free;
  const monthlyPercent = Math.min(((usage?.monthly || 0) / limits.monthly) * 100, 100);
  const canUseAccessibility = plan === "freemium" || plan === "premium";

  /* ================= REFS ================= */
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const activeIndexRef = useRef(null);
  const audioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const noSleepVideoRef = useRef(null);
  const wasPlayingBeforeBackgroundRef = useRef(false);
  const cardsContainerRef = useRef(null);
  const cameraInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const processingRef = useRef(false);
  const abortProcessingRef = useRef(false);

  // ================= PERSISTÊNCIA =================
  useEffect(() => {
    if (!authChecked) return;
    const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
    const savedTexts = localStorage.getItem(`${prefix}-texts`);
    const savedHistory = localStorage.getItem(`${prefix}-history`);
    if (savedTexts) try { setTexts(JSON.parse(savedTexts)); } catch {}
    if (savedHistory) try { setHistory(JSON.parse(savedHistory)); } catch {}
  }, [authChecked, user]);

  useEffect(() => {
    const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
    localStorage.setItem(`${prefix}-texts`, JSON.stringify(texts));
    localStorage.setItem(`${prefix}-history`, JSON.stringify(history));
  }, [texts, history, user]);

  // ================= PERSISTÊNCIA DO PONTO DE LEITURA =================
  useEffect(() => {
    if (!authChecked) return;
    const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
    const savedPlayback = localStorage.getItem(`${prefix}-playback`);
    if (savedPlayback) {
      const { activeIndex, blockIndex } = JSON.parse(savedPlayback);
      if (activeIndex !== undefined && texts[activeIndex]) {
        activeIndexRef.current = activeIndex;
        blockIndexRef.current = blockIndex || 0;
        setActiveCardIndex(activeIndex);
      }
    }
  }, [authChecked, user, texts]);

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

  // ================= MEDIA SESSION =================
  const setupMediaSession = () => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Página ${activeCardIndex !== null ? activeCardIndex + 1 : 1}`,
      artist: "Heitor Reader",
    });
    navigator.mediaSession.setActionHandler("play", resumePlayback);
    navigator.mediaSession.setActionHandler("pause", pausePlayback);
    navigator.mediaSession.setActionHandler("stop", stopPlayback);
  };

  const clearMediaSession = () => {
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  };

  // ================= NO SLEEP =================
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

  // ================= VISIBILITY + BACKGROUND =================
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
        if (noSleepVideoRef.current) noSleepVideoRef.current.play().catch(() => {});
        if (wasPlayingBeforeBackgroundRef.current && activeIndexRef.current !== null) {
          resumePlayback();
          wasPlayingBeforeBackgroundRef.current = false;
        }
      } else if (playerState === "playing") {
        wasPlayingBeforeBackgroundRef.current = true;
      }
    };

    const handleFocus = () => {
      if (activeIndexRef.current !== null) resumePlayback();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [playerState]);

  // ================= RESET 24H =================
  useEffect(() => {
    if (!usage.lastScan) return;
    const last = new Date(usage.lastScan);
    const now = new Date();
    const isDifferentDay = last.getDate() !== now.getDate() || last.getMonth() !== now.getMonth() || last.getFullYear() !== now.getFullYear();
    if (isDifferentDay) {
      setUsage(prev => ({ daily: 0, monthly: prev.monthly, lastScan: new Date().toISOString() }));
    }
  }, [usage.lastScan]);

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
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
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

  // ================= PLAYER ÁUDIO + TTS GOOGLE =================
  const getTTSUrl = (text) => {
    return `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(text)}`;
  };

  function playFromStart(index) {
    if (!texts[index]) return;
    audioRef.current?.pause();
    requestWakeLock();
    if (noSleepVideoRef.current) noSleepVideoRef.current.play().catch(() => {});

    activeIndexRef.current = index;
    setActiveCardIndex(index);
    setPlayerState("playing");

    const clean = sanitizeText(texts[index].text);
    blocksRef.current = splitIntoBlocks(clean);
    blockIndexRef.current = 0;
    playCurrentBlock();
  }

  function playCurrentBlock() {
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return stopPlayback();

    const audio = new Audio(getTTSUrl(block));
    audioRef.current = audio;

    audio.onplay = () => { setPlayerState("playing"); setupMediaSession(); };
    audio.onended = () => {
      blockIndexRef.current += 1;
      if (blockIndexRef.current < blocksRef.current.length) playCurrentBlock();
      else if (continuous && activeIndexRef.current < texts.length - 1) playFromStart(activeIndexRef.current + 1);
      else stopPlayback();
    };

    audio.play().catch(() => stopPlayback());
  }

  function pausePlayback() {
    audioRef.current?.pause();
    setPlayerState("paused");
    setStatusMessage("Leitura pausada");
  }

  function resumePlayback() {
    if (activeIndexRef.current === null) return;
    requestWakeLock();
    if (noSleepVideoRef.current) noSleepVideoRef.current.play().catch(() => {});
    if (audioRef.current?.paused) audioRef.current.play().catch(() => playCurrentBlock());
    else playCurrentBlock();
    setPlayerState("playing");
    setupMediaSession();
  }

  function rewind() {
    if (blockIndexRef.current <= 0) return;
    blockIndexRef.current -= 1;
    setRewindFlash(true);
    setTimeout(() => setRewindFlash(false), 200);
    playCurrentBlock();
  }

  function stopPlayback() {
    audioRef.current?.pause();
    releaseWakeLock();
    if (noSleepVideoRef.current) noSleepVideoRef.current.pause();
    clearMediaSession();
    activeIndexRef.current = null;
    setPlayerState("idle");
    setActiveCardIndex(null);
    blockIndexRef.current = 0;
  }

  // ================= OCR & PDF (original restaurado) =================
  const openScanner = () => {
    if (!user) return setStatusMessage("Faça login para escanear documentos.");
    if (limits.daily !== null && usage.daily >= limits.daily) {
      setStatusMessage("❌ Limite diário atingido!");
      setShowPaywall(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  const openImage = () => {
    if (!user) return setStatusMessage("Faça login para escanear documentos.");
    if (limits.daily !== null && usage.daily >= limits.daily) {
      setStatusMessage("❌ Limite diário atingido!");
      setShowPaywall(true);
      return;
    }
    imageInputRef.current?.click();
  };

  const openPdf = () => {
    if (!user) return setStatusMessage("Faça login para escanear documentos.");
    if (limits.daily !== null && usage.daily >= limits.daily) {
      setStatusMessage("❌ Limite diário atingido!");
      setShowPaywall(true);
      return;
    }
    pdfInputRef.current?.click();
  };

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
      if (data.usage) setUsage(prev => ({ ...prev, daily: data.usage.daily ?? prev.daily, monthly: data.usage.monthly ?? prev.monthly }));
      if (data.text) {
        const clean = sanitizeText(data.text);
        if (clean.length > 10) {
          setTexts(prev => [...prev, { id: `scan-${Date.now()}`, text: clean, timestamp: new Date().toISOString() }]);
        }
      }
      setStatusMessage("Escaneamento concluído!");
    } catch (err) {
      console.error(err);
      setStatusMessage("Erro ao escanear.");
    } finally {
      processingRef.current = false;
      setLoading(false);
    }
  }

  async function handlePdfUpload(e) {
    if (processingRef.current) return;
    processingRef.current = true;
    abortProcessingRef.current = false;
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const maxPages = pdf.numPages;
      const newEntries = [];
      for (let i = 1; i <= maxPages; i++) {
        if (abortProcessingRef.current) break;
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
          setShowPaywall(true);
          break;
        }
        const data = await res.json();
        if (data.usage) setUsage(prev => ({ ...prev, daily: data.usage.daily ?? prev.daily }));
        if (data.text) {
          const clean = sanitizeText(data.text);
          if (clean.length > 20) newEntries.push({ id: `scan-${Date.now()}-${i}`, text: clean, timestamp: new Date().toISOString() });
        }
      }
      if (newEntries.length) setTexts(prev => [...prev, ...newEntries]);
      setStatusMessage("PDF processado com sucesso!");
    } catch (err) {
      console.error(err);
      setStatusMessage("Erro ao processar PDF.");
    } finally {
      processingRef.current = false;
      setLoading(false);
      e.target.value = "";
    }
  }

  const cancelScan = () => {
    abortProcessingRef.current = true;
    setLoading(false);
    setStatusMessage("Escaneamento cancelado.");
  };

  // ================= RENDER =================
  if (!authChecked) return <div className="min-h-screen flex items-center justify-center text-neutral-400">Verificando plano...</div>;

  return (
    <div className={`min-h-screen text-neutral-200 p-4 ${isPremium ? "bg-neutral-800" : isFreemium ? "bg-neutral-900/95" : "bg-neutral-900"}`}>
      <div className={`max-w-6xl mx-auto rounded-2xl p-6 space-y-6 ${isPremium ? "bg-neutral-500 text-neutral-950 shadow-xl" : isFreemium ? "bg-neutral-800 text-neutral-100" : "bg-neutral-800 text-neutral-200"}`}>
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">Leitura assistida</p>
        </header>

        <div className="text-center text-cyan-400 text-sm min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
          {loading && <button onClick={cancelScan} className="ml-4 bg-red-600 hover:bg-red-700 px-4 py-1 rounded text-xs transition">Cancelar scan</button>}
        </div>

        {/* === ÍCONES DO SCANNER (agora funcionando) === */}
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

        {/* Cards de texto + player */}
        <section ref={cardsContainerRef} className="flex gap-4 overflow-x-auto pb-4">
          {texts.map((entry, i) => {
            const isActive = activeCardIndex === i;
            const isPlaying = playerState === "playing" && isActive;
            return (
              <div key={entry.id} className={`min-w-[280px] p-5 rounded-xl border-2 transition-all ${isPremium ? "bg-white text-neutral-900 border-amber-300" : isFreemium ? "bg-neutral-800 text-neutral-100 border-cyan-500/40" : "bg-neutral-900 text-neutral-200 border-neutral-700"} ${isActive ? "border-4 border-green-400 shadow-2xl" : ""}`}>
                <div className="flex justify-between mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    <PlayIcon className="h-5 w-5 cursor-pointer text-green-400 hover:scale-110" onClick={() => playFromStart(i)} />
                    {isPlaying ? <PauseIcon className="h-5 w-5 cursor-pointer text-yellow-400 hover:scale-110" onClick={pausePlayback} /> : <PlayIcon className="h-5 w-5 cursor-pointer text-yellow-400 hover:scale-110" onClick={resumePlayback} />}
                    <ArrowUturnLeftIcon className={`h-5 w-5 cursor-pointer text-blue-400 hover:scale-110 ${rewindFlash ? "opacity-100" : "opacity-70"}`} onClick={rewind} />
                    <StopIcon className="h-5 w-5 cursor-pointer text-red-400 hover:scale-110" onClick={stopPlayback} />
                    <ArchiveBoxIcon className="h-5 w-5 cursor-pointer text-blue-400 hover:text-blue-500" onClick={() => moveToHistory(entry.id)} />
                  </div>
                </div>
                <div className={`overflow-y-auto whitespace-pre-wrap ${accessibilityMode ? "text-base leading-relaxed max-h-60" : "text-xs max-h-40"}`}>
                  {isPlaying ? blocksRef.current.map((block, idx) => (
                    <div key={idx} id={`block-${idx}`} className={`mb-3 p-3 rounded-lg transition-all ${idx === blockIndexRef.current ? "bg-green-900/80 border-l-4 border-green-400 text-green-100" : "opacity-70"}`}>{block}</div>
                  )) : entry.text}
                </div>
              </div>
            );
          })}
        </section>

        {/* Histórico */}
        {history.length > 0 && (
          <section className="mt-8 bg-neutral-950/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-300">🗃️ Histórico ({history.length})</h2>
              <button onClick={() => window.confirm("Limpar TODO o histórico?") && setHistory([])} className="text-xs text-red-400 hover:text-red-500">Limpar tudo</button>
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

      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} onSelectPlan={handleSelectPlan} />}
    </div>
  );
}
