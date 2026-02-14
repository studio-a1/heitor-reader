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

/* ================= CONFIG ================= */

const DAY_MS = 24 * 60 * 60 * 1000;

// ⚠️ plano inicial ANÔNIMO
const DEFAULT_PLAN = "free";


const limits = {
  free: { pages: 30 },
  freemium: { pages: 300 },
  premium: { pages: 1500 },
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
  
  const [plan, setPlan] = useState(() => {
  return localStorage.getItem("plan") || DEFAULT_PLAN;
});
const safePlan = plan && limits[plan] ? plan : "free";
const [authChecked, setAuthChecked] = useState(true);
  const isPremium = plan === "premium";
  const isFreemium = plan === "freemium";

  /* ================= AUTH / PLAN ================= */

  const [isLogged, setIsLogged] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

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

  /* ================= USAGE ================= */

  const [usage, setUsage] = useState(() => {
    const saved = localStorage.getItem("usage");
    if (!saved) {
      return { pages: 0, pdfs: 0, resetAt: getNextMonthlyReset() };
    }

    const parsed = JSON.parse(saved);
    if (Date.now() > parsed.resetAt) {
  return { pages: 0, pdfs: 0, resetAt: getNextMonthlyReset() };
}

    return parsed;
  });

  useEffect(() => {
    localStorage.setItem("usage", JSON.stringify(usage));
  }, [usage]);

  function incrementUsage(type) {
    setUsage((u) => ({ ...u, [type]: u[type] + 1 }));
  }

  /* ================= BACKEND SYNC ================= */

  // 🔑 quando loga, backend vira fonte da verdade
 useEffect(() => {
  if (!isLogged) {
    setPlan("free");
    return;
  }

  setAuthChecked(false);

  fetch("/.netlify/functions/me")
    .then((r) => r.json())
    .then((data) => {
      setPlan(data.plan);
      setUsage(data.usage);
    })
    .catch(() => {
      setPlan("freemium");
    })
    .finally(() => {
      setAuthChecked(true);
    });
}, [isLogged]);
  /* ================= PERMISSION ENGINE ================= */

  function canImport(type) {
  const currentPlan = limits[plan] ? plan : "free";

  const limit = limits[currentPlan][type];
  const used = usage[type] ?? 0;

  if (limit === Infinity) return true;
  if (limit === undefined) return true;

  return used < limit;
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
  // 🎧 acessibilidade 60+ (audível de verdade)
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

  /* ================= IMPORTS (GUARDED) ================= */

  async function handleImageUpload(e) {
    if (!canImport("pages")) {
      setStatusMessage("Limite do plano atingido");
      setShowPaywall(true);
      e.target.value = "";
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.text?.length > 20) {
        setTexts((p) => [...p, sanitizeText(data.text)]);
        incrementUsage("pages");
      }
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }


async function handlePdfUpload(e) {
  abortProcessingRef.current = false;

  try {
    if (!e?.target?.files?.[0]) return;

    const file = e.target.files[0];

    setLoading(true);
    setStatusMessage("Preparando PDF...");

    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
    }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {

      if (abortProcessingRef.current) {
        setStatusMessage("Processamento cancelado.");
        break;
      }

      if (!canImport("pages")) {
        setStatusMessage("Limite mensal atingido.");
        setShowPaywall(true);
        break;
      }

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
      formData.append("image", blob, `page-${i}.png`);

      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Erro no OCR");

      const data = await res.json();
      
      console.log("---- TEXTO BRUTO PÁGINA ----");
console.log(data.text);

      if (!data.text) continue;

      // 🔹 Aprende padrões nas 5 primeiras páginas
      if (i <= 5) {
        learnRepeatedPatterns(data.text);
        if (i === 5) {
          finalizeLearnedPatterns(5);
        }
      }

      // 🔹 Remove cabeçalho / rodapé
      let cleanText = removeLearnedPatterns(data.text);
      cleanText = sanitizeText(cleanText);

      // 🔹 Ignora páginas vazias ou lixo
      if (!cleanText || cleanText.trim().length < 30) {
        console.log(`Página ${i} ignorada por estar vazia ou insuficiente.`);
        continue;
      }

      setTexts(prev => [...prev, cleanText]);
      incrementUsage("pages");
    }

  } catch (err) {
    console.error("PDF ERROR:", err);
    setStatusMessage("Erro ao processar PDF.");
  } finally {
    setLoading(false);
    if (e?.target) e.target.value = "";
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

        {!isLogged && (
          <div className="flex justify-center">
            <button
              onClick={() => setIsLogged(true)}
              className="flex items-center gap-3 bg-neutral-700 hover:bg-neutral-600 px-5 py-3 rounded-xl text-sm"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 text-cyan-400" />
              Entrar com Google
            </button>
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
 Uso no mês: {usage.pages}/{limits[plan]?.pages ?? 0} páginas
  
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

