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
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

import Paywall from "./components/Paywall";

import { createClient } from "@supabase/supabase-js";

/* ================= CONFIG ================= */

const DAY_MS = 24 * 60 * 60 * 1000;

// ⚠️ plano inicial ANÔNIMO
const DEFAULT_PLAN = "free";

const limits = {
  free: {
    daily: 2,
    monthly: 60,
  },
  freemium: {
    daily: 20,
    monthly: 300,
  },
  premium: {
    daily: Infinity,
    monthly: 1500,
  },
};

const isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad/i.test(navigator.userAgent);
  

/* ================= APP ================= */

function getNextMonthlyReset() {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
  return next.getTime();
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
  
  
}
export default function App() {

  // ================= AUTH STATES =================
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [usage, setUsage] = useState({ daily: 0, monthly: 0 });
  const [authChecked, setAuthChecked] = useState(false);

  // ================= UI STATES =================
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // ================= DERIVED STATES =================
  const safePlan = limits[plan] ? plan : "free";
  const isPremium = safePlan === "premium";
  const isFreemium = safePlan === "freemium";

  // ================= LOGIN =================
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  // ================= AUTH EFFECT =================
  useEffect(() => {

    const loadUserData = async (session) => {
      try {

        // cria usuário se não existir
        await fetch("/.netlify/functions/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: session.user.id,
            email: session.user.email,
          }),
        });

        // busca dados reais
        const res = await fetch("/.netlify/functions/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.status === 401) {
          setUser(null);
          setPlan("free");
          setUsage({ daily: 0, monthly: 0 });
          setAuthChecked(true);
          return;
        }

        if (!res.ok) throw new Error("Erro ao buscar /me");

        const userData = await res.json();

        setUser(session.user);
        setPlan(userData.plan || "free");
        setUsage({
          daily: Number(userData.usage?.daily) || 0,
          monthly: Number(userData.usage?.monthly) || 0,
        });

      } catch (err) {
        console.error("AUTH ERROR:", err);
        setUser(null);
        setPlan("free");
        setUsage({ daily: 0, monthly: 0 });
      } finally {
        setAuthChecked(true);
      }
    };

    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        await loadUserData(data.session);
      } else {
        setUser(null);
        setPlan("free");
        setUsage({ daily: 0, monthly: 0 });
        setAuthChecked(true);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        if (session) {
          await loadUserData(session);
        } else {
          setUser(null);
          setPlan("free");
          setUsage({ daily: 0, monthly: 0 });
          setAuthChecked(true);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };

  }, []);
 

useEffect(() => {
  if (!user) return;

  async function ensureUsageRow() {
    const { data, error } = await supabase
  .from("usage")
  .select("id")
  .eq("user_id", user.id)
  .maybeSingle();

if (error) {
  console.error("Erro ao verificar usage:", error);
  return;
}

if (!data) {
  await supabase.from("usage").insert({
    user_id: user.id,
    pages: 0,
  });
}
  }

  ensureUsageRow();
}, [user]);
   

  /* ================= CONTENT ================= */

  const [texts, setTexts] = useState([]);
  const [activeCardId, setActiveCardId] = useState(null);

  /* ================= PLAYER ================= */

  const [playerState, setPlayerState] = useState("idle"); // idle | playing | paused
  const [continuous, setContinuous] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);

  /* ================= UI ================= */

  const [statusMessage, setStatusMessage] = useState(
    "Escolha como deseja importar o conteúdo."
  );
  const [loading, setLoading] = useState(false);
  /* ================= ACCESSIBILITY ================= */

const [accessibilityMode, setAccessibilityMode] = useState(false);
const canUseAccessibility =
  plan === "freemium" || plan === "premium";


  /* ================= PERMISSION ENGINE ================= */

 
  // 🔒 
  
  function canImport() {
  if (!authChecked) return false;

  if (!user) {
    setShowPaywall(false);
    setStatusMessage("Faça login para escanear documentos.");
    setShowLoginModal(true);
    return false;
  }

  if (!plan) return false; // ⬅️ ESSENCIAL

  const planLimits = limits[plan];
  const dailyUsed = usage?.daily ?? 0;
  const monthlyUsed = usage?.monthly ?? 0;

  if (plan === "premium") return true;

  if (planLimits.daily !== null && dailyUsed >= planLimits.daily) {
    setStatusMessage("Limite diário atingido. Faça upgrade para continuar.");
    setShowPaywall(true);
    return false;
  }

  if (planLimits.monthly !== null && monthlyUsed >= planLimits.monthly) {
    setStatusMessage("Limite mensal atingido.");
    setShowPaywall(true);
    return false;
  }

  return true;
}
  /* ================= REFS ================= */

  const utteranceRef = useRef(null);
const blocksRef = useRef([]);
const blockIndexRef = useRef(0);
const warmedUpRef = useRef(false);
const charIndexRef = useRef(0);
const abortProcessingRef = useRef(false);

const headerCandidatesRef = useRef({});
const footerCandidatesRef = useRef({});
const learnedHeadersRef = useRef([]);
const learnedFootersRef = useRef([]);

  /* ================= TEXT ================= */
  
  function learnRepeatedPatterns(text) {
  if (!text) return;

  const normalized = text.replace(/\s+/g, " ").trim();

  const startSlice = normalized.slice(0, 120);
  const endSlice = normalized.slice(-120);

  headerCandidatesRef.current[startSlice] =
    (headerCandidatesRef.current[startSlice] || 0) + 1;

  footerCandidatesRef.current[endSlice] =
    (footerCandidatesRef.current[endSlice] || 0) + 1;
}

function finalizeLearnedPatterns(totalPages) {
  const threshold = Math.ceil(totalPages * 0.6);

  learnedHeadersRef.current = Object.entries(headerCandidatesRef.current)
    .filter(([_, count]) => count >= threshold)
    .map(([text]) => text);

  learnedFootersRef.current = Object.entries(footerCandidatesRef.current)
    .filter(([_, count]) => count >= threshold)
    .map(([text]) => text);
}

function removeLearnedPatterns(text) {
  if (!text) return text;

  const normalized = text.replace(/\s+/g, " ").trim();

  if (/^\d+$/.test(normalized)) return "";

  let cleaned = text;

  learnedHeadersRef.current.forEach(pattern => {
    if (pattern.length > 10) {
      cleaned = cleaned.replace(pattern, "");
    }
  });

  learnedFootersRef.current.forEach(pattern => {
    if (pattern.length > 10) {
      cleaned = cleaned.replace(pattern, "");
    }
  });

  return cleaned.trim();
}

 function sanitizeText(text) {
  return text
    // remove caracteres realmente problemáticos
    .replace(/[\[\]\(\)\{\}\*<>]/g, "")

    // remove APENAS linhas explícitas, não blocos
    .replace(/^NARRAÇÃO.*$/gim, "")
    .replace(/^Segue a transcrição.*$/gim, "")
    .replace(/^IA.*$/gim, "")
    .replace(/^[A-ZÁÀÂÃÉÈÍÓÔÕÚÇ\s]{5,}$/gm, "")
    .replace(/^\s*.+\s+\|\s+Página\s+\d+\s*$/gim, "")

    // remove marcador de página isolado
    .replace(/^\s*Página\s+\d+\s*$/gim, "")

    // normaliza espaços SEM destruir layout
    .replace(/[ \t]{2,}/g, " ")

    .trim();
}
useEffect(() => {
  if (texts.length < 3) return; // precisa de volume mínimo

  const firstLines = texts.map((t) => {
    const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
    return lines[0] || "";
  });

  const frequency = {};
  firstLines.forEach((line) => {
    if (!line) return;
    frequency[line] = (frequency[line] || 0) + 1;
  });

  const threshold = Math.ceil(texts.length * 0.6);

  const repeatedHeaders = Object.entries(frequency)
    .filter(([_, count]) => count >= threshold)
    .map(([line]) => line);

  if (repeatedHeaders.length === 0) return;

  setTexts((prev) =>
    prev.map((text) => {
      let cleaned = text;
      repeatedHeaders.forEach((header) => {
        const regex = new RegExp("^" + header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "m");
        cleaned = cleaned.replace(regex, "").trim();
      });
      return cleaned;
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

  /* ================= VOICE ================= */

  function warmUpVoice() {
    if (warmedUpRef.current) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    warmedUpRef.current = true;
  }
  function getVoiceSettings() {
  if (plan === "premium") {
    return {
      rate: isMobile ? 0.9 : 0.85,
      pitch: 0.95,
      volume: 1,
    };
  }

  return {
    rate: 1,
    pitch: 1,
    volume: 1,
  };
}


  function speakBlock(cardIndex) {
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;
    const u = new SpeechSynthesisUtterance(block);
    const voiceSettings = getVoiceSettings();
u.rate = voiceSettings.rate;
u.pitch = voiceSettings.pitch;
u.volume = voiceSettings.volume;
    
    utteranceRef.current = u;
  // 🎧 acessibilidade 60+ (audível de verdade) //
u.rate = accessibilityMode ? 0.7 : 1;
u.pitch = accessibilityMode ? 0.9 : 1;

    u.onboundary = (e) => {
      if (e.name === "word") {
        charIndexRef.current = e.charIndex;
      }
    };

    u.onstart = () => {
      setPlayerState("playing");
      setStatusMessage(`Lendo página ${cardIndex + 1}`);
    };

    u.onend = () => {
      blockIndexRef.current += 1;

      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(cardIndex);
      } else if (continuous && cardIndex < texts.length - 1) {
        playFromStart(cardIndex + 1);
      } else {
        stopPlayback();
        setStatusMessage("Leitura concluída");
      }
    };

    speechSynthesis.speak(u);
  }

  /* ================= PLAYER CONTROLS ================= */

  function playFromStart(index) {
    warmUpVoice();
    speechSynthesis.cancel();

    setActiveCardId(index);

    const clean = sanitizeText(texts[index]);
    blocksRef.current = splitIntoBlocks(clean, isMobile ? 450 : 600);
    blockIndexRef.current = 0;

    speakBlock(index);
  }

  function pausePlayback(index) {
    if (activeCardId !== index) return;
    speechSynthesis.pause();
    setPlayerState("paused");
    setStatusMessage("Leitura pausada");
  }

  function resumePlayback(index) {
    if (activeCardId !== index) return;

    if (!isMobile) {
      speechSynthesis.resume();
      setPlayerState("playing");
      setStatusMessage("Retomando leitura…");
      return;
    }

    speechSynthesis.cancel();

    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;

    const u = new SpeechSynthesisUtterance(block);
    utteranceRef.current = u;

    u.onend = () => {
      blockIndexRef.current += 1;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(index);
      } else {
        stopPlayback();
      }
    };

    speechSynthesis.speak(u);
    setPlayerState("playing");
    setStatusMessage("Retomando leitura…");
  }

  function rewind(index) {
    if (activeCardId !== index || blockIndexRef.current === 0) return;

    setRewindFlash(true);
    setTimeout(() => setRewindFlash(false), 200);

    speechSynthesis.cancel();
    blockIndexRef.current -= 1;
    speakBlock(index);
  }

  function stopPlayback() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
    setActiveCardId(null);
  }
//---------------------------------------------------------//
    async function getFreshUsage() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const res = await fetch("/.netlify/functions/me", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) return null;

  return await res.json();
}

 // ================= REFRESH USER DATA =================
async function refreshUserData() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const res = await fetch("/.netlify/functions/me", {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (!res.ok) return null;

  const userData = await res.json();

  const updatedUsage = {
    plan: userData.plan || "free",
    daily: Number(userData.usage?.daily) || 0,
    monthly: Number(userData.usage?.monthly) || 0,
    limits: userData.limits || {
      daily: userData.plan === "free" ? 2 : 9999,
      monthly: userData.plan === "free" ? 60 : 9999,
    },
  };

  setPlan(updatedUsage.plan);
  setUsage({
    daily: updatedUsage.daily,
    monthly: updatedUsage.monthly,
  });

  return updatedUsage;
}
//🔐 FUNÇÃO GLOBAL DE VALIDAÇÃO (NOVA) e teste//
async function validateBeforeScan() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    setStatusMessage("Faça login para escanear documentos.");
    setShowPaywall(true);
    return false;
  }

  // 🔥 SEM BLOQUEIO LOCAL
  // Sempre deixa backend decidir
  return true;
}

//================= IMAGE OCR =================//
async function handleImageUpload(e) {

  const file = e.target?.files?.[0];
  if (!file) return;

  // 🔒 BLOQUEIO ANTES DE TUDO
  if (!user) {
    setShowPaywall(false);
    setStatusMessage("Faça login para escanear documentos.");
    setShowLoginModal(true);
    e.target.value = "";
    return;
  }

  if (!canImport()) {
    e.target.value = "";
    return;
  }

  await handleScan(file);

  e.target.value = "";
}
//_______✅ SCANNER OCR (VERSÃO FINAL CORRIGIDA)____//

async function handleScan(file) {

  // 🔒 Bloqueia antes de qualquer coisa
  if (!canImport()) return;

  try {
    setLoading(true);
    setStatusMessage("Processando imagem...");

    const { data: { session } } = await supabase.auth.getSession();

    // 🔐 Segurança extra
    if (!session) {
      setShowLoginModal(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/.netlify/functions/ocr", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    // 🔒 Sessão inválida
   if (res.status === 401) {
  setShowPaywall(false);
  setShowLoginModal(true);
  return;
}

    const data = await res.json();

    // 🚫 Limites
    if (res.status === 403) {

      if (data.error === "daily_limit") {
        setStatusMessage("Limite diário atingido.");
      } else if (data.error === "monthly_limit") {
        setStatusMessage("Limite mensal atingido.");
      } else {
        setStatusMessage("Limite do plano atingido.");
      }

      setShowPaywall(true);
      return;
    }

    if (!res.ok) {
      throw new Error("Erro real no OCR");
    }

    if (!data.text) return;

    const cleanText = sanitizeText(data.text);

    if (cleanText && cleanText.length > 10) {
      setTexts(prev => [...prev, cleanText]);
    }

    // 🔄 Atualiza contador local
    setUsage({
      daily: data.usage?.daily ?? usage.daily,
      monthly: data.usage?.monthly ?? usage.monthly,
    });

    setStatusMessage("Escaneamento concluído!");

  } catch (err) {
    console.error("SCAN ERROR:", err);
    setStatusMessage("Erro ao escanear documento.");
  } finally {
    setLoading(false);
  }
}

//_________✅ PDF OCR (VERSÃO FINAL PROFISSIONAL)__//

async function handlePdfUpload(e) {

  abortProcessingRef.current = false;

  const file = e.target?.files?.[0];
  if (!file) return;

  // 🔒 Bloqueia antes
  if (!canImport()) {
    e.target.value = "";
    return;
  }

  try {

    setLoading(true);
    setStatusMessage("Preparando PDF...");

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setShowLoginModal(true);
      return;
    }

    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
    }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {

      if (abortProcessingRef.current) break;

      // 🔁 Verifica limite antes de cada página
      if (!canImport()) break;

      setStatusMessage(`Processando página ${i} de ${pdf.numPages}`);
      await sleep(0);

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) reject(new Error("Falha ao gerar imagem"));
          else resolve(b);
        }, "image/png");
      });

      const formData = new FormData();
      formData.append("file", blob, `page-${i}.png`);

      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      // 🔒 Sessão inválida
     if (res.status === 401) {
  setShowPaywall(false);
  setShowLoginModal(true);
  break;
}


      // 🚫 Limite atingido
      if (res.status === 403) {
        const errorData = await res.json();

        if (errorData.error === "daily_limit") {
          setStatusMessage("Limite diário atingido.");
        } else if (errorData.error === "monthly_limit") {
          setStatusMessage("Limite mensal atingido.");
        } else {
          setStatusMessage("Limite do plano atingido.");
        }

        setShowPaywall(true);
        break;
      }

      if (!res.ok) {
        throw new Error("Erro real no OCR");
      }

      const data = await res.json();

      if (!data.text) continue;

      const cleanText = sanitizeText(data.text);

      if (cleanText && cleanText.length > 30) {
        setTexts(prev => [...prev, cleanText]);
      }

      // 🔄 Atualiza contador local após cada página
      setUsage({
        daily: data.usage?.daily ?? usage.daily,
        monthly: data.usage?.monthly ?? usage.monthly,
      });
    }

    setStatusMessage("PDF processado com sucesso!");

  } catch (err) {
    console.error("PDF ERROR:", err);
    setStatusMessage("Erro ao processar PDF.");
  } finally {
    setLoading(false);
    e.target.value = "";
  }
}
  /* ================= UI ================= */
if (!authChecked) {
  return (
    <div className="min-h-screen flex items-center justify-center text-neutral-400">
      Verificando plano…
    </div>
  );
}
 return (
  <div
  className={`
    min-h-screen text-neutral-200 p-4 transition-colors duration-500
    ${isPremium ? "bg-neutral-800" : ""}
    ${isFreemium ? "bg-neutral-900/95" : ""}
    ${!isFreemium && !isPremium ? "bg-neutral-900" : ""}
  `}
>
     <div
  className={`max-w-6xl mx-auto rounded-2xl p-6 space-y-6 transition-all
    ${
      isPremium
        ? "bg-neutral-500 text-neutral-950 shadow-xl"
        : isFreemium
        ? "bg-neutral-800 text-neutral-100"
        : "bg-neutral-800 text-neutral-200"
    }
    ${accessibilityMode ? "text-lg leading-relaxed" : ""}
  `}
>

       <header className="text-center">
  <h1 className="text-2xl font-semibold">Heitor Reader</h1>
  <p className="text-sm opacity-70">Leitura assistida</p>
  
  {isPremium && (
  <div className="text-xs text-amber-600 font-semibold tracking-wide">
    👑 PREMIUM ATIVO
  </div>
)}

{isFreemium && (
  <div className="text-xs text-cyan-400 font-medium tracking-wide">
    ⭐ FREEMIUM
  </div>
)}

  {canUseAccessibility && (
    <button
      onClick={() => setAccessibilityMode((v) => !v)}
      className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition
        ${
          accessibilityMode
            ? "bg-amber-700 border-amber-400 text-white"
            : "bg-neutral-700 border-neutral-600 text-neutral-200"
        }`}
    >
      👵 Modo acessível 60+
    </button>
  )}
</header>


        <div className="text-center text-cyan-400 text-sm min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
          
      {loading && (
  <button
    onClick={() => {
      abortProcessingRef.current = true;
    }}
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
          {texts.map((text, i) => {
            const isActive = activeCardId === i;
            return (
             <div
  key={i}
  className={`
  min-w-[280px] p-4 rounded-xl border-2 transition-all
  ${
    isPremium
      ? "bg-white text-neutral-900 border-amber-300"
      : isFreemium
      ? "bg-neutral-800 text-neutral-100 border-cyan-500/40"
      : "bg-neutral-900 text-neutral-200 border-neutral-700"
  }
  ${isActive ? "ring-2 ring-green-400" : ""}
`}
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
                  </div>
                </div>

<div
  className={`
    overflow-y-auto whitespace-pre-wrap transition-all
    ${
      accessibilityMode
        ? "text-base leading-relaxed max-h-60"
        : "text-xs max-h-40"
    }
  `}
>
  {text}
</div>
              </div>
            );
          })}
        </section>

       {!user && (
  <button
    onClick={loginWithGoogle}
    className="bg-neutral-700 hover:bg-neutral-600 px-5 py-3 rounded-xl text-sm"
  >
    Entrar com Google
  </button>
)}
{user && (
  <div>
    Plano: {plan}
  </div>
)}
      </div>

      <footer className="text-center text-xs mt-4">
  <span
    className={
      isPremium
        ? "text-amber-700 font-semibold"
        : isFreemium
        ? "text-cyan-400"
        : "text-neutral-400"
    }
  >
    Plano: {plan}
  </span>
  {" • "}
  
 Uso no mês: {usage.monthly}/{limits[plan].monthly}
  
</footer>

     {showPaywall && (
  <Paywall
    onClose={() => setShowPaywall(false)}
    onSelectPlan={(selectedPlan) => {
      setPlan(selectedPlan);
      setShowPaywall(false);

      setStatusMessage(
        selectedPlan === "premium"
          ? "Plano Premium ativo"
          : "Plano Freemium ativo"
      );
    }}
  />
)}

    </div>
  );
}
