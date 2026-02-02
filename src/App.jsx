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
} from "@heroicons/react/24/solid";

/* PDF.JS — VITE SAFE */
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DAY_MS = 24 * 60 * 60 * 1000;
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  /* ================= PLAN ================= */
  const plan = "free";

  const limits = {
    free: { pages: 10, pdfs: 10, download: false },
    freemium: { pages: 10, pdfs: 5, download: true },
    premium: { pages: Infinity, pdfs: Infinity, download: true },
  };

  /* ================= STATE ================= */
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [playerState, setPlayerState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Escolha como deseja importar o conteúdo."
  );
  const [loading, setLoading] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);

  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const readBlocksRef = useRef(0);

  /* ================= SAFE RESET ================= */
  function safeResetReader() {
    setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      utteranceRef.current = null;
      blocksRef.current = [];
      blockIndexRef.current = 0;
      readBlocksRef.current = 0;
      setPlayerState("idle");
    }, 0);
  }

  /* ================= USAGE ================= */
  const [usage, setUsage] = useState(() => {
    const saved = localStorage.getItem("usage");
    if (!saved) {
      return { pages: 0, pdfs: 0, resetAt: Date.now() + DAY_MS };
    }
    const parsed = JSON.parse(saved);
    if (Date.now() > parsed.resetAt) {
      return { pages: 0, pdfs: 0, resetAt: Date.now() + DAY_MS };
    }
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

  function requireLogin(label) {
    setStatusMessage(`${label} disponível apenas após login.`);
  }

  /* ================= TEXT CLEAN ================= */
  function cleanPdfText(text) {
    return text
      .replace(/-\s*\n\s*/g, "")
      .replace(/\n{2,}/g, "\n")
      .replace(/([^\.\!\?\:])\n+/g, "$1 ")
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/([.!?])([A-ZÁ-Ú])/g, "$1 $2")
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function splitIntoBlocks(text, maxLength = 600) {
    const sentences = text
      .replace(/\s+/g, " ")
      .replace(/([.!?])([A-ZÁ-Ú])/g, "$1 $2")
      .split(/(?<=[.!?])\s+(?=[A-ZÁ-Ú])/)
      .filter((s) => s.length > 12);

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

    if (!canUse("pages")) {
      setStatusMessage("Limite diário de imagens atingido.");
      return;
    }

    setLoading(true);
    setStatusMessage("Processando imagem…");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.text && data.text.trim().length > 20) {
        setTexts((prev) => [...prev, data.text]);
        setActiveIndex(texts.length);
        incrementUsage("pages");
        setStatusMessage("Imagem pronta para leitura.");
      } else {
        setStatusMessage("Nenhum texto detectado.");
      }
    } catch {
      setStatusMessage("Erro ao processar imagem.");
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

    if (!canUse("pdfs")) {
      setStatusMessage("Limite diário de PDFs atingido.");
      e.target.value = "";
      return;
    }

    setLoading(true);
    setStatusMessage("Lendo PDF…");

    let loadingTask;

    try {
      const buffer = await file.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((i) => i.str).join(" ") + "\n\n";
      }

      const cleaned = cleanPdfText(fullText);

      if (cleaned.length < 30) {
        setStatusMessage("PDF sem texto legível.");
        return;
      }

      setTexts((prev) => [...prev, cleaned]);
      setActiveIndex(texts.length);
      incrementUsage("pdfs");
      setStatusMessage("PDF carregado.");
    } catch {
      setStatusMessage("Erro ao ler PDF.");
    } finally {
      try {
        loadingTask?.destroy();
      } catch {}
      setLoading(false);
      e.target.value = "";
    }
  }

  /* ================= PLAYER ================= */
  function speakBlock(i) {
    const block = blocksRef.current[i];
    if (!block) return;

    const u = new SpeechSynthesisUtterance(block);
    utteranceRef.current = u;

    u.onstart = () => {
      setPlayerState("playing");
      setStatusMessage("Lendo…");
    };

    u.onend = () => {
      readBlocksRef.current++;
      blockIndexRef.current++;

      if (plan === "free" && readBlocksRef.current >= 25) {
        stop();
        setStatusMessage("Limite de leitura atingido.");
        return;
      }

      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(blockIndexRef.current);
      } else {
        stop();
        setStatusMessage("Leitura finalizada.");
      }
    };

    speechSynthesis.speak(u);
  }

  function play(index) {
    stop();
    setActiveIndex(index);
    readBlocksRef.current = 0;

    const text = texts[index];
    if (!text) return;

    blocksRef.current = splitIntoBlocks(text, isMobile ? 450 : 600);
    blockIndexRef.current = 0;

    speakBlock(0);
  }

  function pauseOrResume() {
    if (!utteranceRef.current) return;

    if (playerState === "playing") {
      speechSynthesis.pause();
      setPlayerState("paused");
      setStatusMessage("Pausado.");
    } else {
      speechSynthesis.resume();
      setPlayerState("playing");
      setStatusMessage("Retomando…");
    }
  }

  function rewind() {
    if (!isMobile) return;
    setRewindFlash(true);
    setTimeout(() => setRewindFlash(false), 300);
    blockIndexRef.current = Math.max(0, blockIndexRef.current - 1);
    speakBlock(blockIndexRef.current);
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
  }

  function downloadText(text, index) {
    if (!limits[plan].download || !isLogged) {
      requireLogin("Download");
      return;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagina-${index + 1}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-neutral-800 rounded-2xl p-6 flex flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">Leitura assistida</p>
        </header>

        <div className="text-center text-sm text-cyan-400 min-h-[20px]">
          {loading ? "Processando…" : statusMessage}
        </div>

        <section className="flex justify-center gap-4 flex-wrap">
          <label className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <CameraIcon className="h-8 w-8" />
            <span>Scanner</span>
            <input
              key={Date.now()}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
          </label>

          <label className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <PhotoIcon className="h-8 w-8" />
            <span>Imagem</span>
            <input
              key={Date.now() + 1}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
          </label>

          <label className="w-36 h-28 bg-red-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <DocumentTextIcon className="h-8 w-8" />
            <span>PDF</span>
            <input
              key={Date.now() + 2}
              type="file"
              accept="application/pdf"
              hidden
              onChange={handlePdfUpload}
            />
          </label>
        </section>

        {texts.length > 0 && (
          <section className="flex gap-4 overflow-x-auto pb-2">
            {texts.map((text, i) => (
              <div
                key={i}
                className={`min-w-[320px] bg-neutral-900 rounded-xl p-4 border-2 ${
                  activeIndex === i ? "border-green-500" : "border-neutral-700"
                }`}
              >
                <div className="flex justify-between items-center mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    <PlayIcon className="h-5 w-5 cursor-pointer" onClick={() => play(i)} />
                    <PauseIcon className="h-5 w-5 cursor-pointer" onClick={pauseOrResume} />
                    {isMobile && (
                      <ArrowUturnLeftIcon
                        className={`h-5 w-5 cursor-pointer ${
                          rewindFlash ? "text-blue-400" : ""
                        }`}
                        onClick={rewind}
                      />
                    )}
                    <StopIcon
                      className="h-5 w-5 cursor-pointer text-red-400"
                      onClick={stop}
                    />
                    <ArrowDownTrayIcon
                      className="h-5 w-5 cursor-pointer opacity-70"
                      onClick={() => downloadText(text, i)}
                    />
                  </div>
                </div>

                <div className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            ))}
          </section>
        )}

        {!isLogged && (
          <button
            onClick={() => setIsLogged(true)}
            className="mt-2 flex items-center justify-center gap-2 text-sm bg-neutral-700 p-3 rounded-xl"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Entrar
          </button>
        )}

        <footer className="text-center text-xs text-neutral-400">
          Uso hoje: {usage.pages}/{limits[plan].pages} imagens •{" "}
          {usage.pdfs}/{limits[plan].pdfs} PDFs — Plano {plan.toUpperCase()}
        </footer>
      </div>
    </div>
  );
}
