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

import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/* ================= CONFIG ================= */
const DAY_MS = 24 * 60 * 60 * 1000;
const plan = "free";

const limits = {
  free: { pages: 23, pdfs: 21 },
  freemium: { pages: 10, pdfs: 5 },
  premium: { pages: Infinity, pdfs: Infinity },
};

const isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  /* ================= STATE ================= */
  const [texts, setTexts] = useState([]);
  const [activeCardId, setActiveCardId] = useState(null);
  const [playerState, setPlayerState] = useState("idle"); // idle | playing | paused
  const [statusMessage, setStatusMessage] = useState(
    "Escolha como deseja importar o conteúdo."
  );
  const [loading, setLoading] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [rewindFlash, setRewindFlash] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

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

  /* ================= REFS ================= */
  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);
  const warmedUpRef = useRef(false);

  /* ================= SANITIZE ================= */
  function sanitizeText(text) {
    return text
      .replace(/NARRAÇÃO[^.]*\./gi, "")
      .replace(/Segue a transcrição[^.]*\./gi, "")
      .replace(/Página\s+\d+/gi, "")
      .replace(/IA[^.]*\./gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function splitIntoBlocks(text, maxLength = 600) {
    const sentences = text.split(/(?<=[.!?])\s+/);
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

  /* ================= VOICE ================= */
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

  /* ================= PLAYER ================= */
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
    speechSynthesis.resume();
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

  /* ================= IMAGE ================= */
  async function handleImageUpload(e) {
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

  /* ================= PDF ================= */
  async function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

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

        {/* IMPORT */}
        <section className="flex justify-center gap-4 flex-wrap">
          <label className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <CameraIcon className="h-8 w-8" />
            <span>Scanner</span>
            <input hidden type="file" accept="image/*" onChange={handleImageUpload} />
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
                className={`min-w-[300px] bg-neutral-900 p-4 rounded-xl border-2 ${
                  isActive ? "border-green-500" : "border-neutral-700"
                }`}
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

                <div className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
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

      <footer className="text-center text-xs text-neutral-400 mt-4">
        Plano: <span className="text-neutral-200">{plan}</span> • Uso hoje:{" "}
        {usage.pages}/{limits[plan].pages} imagens • {usage.pdfs}/
        {limits[plan].pdfs} PDFs
      </footer>
    </div>
  );
}
