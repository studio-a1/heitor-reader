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

const DAY_MS = 24 * 60 * 60 * 1000;
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const plan = "free";

  const limits = {
    free: { pages: 3, pdfs: 0, download: false },
    freemium: { pages: 10, pdfs: 5, download: true },
    premium: { pages: Infinity, pdfs: Infinity, download: true },
  };

  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [playerState, setPlayerState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Escolha como deseja importar o conteúdo."
  );
  const [loading, setLoading] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  const utteranceRef = useRef(null);
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);

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
    setStatusMessage(`${label} disponível apenas após entrar com Google.`);
  }

  /* ================= OCR ================= */
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!canUse("pages")) {
      setStatusMessage("Limite diário do plano Free atingido.");
      return;
    }

    setLoading(true);
    setStatusMessage("Processando imagem…");

    try {
      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("image", file);
          return fd;
        })(),
      });

      const data = await res.json();

      if (data.text) {
        setTexts((prev) => [...prev, data.text]);
        setActiveIndex(texts.length);
        incrementUsage("pages");
        setStatusMessage("Texto pronto para escuta.");
      } else {
        setStatusMessage("Nenhum texto detectado.");
      }
    } catch {
      setStatusMessage("Erro ao processar imagem.");
    } finally {
      setLoading(false);
    }
  }

  /* ================= PLAYER ================= */
  function splitIntoBlocks(text) {
    return text.split(/(?<=[.!?])\s+/).filter(Boolean);
  }

  function cleanupPlayer() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
  }

  function speakBlock(i) {
    const block = blocksRef.current[i];
    if (!block) {
      cleanupPlayer();
      return;
    }

    const u = new SpeechSynthesisUtterance(block);
    utteranceRef.current = u;

    u.onstart = () => {
      setPlayerState("playing");
      setStatusMessage("Leitura em andamento…");
    };

    u.onend = () => {
      blockIndexRef.current++;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(blockIndexRef.current);
      } else {
        cleanupPlayer();
        setStatusMessage("Leitura finalizada.");
      }
    };

    speechSynthesis.speak(u);
  }

  function play(index) {
    if (!texts[index]) return;

    cleanupPlayer(); // reset seguro
    setActiveIndex(index);

    const text = texts[index];

    if (isMobile) {
      blocksRef.current = splitIntoBlocks(text);
      blockIndexRef.current = 0;
      speakBlock(0);
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    utteranceRef.current = u;

    u.onstart = () => {
      setPlayerState("playing");
      setStatusMessage("Leitura em andamento…");
    };

    u.onend = () => {
      cleanupPlayer();
      setStatusMessage("Leitura finalizada.");
    };

    speechSynthesis.speak(u);
  }

  function pauseOrResume() {
  if (!utteranceRef.current) return;

  if (isMobile) {
    // MOBILE: pausa = stop lógico
    speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlayerState("paused");
    setStatusMessage("Leitura pausada.");
    return;
  }

  // DESKTOP (Edge / Chrome)
  if (playerState === "playing") {
    speechSynthesis.pause();
    setPlayerState("paused");
    setStatusMessage("Leitura pausada.");
  } else if (playerState === "paused") {
    speechSynthesis.resume();
    setPlayerState("playing");
    setStatusMessage("Leitura retomada.");
  }
}

  function rewind() {
  if (!isMobile) return;

  speechSynthesis.cancel();
  utteranceRef.current = null;

  blockIndexRef.current = Math.max(0, blockIndexRef.current - 1);
  speakBlock(blockIndexRef.current);
}

  function stop() {
    cleanupPlayer();
    setStatusMessage("Leitura interrompida.");
  }

  /* ================= DOWNLOAD ================= */
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
          <p className="text-sm opacity-70">OCR com leitura contínua</p>
        </header>

        <div className="text-center text-sm text-cyan-400 min-h-[20px]">
          {loading ? "Processando OCR…" : statusMessage}
        </div>

        <section className="flex justify-center gap-4 flex-wrap">
          <label className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <CameraIcon className="h-8 w-8" />
            <span>Scanner</span>
            <input type="file" accept="image/*" capture="environment" hidden onChange={handleImageUpload} />
          </label>

          <label className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer">
            <PhotoIcon className="h-8 w-8" />
            <span>Imagem</span>
            <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
          </label>

          <div className="w-36 h-28 bg-red-900 opacity-40 rounded-xl flex flex-col items-center justify-center gap-2">
            <DocumentTextIcon className="h-8 w-8" />
            <span>PDF</span>
          </div>
        </section>

        {texts.length > 0 && (
          <section className="flex gap-4 overflow-x-auto pb-2">
            {texts.map((text, i) => (
              <div key={i} className={`min-w-[320px] bg-neutral-900 rounded-xl p-4 border-2 ${activeIndex === i ? "border-green-500" : "border-neutral-700"}`}>
                <div className="flex justify-between items-center mb-2 text-sm">
                  <span>Página {i + 1}</span>
                  <div className="flex gap-2">
                    <PlayIcon className="h-5 w-5 cursor-pointer" onClick={() => play(i)} />
                    <PauseIcon className="h-5 w-5 cursor-pointer" onClick={pauseOrResume} />
                    {isMobile && <ArrowUturnLeftIcon className="h-5 w-5 cursor-pointer" onClick={rewind} />}
                    <StopIcon className="h-5 w-5 cursor-pointer" onClick={stop} />
                    <ArrowDownTrayIcon className="h-5 w-5 cursor-pointer opacity-70" onClick={() => downloadText(text, i)} />
                  </div>
                </div>
                <div className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">{text}</div>
              </div>
            ))}
          </section>
        )}

        {!isLogged && (
          <button onClick={() => { setIsLogged(true); setStatusMessage("Login simulado realizado."); }}
            className="mt-2 flex items-center justify-center gap-2 text-sm bg-neutral-700 p-3 rounded-xl">
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Entrar com Google
          </button>
        )}

        <footer className="text-center text-xs text-neutral-400">
          Uso hoje: {usage.pages}/{limits[plan].pages} páginas — Plano: {plan}
        </footer>
      </div>
    </div>
  );
}
