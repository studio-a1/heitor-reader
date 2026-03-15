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
  TrashIcon,
} from "@heroicons/react/24/outline";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
import Paywall from "./components/Paywall";

/* ================= CONFIG ================= */
const DEFAULT_PLAN = "free";
const PLAN_LIMITS = {
  free: { daily: 2, monthly: 60 },
  freemium: { daily: 20, monthly: 300 },
  premium: { daily: 1500, monthly: 1500 },
};
const isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  // ================= STATES =================
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [usage, setUsage] = useState({ daily: 0, monthly: 0, lastScan: null });
  const [authChecked, setAuthChecked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const [texts, setTexts] = useState([]);           // cards ativos
  const [history, setHistory] = useState([]);       // histórico
  const [activeCardIndex, setActiveCardIndex] = useState(null);

  const [playerState, setPlayerState] = useState("idle");
  const [continuous, setContinuous] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Escolha como deseja importar o conteúdo.");
  const [loading, setLoading] = useState(false);

  // ================= MODO ACESSÍVEL (só Freemium/Premium) =================
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const canUseAccessibility = plan === "freemium" || plan === "premium";

  const safePlan = plan || "free";
  const isPremium = safePlan === "premium";
  const isFreemium = safePlan === "freemium";
  const limits = PLAN_LIMITS[safePlan] || PLAN_LIMITS.free;
  const monthlyPercent = Math.min(((usage?.monthly || 0) / limits.monthly) * 100, 100);

  /* ================= REFS ================= */
  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const warmedUpRef = useRef(false);
  const abortProcessingRef = useRef(false);
  const processingRef = useRef(false);
  const wakeLockRef = useRef(null);

  // ================= PERSISTÊNCIA NO BROWSER =================
  useEffect(() => {
    if (!authChecked) return;
    const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
    const savedTexts = localStorage.getItem(`${prefix}-texts`);
    const savedHistory = localStorage.getItem(`${prefix}-history`);
    if (savedTexts) try { setTexts(JSON.parse(savedTexts)); } catch (e) {}
    if (savedHistory) try { setHistory(JSON.parse(savedHistory)); } catch (e) {}
  }, [authChecked, user]);

  useEffect(() => {
    const prefix = user ? `heitor-reader-${user.id}` : "heitor-reader-anon";
    localStorage.setItem(`${prefix}-texts`, JSON.stringify(texts));
    localStorage.setItem(`${prefix}-history`, JSON.stringify(history));
  }, [texts, history, user]);

  // ================= WAKE LOCK (tela não apaga) =================
  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch (e) {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // ================= LIXEIRA + HISTÓRICO COMPACTO =================
  const moveToHistory = (id) => {
    const idx = texts.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (activeCardIndex === idx) stopPlayback();
    if (activeCardIndex > idx) setActiveCardIndex((p) => p - 1);
    const item = texts[idx];
    setTexts((prev) => prev.filter((_, i) => i !== idx));
    setHistory((prev) => [item, ...prev]);
    setStatusMessage("✅ Movido para o histórico");
  };

  const restoreFromHistory = (id) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    setHistory((prev) => prev.filter((h) => h.id !== id));
    setTexts((prev) => [...prev, item]);
    setStatusMessage("✅ Restaurado!");
  };

  const permanentDelete = (id) => {
    if (!window.confirm("Excluir permanentemente do histórico?")) return;
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  // ================= AUTH =================
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
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
        if (!res.ok) throw new Error();
        const userData = await res.json();
        setUser(session.user);
        setPlan(userData.plan || "free");
        setUsage({
          daily: Number(userData.usage?.daily) || 0,
          monthly: Number(userData.usage?.monthly) || 0,
          lastScan: new Date().toISOString(),
        });
      } catch {
        setUser(null);
        setPlan("free");
        setUsage({ daily: 0, monthly: 0, lastScan: null });
      } finally {
        setAuthChecked(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) loadUserData(session);
      else {
        setUser(null);
        setAuthChecked(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadUserData(data.session);
      else setAuthChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ================= TEXT FUNCTIONS =================
  function sanitizeText(text) {
    return text
      .replace(/[\[\]\(\)\{\}\*<>]/g, "")
      .replace(/^NARRAÇÃO.*$/gim, "")
      .replace(/^Segue a transcrição.*$/gim, "")
      .replace(/^IA.*$/gim, "")
      .replace(/^[A-ZÁÀÂÃÉÈÍÓÔÕÚÇ\s]{5,}$/gm, "")
      .replace(/^\s*.+\s+\|\s+Página\s+\d+\s*$/gim, "")
      .replace(/^\s*Página\s+\d+\s*$/gim, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  useEffect(() => {
    if (texts.length < 3) return;
    const firstLines = texts.map((entry) => entry.text.split("\n")[0] || "");
    const frequency = {};
    firstLines.forEach((line) => {
      if (line) frequency[line] = (frequency[line] || 0) + 1;
    });
    const threshold = Math.ceil(texts.length * 0.6);
    const repeatedHeaders = Object.entries(frequency)
      .filter(([, count]) => count >= threshold)
      .map(([line]) => line);

    setTexts((prev) =>
      prev.map((entry) => {
        let cleaned = entry.text;
        repeatedHeaders.forEach((header) => {
          const regex = new RegExp("^" + header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "m");
          cleaned = cleaned.replace(regex, "").trim();
        });
        return { ...entry, text: cleaned };
      })
    );
  }, [texts.length]);

  function splitIntoBlocks(text, maxLength = 600) {
    const lines = text.split(/\n+/);
    const blocks = [];
    let current = "";
    for (const line of lines) {
      if ((current + line).length <= maxLength) {
        current += line + "\n";
      } else {
        blocks.push(current.trim());
        current = line + "\n";
      }
    }
    if (current.trim()) blocks.push(current.trim());
    return blocks;
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
    if (plan === "premium") {
      return { rate: isMobile ? 0.9 : 0.85, pitch: 0.95, volume: 1 };
    }
    return { rate: 1, pitch: 1, volume: 1 };
  }

  function speakBlock(cardIndex) {
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;
    const u = new SpeechSynthesisUtterance(block);
    const s = getVoiceSettings();
    u.rate = accessibilityMode ? 0.7 : s.rate;
    u.pitch = accessibilityMode ? 0.9 : s.pitch;
    u.volume = s.volume;
    utteranceRef.current = u;
    u.onstart = () => setPlayerState("playing");
    u.onend = () => {
      blockIndexRef.current += 1;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(cardIndex);
      } else if (continuous && cardIndex < texts.length - 1) {
        playFromStart(cardIndex + 1);
      } else {
        stopPlayback();
      }
    };
    speechSynthesis.speak(u);
  }

  function playFromStart(index) {
    requestWakeLock();
    warmUpVoice();
    speechSynthesis.cancel();
    setActiveCardIndex(index);
    const clean = sanitizeText(texts[index].text);
    blocksRef.current = splitIntoBlocks(clean, isMobile ? 450 : 600);
    blockIndexRef.current = 0;
    speakBlock(index);
  }

  function pausePlayback(index) {
    if (activeCardIndex !== index) return;
    speechSynthesis.pause();
    setPlayerState("paused");
    setStatusMessage("Leitura pausada");
  }

  function resumePlayback(index) {
    if (activeCardIndex !== index) return;
    if (!isMobile) {
      speechSynthesis.resume();
      setPlayerState("playing");
      return;
    }
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;
    const u = new SpeechSynthesisUtterance(block);
    u.onend = () => {
      blockIndexRef.current += 1;
      if (blockIndexRef.current < blocksRef.current.length) speakBlock(index);
      else stopPlayback();
    };
    speechSynthesis.speak(u);
    setPlayerState("playing");
  }

  function rewind(index) {
    if (activeCardIndex !== index || blockIndexRef.current === 0) return;
    setRewindFlash(true);
    setTimeout(() => setRewindFlash(false), 200);
    speechSynthesis.cancel();
    blockIndexRef.current -= 1;
    speakBlock(index);
  }

  function stopPlayback() {
    speechSynthesis.cancel();
    releaseWakeLock();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
    setActiveCardIndex(null);
  }

  // ================= OCR =================
  async function handleImageUpload(e) {
    const file = e.target?.files?.[0];
    if (!file || !user) {
      setShowPaywall(true);
      return;
    }
    await handleScan(file);
    e.target.value = "";
  }

  async function handleScan(file) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      setLoading(true);
      setStatusMessage("Processando imagem...");
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
        setShowPaywall(true);
        return;
      }
      const data = await res.json();
      if (data.text) {
        const clean = sanitizeText(data.text);
        if (clean.length > 10) {
          const newEntry = {
            id: `scan-${Date.now()}`,
            text: clean,
            timestamp: new Date().toISOString(),
          };
          setTexts((prev) => [...prev, newEntry]);
        }
      }
      setStatusMessage("Escaneamento concluído!");
    } catch {
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
      setStatusMessage("Preparando PDF...");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      let maxPages = pdf.numPages;
      for (let i = 1; i <= maxPages; i++) {
        if (abortProcessingRef.current) break;
        setStatusMessage(`Processando página ${i}/${maxPages}`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
        const formData = new FormData();
        formData.append("file", blob, `page-${i}.png`);
        const res = await fetch("/.netlify/functions/ocr", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        const data = await res.json();
        if (data.text) {
          const clean = sanitizeText(data.text);
          if (clean.length > 30) {
            const newEntry = {
              id: `scan-${Date.now()}`,
              text: clean,
              timestamp: new Date().toISOString(),
            };
            setTexts((prev) => [...prev, newEntry]);
          }
        }
      }
      setStatusMessage("PDF processado com sucesso!");
    } catch {
      setStatusMessage("Erro ao processar PDF.");
    } finally {
      processingRef.current = false;
      setLoading(false);
      e.target.value = "";
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400">
        Verificando plano...
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen text-neutral-200 p-4 transition-colors duration-500 ${
        isPremium ? "bg-neutral-800" : isFreemium ? "bg-neutral-900/95" : "bg-neutral-900"
      }`}
    >
      <div
        className={`max-w-6xl mx-auto rounded-2xl p-6 space-y-6 transition-all ${
          isPremium
            ? "bg-neutral-500 text-neutral-950 shadow-xl"
            : isFreemium
            ? "bg-neutral-800 text-neutral-100"
            : "bg-neutral-800 text-neutral-200"
        }`}
      >
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">Leitura assistida</p>

          {/* MODO ACESSÍVEL - DISCRETO */}
          {canUseAccessibility && (
            <button
              onClick={() => setAccessibilityMode((v) => !v)}
              className={`mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs border transition-all ${
                accessibilityMode
                  ? "bg-amber-700 border-amber-400 text-white"
                  : "bg-neutral-700 border-neutral-600 text-neutral-300"
              }`}
            >
              👵 Modo 60+
            </button>
          )}
        </header>

        <div className="text-center text-cyan-400 text-sm min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
          {loading && (
            <button
              onClick={() => (abortProcessingRef.current = true)}
              className="ml-3 bg-red-600 px-3 py-1 rounded text-white text-xs"
            >
              Cancelar
            </button>
          )}
        </div>

        {/* IMPORT */}
        <section className="flex justify-center gap-4 flex-wrap">
          <label className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <CameraIcon className="h-8 w-8" />
            <span>Scanner</span>
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageUpload}
            />
          </label>
          <label className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <PhotoIcon className="h-8 w-8" />
            <span>Imagem</span>
            <input hidden type="file" accept="image/*" onChange={handleImageUpload} />
          </label>
          <label className="w-36 h-28 bg-red-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <DocumentTextIcon className="h-8 w-8" />
            <span>PDF</span>
            <input hidden type="file" accept="application/pdf" onChange={handlePdfUpload} />
          </label>
        </section>

        <label className="flex justify-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={continuous}
            onChange={() => setContinuous(!continuous)}
          />
          Leitura contínua
        </label>

        {/* CARDS */}
        <section className="flex gap-4 overflow-x-auto">
          {texts.map((entry, i) => {
            const isActive = activeCardIndex === i;
            return (
              <div
                key={entry.id}
                className={`min-w-[280px] p-4 rounded-xl border-2 transition-all ${
                  isPremium
                    ? "bg-white text-neutral-900 border-amber-300"
                    : isFreemium
                    ? "bg-neutral-800 text-neutral-100 border-cyan-500/40"
                    : "bg-neutral-900 text-neutral-200 border-neutral-700"
                } ${isActive ? "ring-2 ring-green-400" : ""}`}
              >
                <div className="flex justify-between mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    <PlayIcon
                      className="h-5 w-5 cursor-pointer text-green-400"
                      onClick={() => playFromStart(i)}
                    />
                    {playerState === "playing" && isActive ? (
                      <PauseIcon
                        className="h-5 w-5 cursor-pointer text-yellow-400"
                        onClick={() => pausePlayback(i)}
                      />
                    ) : (
                      <PlayIcon
                        className="h-5 w-5 cursor-pointer text-yellow-400"
                        onClick={() => resumePlayback(i)}
                      />
                    )}
                    <ArrowUturnLeftIcon
                      className={`h-5 w-5 cursor-pointer text-blue-400 ${
                        rewindFlash ? "opacity-100" : "opacity-70"
                      }`}
                      onClick={() => rewind(i)}
                    />
                    <StopIcon
                      className="h-5 w-5 cursor-pointer text-red-400"
                      onClick={stopPlayback}
                    />
                    <TrashIcon
                      className="h-5 w-5 cursor-pointer text-red-400 hover:text-red-600"
                      onClick={() => moveToHistory(entry.id)}
                    />
                  </div>
                </div>
                <div
                  className={`overflow-y-auto whitespace-pre-wrap transition-all ${
                    accessibilityMode
                      ? "text-base leading-relaxed max-h-60"
                      : "text-xs max-h-40"
                  }`}
                >
                  {entry.text}
                </div>
              </div>
            );
          })}
        </section>

        {/* HISTÓRICO COMPACTO */}
        {history.length > 0 && (
          <section className="mt-8 bg-neutral-950/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-300">🗃️ Histórico ({history.length})</h2>
              <button
                onClick={() => window.confirm("Limpar TODO o histórico?") && setHistory([])}
                className="text-xs text-red-400 hover:text-red-500"
              >
                Limpar tudo
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between bg-neutral-900 p-3 rounded-xl hover:bg-neutral-800 transition-all group text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-neutral-500">
                      {new Date(entry.timestamp).toLocaleString("pt-BR")}
                    </div>
                    <div className="text-neutral-300 truncate">
                      {entry.text.substring(0, 65)}...
                    </div>
                  </div>
                  <div className="flex gap-3 opacity-70 group-hover:opacity-100">
                    <button
                      onClick={() => restoreFromHistory(entry.id)}
                      className="text-green-400"
                    >
                      ↩️
                    </button>
                    <button
                      onClick={() => permanentDelete(entry.id)}
                      className="text-red-400"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!user && (
          <button
            onClick={loginWithGoogle}
            className="bg-neutral-700 hover:bg-neutral-600 px-5 py-3 rounded-xl text-sm w-full max-w-xs mx-auto block"
          >
            Entrar com Google
          </button>
        )}
      </div>

      <footer className="text-center text-xs mt-6 space-y-2">
        <span
          className={
            isPremium
              ? "text-amber-600 font-semibold"
              : isFreemium
              ? "text-cyan-400"
              : "text-neutral-400"
          }
        >
          Plano: {safePlan}
        </span>
        <div>Uso hoje: {usage.daily}</div>
        <div className="w-full bg-neutral-800 rounded-full h-2 mt-1">
          <div
            className="bg-green-500 h-2 rounded-full"
            style={{ width: `${monthlyPercent}%` }}
          />
        </div>
        <div>
          {usage.monthly} / {limits.monthly} este mês
        </div>
      </footer>

      {showPaywall && (
        <Paywall
          onClose={() => setShowPaywall(false)}
          onSelectPlan={async (selectedPlan) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            await fetch("/.netlify/functions/upgrade", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ plan: selectedPlan }),
            });
            setShowPaywall(false);
          }}
        />
      )}
    </div>
  );
}
