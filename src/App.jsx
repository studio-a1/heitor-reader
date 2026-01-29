import { useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowDownTrayIcon,
  PhotoIcon,
  CameraIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/solid";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function App() {
  const plan = "free"; // free | freemium | premium

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

  // identidade (fase 6)
  const [isLogged, setIsLogged] = useState(false);

  const utteranceRef = useRef(null);

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

  function requireLogin(actionLabel) {
    setStatusMessage(
      `${actionLabel} disponível apenas após entrar com Google.`
    );
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

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.text) {
        setTexts((t) => [...t, data.text]);
        setActiveIndex(texts.length);
        incrementUsage("pages");
        setStatusMessage("Texto reconhecido. Pronto para leitura.");
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
  function play() {
    if (activeIndex === null) return;
    stop();

    const u = new SpeechSynthesisUtterance(texts[activeIndex]);
    utteranceRef.current = u;

    u.onstart = () => {
      setPlayerState("playing");
      setStatusMessage("Leitura em andamento…");
    };

    u.onend = () => {
      setPlayerState("idle");
      setStatusMessage("Leitura finalizada.");
    };

    speechSynthesis.speak(u);
  }

  function pauseOrResume() {
    if (!utteranceRef.current) return;

    if (playerState === "playing") {
      speechSynthesis.pause();
      setPlayerState("paused");
    } else if (playerState === "paused") {
      speechSynthesis.resume();
      setPlayerState("playing");
    }
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlayerState("idle");
  }

  /* ================= DOWNLOAD ================= */
  function downloadText() {
    if (!limits[plan].download) {
      requireLogin("Download");
      return;
    }

    if (!isLogged) {
      requireLogin("Download");
      return;
    }

    const blob = new Blob([texts[activeIndex]], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `pagina-${activeIndex + 1}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-neutral-800 rounded-2xl p-6 flex flex-col gap-6">

        {/* HEADER */}
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">
            OCR com leitura contínua e acessível
          </p>
        </header>

        {/* STATUS */}
        <div className="text-center text-sm min-h-[20px] text-cyan-400">
          {statusMessage}
        </div>

        {/* IMPORTAÇÕES */}
        <section className="flex justify-center gap-4 flex-wrap">
          {/* Scanner */}
          <label className="w-36 h-28 bg-green-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-green-700">
            <CameraIcon className="h-8 w-8" />
            <span className="text-sm">Scanner</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleImageUpload}
            />
          </label>

          {/* Imagem */}
          <label className="w-36 h-28 bg-cyan-800 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-cyan-700">
            <PhotoIcon className="h-8 w-8" />
            <span className="text-sm">Imagem</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
          </label>

          {/* PDF */}
          <div className="w-36 h-28 bg-red-900 rounded-xl flex flex-col items-center justify-center gap-2 opacity-40">
            <DocumentTextIcon className="h-8 w-8" />
            <span className="text-sm">PDF</span>
          </div>
        </section>

        {/* TEXTO */}
        {activeIndex !== null && (
          <div className="bg-neutral-900 rounded-xl p-4 text-sm max-h-56 overflow-y-auto">
            {texts[activeIndex]}
          </div>
        )}

        {/* PLAYER */}
        {activeIndex !== null && (
          <div className="flex justify-center gap-4 items-center">
            <PlayIcon className="h-7 w-7 cursor-pointer" onClick={play} />
            <PauseIcon className="h-7 w-7 cursor-pointer" onClick={pauseOrResume} />
            <StopIcon className="h-7 w-7 cursor-pointer" onClick={stop} />
            <ArrowDownTrayIcon
              className="h-7 w-7 cursor-pointer opacity-70"
              onClick={downloadText}
            />
          </div>
        )}

        {/* LOGIN CTA */}
        {!isLogged && (
          <button
            onClick={() => {
              setIsLogged(true);
              setStatusMessage("Login simulado realizado.");
            }}
            className="mt-4 flex items-center justify-center gap-2 text-sm bg-neutral-700 hover:bg-neutral-600 p-3 rounded-xl"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Entrar com Google
          </button>
        )}

        {/* FOOTER */}
        <footer className="text-center text-xs text-neutral-400">
          Uso hoje: {usage.pages}/{limits[plan].pages} páginas — Plano: {plan}
        </footer>
      </div>
    </div>
  );
}

