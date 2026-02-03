import { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowDownTrayIcon,
  PhotoIcon,
  CameraIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

/* PDF.JS — VITE SAFE */
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DAY_MS = 24 * 60 * 60 * 1000;
const isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  /* ================= PLAN ================= */
  const plan = "free";

  const limits = {
    free: { pages: 23, pdfs: 21, download: false },
    freemium: { pages: 10, pdfs: 5, download: true },
    premium: { pages: Infinity, pdfs: Infinity, download: true },
  };

  /* ================= STATE ================= */
  const [texts, setTexts] = useState([]);
  const [activeCardId, setActiveCardId] = useState(null);
  const [playerState, setPlayerState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Escolha como deseja importar o conteúdo."
  );
  const [loading, setLoading] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);

  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const warmedUpRef = useRef(false);

  /* ================= SAFE RESET ================= */
  function safeResetReader() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blocksRef.current = [];
    blockIndexRef.current = 0;
    setPlayerState("idle");
    setActiveCardId(null);
  }

  /* ================= USAGE ================= */
  const [usage, setUsage] = useState(() => {
    const saved = localStorage.getItem("usage");
    if (!saved)
      return { pages: 0, pdfs: 0, resetAt: Date.now() + DAY_MS };
    const parsed = JSON.parse(saved);
    if (Date.now() > parsed.resetAt)
      return { pages: 0, pdfs: 0, resetAt: Date.now() + DAY_MS };
    return parsed;
  });

  useEffect(() => {
    localStorage.setItem("usage", JSON.stringify(usage));
  }, [usage]);

  function incrementUsage(type) {
    setUsage((u) => ({ ...u, [type]: u[type] + 1 }));
  }

  function canUse(type) {
    return usage[type] < limits[plan][type];
  }

  /* ================= TEXT SANITIZATION ================= */
  function sanitizeText(text) {
    return text
      .replace(/NARRAÇÃO[^.]*\./gi, "")
      .replace(/Segue a transcrição[^.]*\./gi, "")
      .replace(/Página\s+\d+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function splitIntoBlocks(text, maxLength = 600) {
    const sentences = text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+(?=[A-ZÁ-Ú])/);

    const blocks = [];
    let current = "";

    for (const s of sentences) {
      if ((current + s).length <= maxLength) {
        current += s + " ";
      } else {
        blocks.push(current.trim());
        current = s + " ";
      }
    }
    if (current.trim()) blocks.push(current.trim());
    return blocks;
  }

  /* ================= OCR IMAGE ================= */
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    safeResetReader();
    if (!canUse("pages")) return;

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

  /* ================= PDF ================= */
  async function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    safeResetReader();
    if (!canUse("pdfs")) return;

    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib
        .getDocument({ data: new Uint8Array(buffer) })
        .promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((i) => i.str).join(" ") + "\n";
      }

      setTexts((p) => [...p, sanitizeText(fullText)]);
      incrementUsage("pdfs");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  /* ================= PLAYER ================= */
  function warmUpVoice() {
    if (warmedUpRef.current) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    warmedUpRef.current = true;
  }

  function speakBlock(cardIndex) {
    const block = blocksRef.current[blockIndexRef.current];
    if (!block) return;

    const u = new SpeechSynthesisUtterance(block);
    utteranceRef.current = u;

    u.onstart = () => setPlayerState("playing");

    u.onend = () => {
      blockIndexRef.current++;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(cardIndex);
      } else if (continuous && cardIndex < texts.length - 1) {
        play(cardIndex + 1);
      } else {
        stop();
      }
    };

    speechSynthesis.speak(u);
  }

  function play(index) {
    speechSynthesis.cancel();
    warmUpVoice();

    setActiveCardId(index);
    blockIndexRef.current = 0;

    blocksRef.current = splitIntoBlocks(
      sanitizeText(texts[index]),
      isMobile ? 420 : 600
    );

    speakBlock(index);
  }

  function pauseOrResume(index) {
    if (activeCardId !== index) return;
    if (playerState === "playing") {
      speechSynthesis.pause();
      setPlayerState("paused");
    } else {
      speechSynthesis.resume();
      setPlayerState("playing");
    }
  }

  function rewind(index) {
    if (activeCardId !== index || blockIndexRef.current === 0) return;

    setRewindFlash(true);
    setTimeout(() => setRewindFlash(false), 200);

    speechSynthesis.cancel();
    blockIndexRef.current--;
    speakBlock(index);
  }

  function stop() {
    speechSynthesis.cancel();
    setPlayerState("idle");
    setActiveCardId(null);
    blockIndexRef.current = 0;
  }

   /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 p-4">
      <div className="max-w-6xl mx-auto bg-neutral-800 rounded-2xl p-6 space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">Leitura assistida</p>
        </header>

        <div className="text-center text-cyan-400 text-sm min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
        </div>

       {/* ===== IMPORTAÇÃO DE CONTEÚDO ===== */}
<section className="flex justify-center gap-4 flex-wrap">
  {/* SCANNER */}
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

  {/* IMAGEM */}
  <label className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
    <PhotoIcon className="h-8 w-8" />
    <span>Imagem</span>
    <input
      hidden
      type="file"
      accept="image/*"
      onChange={handleImageUpload}
    />
  </label>

  {/* PDF */}
  <label className="w-36 h-28 bg-red-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
    <DocumentTextIcon className="h-8 w-8" />
    <span>PDF</span>
    <input
      hidden
      type="file"
      accept="application/pdf"
      onChange={handlePdfUpload}
    />
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
        

        <section className="flex gap-4 overflow-x-auto">
          {texts.map((text, i) => {
            const isActive = activeCardId === i;
            const isPlaying = isActive && playerState === "playing";

            return (
              <div
                key={i}
                className={`min-w-[320px] bg-neutral-900 p-4 rounded-xl border-2 ${
                  isActive ? "border-green-500" : "border-neutral-700"
                }`}
              >
                <div className="flex justify-between mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    {isPlaying ? (
                      <PauseIcon
                        className="h-5 w-5 cursor-pointer text-yellow-400"
                        onClick={() => pauseOrResume(i)}
                      />
                    ) : (
                      <PlayIcon
                        className="h-5 w-5 cursor-pointer text-green-400"
                        onClick={() => play(i)}
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
                      onClick={stop}
                    />

                    <ArrowDownTrayIcon className="h-5 w-5 opacity-60" />
                  </div>
                </div>

                <div className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            );
          })}
        </section>

        {/* ===== LOGIN ===== */}
{!isLogged && (
  <div className="flex justify-center mt-4">
    <button
      onClick={() => setIsLogged(true)} // placeholder do Google Auth
      className="flex items-center gap-3 bg-neutral-700 hover:bg-neutral-600 px-5 py-3 rounded-xl text-sm transition"
    >
      <ArrowRightOnRectangleIcon className="h-5 w-5 text-cyan-400" />
      Entrar com Google
    </button>
  </div>
)}

        <footer className="text-center text-xs text-neutral-400">
          Uso hoje: {usage.pages}/{limits[plan].pages} imagens •{" "}
          {usage.pdfs}/{limits[plan].pdfs} PDFs
        </footer>
      </div>
    </div>
  );
}

