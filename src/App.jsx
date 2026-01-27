import { useEffect, useRef, useState } from "react";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playerState, setPlayerState] = useState("idle");
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const utteranceRef = useRef(null);
  const voicesRef = useRef([]);

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
      setPreparing(false);
      setPlayerState("playing");
      setHasPlayedOnce(true);
    };

    u.onend = () => {
      blockIndexRef.current++;
      if (blockIndexRef.current < blocksRef.current.length) {
        speakBlock(blockIndexRef.current);
      } else {
        setPlayerState("idle");
      }
    };

    utteranceRef.current = u;
    speechSynthesis.speak(u);
  }

  /* =========================
     PLAYER
  ========================== */
  function play(index) {
    if (navigator.vibrate) navigator.vibrate(10);

    speechSynthesis.cancel();
    utteranceRef.current = null;
    setActiveIndex(index);

    const text = texts[index];
    if (!text) return;

    setPreparing(true);

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
      setPreparing(false);
      setPlayerState("playing");
      setHasPlayedOnce(true);
    };

    u.onend = () => setPlayerState("idle");
    u.onerror = () => setPlayerState("idle");

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
    blockIndexRef.current = Math.max(0, blockIndexRef.current - 2);
    speakBlock(blockIndexRef.current);
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
    setPreparing(false);
  }

  /* =========================
     CLEANUP GLOBAL
  ========================== */
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  /* =========================
     UI
  ========================== */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-neutral-800 rounded-2xl p-6 flex flex-col gap-6">

        <header className="text-center flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">
            OCR com leitura progressiva e acessível
          </p>
        </header>

        <section className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <label className="w-full sm:w-60 h-24 bg-green-600 hover:bg-green-500 transition rounded-xl flex flex-col items-center justify-center cursor-pointer text-lg font-medium">
            📷 Scanner
            <span className="text-xs opacity-80">Câmera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <label className="w-full sm:w-60 h-24 bg-blue-600 hover:bg-blue-500 transition rounded-xl flex flex-col items-center justify-center cursor-pointer text-lg font-medium">
            🖼 Imagem
            <span className="text-xs opacity-80">Galeria</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <button
            disabled
            className="w-full sm:w-60 h-24 bg-neutral-700 rounded-xl flex flex-col items-center justify-center text-lg font-medium opacity-50 cursor-not-allowed"
          >
            📄 OCR
            <span className="text-xs opacity-80">Em breve</span>
          </button>
        </section>

        <section className="text-center min-h-[24px]">
          {loading && <p className="text-sm opacity-70">Processando OCR…</p>}
          {preparing && (
            <p className="text-sm text-yellow-400">Preparando leitura…</p>
          )}
          {!hasPlayedOnce && texts.length > 0 && !preparing && (
            <p className="text-sm opacity-70">
              ▶ Toque em ouvir para iniciar a leitura
            </p>
          )}
        </section>

        {texts.length > 0 && (
          <section className="flex gap-4 overflow-x-auto pb-2">
            {texts.map((text, i) => (
              <div
                key={i}
                className={`min-w-[280px] sm:min-w-[320px] bg-neutral-900 rounded-xl p-4 border-2 ${
                  activeIndex === i
                    ? "border-green-500"
                    : "border-neutral-700"
                }`}
              >
                <div className="flex justify-between items-center mb-3 text-sm">
                  <span>Página {i + 1}</span>

                  <div className="flex gap-1">
                    <button
                      onClick={() => play(i)}
                      className="px-3 py-2 bg-green-600 rounded"
                    >
                      ▶
                    </button>

                    <button
                      onClick={pauseOrResume}
                      className="px-3 py-2 bg-blue-600 rounded"
                    >
                      {playerState === "paused" ? "▶" : "⏸"}
                    </button>

                    {isMobile && (
                      <button
                        onClick={rewind}
                        className="px-3 py-2 bg-yellow-600 rounded"
                      >
                        ↺
                      </button>
                    )}

                    <button
                      onClick={stop}
                      className="px-3 py-2 bg-red-600 rounded"
                    >
                      ⏹
                    </button>
                  </div>
                </div>

                <div className="text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

