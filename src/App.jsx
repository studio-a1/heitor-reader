import { useEffect, useRef, useState } from "react";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playerState, setPlayerState] = useState("idle"); // idle | playing | paused
  const [showFirstPlayHint, setShowFirstPlayHint] = useState(false);
  const [assistMode, setAssistMode] = useState(
    () => localStorage.getItem("assistMode") === "true"
  );

  const utteranceRef = useRef(null);
  const voicesRef = useRef([]);
  const hasStartedRef = useRef(false);

  // MOBILE ONLY
  const blocksRef = useRef([]);
  const blockIndexRef = useRef(0);

  /* =========================
     LOAD VOICES
  ========================== */
  useEffect(() => {
    function loadVoices() {
      const voices = speechSynthesis.getVoices();
      if (voices.length) voicesRef.current = voices;
    }

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  /* =========================
     OCR
  ========================== */
  async function handleImageUpload(file) {
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.text) {
        setTexts(prev => [...prev, data.text]);
        setActiveIndex(texts.length);
      }
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     HELPERS
  ========================== */
  function splitIntoBlocks(text) {
    return text.split(/(?<=[.!?])\s+/).filter(Boolean);
  }

  function speakBlock(i) {
    const block = blocksRef.current[i];
    if (!block) return;

    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(block);
    u.lang = "pt-BR";

    const voice =
      voicesRef.current.find(v => v.lang === "pt-BR") ||
      voicesRef.current[0];

    if (voice) u.voice = voice;

    u.onstart = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      setPlayerState("playing");
      setShowFirstPlayHint(false);
      localStorage.setItem("hasPlayedOnce", "true");
    };

    u.onend = () => {
      blockIndexRef.current++;

      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(blockIndexRef.current);
      } else {
        setPlayerState("idle");
        hasStartedRef.current = false;
      }
    };

    utteranceRef.current = u;
    speechSynthesis.speak(u);
  }

  /* =========================
     PLAYER
  ========================== */
  function play(index) {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    hasStartedRef.current = false;

    setActiveIndex(index);

    const text = texts[index];
    if (!text) return;

    if (!localStorage.getItem("hasPlayedOnce")) {
      setShowFirstPlayHint(true);
    }

    if (isMobile) {
      blocksRef.current = splitIntoBlocks(text);
      blockIndexRef.current = 0;
      speakBlock(0);
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";

    const voice =
      voicesRef.current.find(v => v.lang === "pt-BR") ||
      voicesRef.current[0];

    if (voice) u.voice = voice;

    u.onstart = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      setPlayerState("playing");
      setShowFirstPlayHint(false);
      localStorage.setItem("hasPlayedOnce", "true");
    };

    u.onend = () => {
      setPlayerState("idle");
      hasStartedRef.current = false;
    };

    u.onerror = () => {
      setPlayerState("idle");
      hasStartedRef.current = false;
    };

    utteranceRef.current = u;
    speechSynthesis.speak(u);
  }

  function pauseOrResume() {
    if (!utteranceRef.current) return;

    if (playerState === "playing") {
      speechSynthesis.pause();
      setPlayerState("paused");
      return;
    }

    if (!isMobile && playerState === "paused") {
      speechSynthesis.resume();
      setPlayerState("playing");
    }
  }

  function rewind() {
    if (!isMobile) return;

    blockIndexRef.current = Math.max(0, blockIndexRef.current - 1);
    hasStartedRef.current = false;
    speakBlock(blockIndexRef.current);
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    hasStartedRef.current = false;
    setPlayerState("idle");
  }

  useEffect(() => {
    return () => speechSynthesis.cancel();
  }, []);

  /* =========================
     UI
  ========================== */
  return (
    <div
      className={`min-h-screen bg-neutral-900 text-neutral-200 flex justify-center p-4 ${
        assistMode ? "text-base leading-relaxed" : "text-sm"
      }`}
    >
      <div className="w-full max-w-4xl bg-neutral-800 rounded-2xl p-4">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl">Heitor Reader</h1>

          <button
            onClick={() => {
              const next = !assistMode;
              setAssistMode(next);
              localStorage.setItem("assistMode", next);
            }}
            className="text-xs px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
          >
            ♿ Leitura Assistida
          </button>
        </div>

        {/* BOTÕES INICIAIS */}
        <div className="flex gap-2 justify-center mb-3">
          <label className="px-3 py-2 bg-blue-600 rounded cursor-pointer">
            📷 Scanner
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <label className="px-3 py-2 bg-indigo-600 rounded cursor-pointer">
            🖼 Imagem
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <button
            disabled
            className="px-3 py-2 bg-neutral-600 rounded opacity-50"
          >
            📄 PDF
          </button>
        </div>

        {/* MENSAGEM PRIMEIRA LEITURA */}
        {showFirstPlayHint && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 p-3 rounded bg-neutral-700 text-center"
          >
            <strong className="block">Preparando a leitura…</strong>
            <span className="opacity-80">
              a primeira vez pode levar alguns segundos
            </span>
          </div>
        )}

        {/* LOADING OCR */}
        {loading && (
          <p className="text-center opacity-70 mb-3">
            Lendo a página…
          </p>
        )}

        {/* CARDS */}
        <div className="flex gap-3 overflow-x-auto">
          {texts.map((text, i) => (
            <div
              key={i}
              className={`min-w-[260px] bg-neutral-900 rounded-xl p-3 border-2 ${
                activeIndex === i
                  ? "border-green-500"
                  : "border-neutral-700"
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span>Página {i + 1}</span>

                <div className="flex gap-1">
                  <button
                    onClick={() => play(i)}
                    className="px-2 py-1 bg-green-600 rounded text-xs"
                  >
                    ▶
                  </button>

                  <button
                    onClick={pauseOrResume}
                    className="px-2 py-1 bg-blue-600 rounded text-xs"
                  >
                    {playerState === "paused" ? "▶" : "⏸"}
                  </button>

                  {isMobile && (
                    <button
                      onClick={rewind}
                      className="px-2 py-1 bg-yellow-600 rounded text-xs"
                    >
                      ↺
                    </button>
                  )}

                  <button
                    onClick={stop}
                    className="px-2 py-1 bg-red-600 rounded text-xs"
                  >
                    ⏹
                  </button>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap">
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
