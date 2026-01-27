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
        body: formData,
      });
      const data = await res.json();
      if (data.text) {
        setTexts((prev) => [...prev, data.text]);
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
      voicesRef.current.find((v) => v.lang === "pt-BR") ||
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
      voicesRef.current.find((v) => v.lang === "pt-BR") ||
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
    blockIndexRef.current = Math.max(0, blockIndexRef.current - 1);
    speakBlock(blockIndexRef.current);
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    blockIndexRef.current = 0;
    setPlayerState("idle");
    setPreparing(false);
  }

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

        <header className="text-center">
          <h1 className="text-2xl font-semibold">Heitor Reader</h1>
          <p className="text-sm opacity-70">
            OCR com leitura progressiva e acessível
          </p>
        </header>

        {/* BOTÕES PRINCIPAIS */}
        <section className="flex gap-4 justify-center flex-wrap">

          {/* SCANNER */}
          <label className="w-40 h-28 bg-green-900 border border-green-500 rounded-xl
            flex flex-col items-center justify-center gap-2 cursor-pointer
            hover:bg-green-800 hover:border-neutral-500 transition">
            <svg viewBox="0 0 24 24" className="w-10 h-10 fill-neutral-200">
              <path d="M4.5 4.5A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15Zm7.5 4.125a4.125 4.125 0 1 1 0 8.25 4.125 4.125 0 0 1 0-8.25Z" />
            </svg>
            <span className="text-sm">Scanner</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleImageUpload(e.target.files[0])}
            />
          </label>

          {/* IMAGEM */}
          <label className="w-40 h-28 bg-blue-900 border border-blue-500 rounded-xl
            flex flex-col items-center justify-center gap-2 cursor-pointer
            hover:bg-blue-800 hover:border-neutral-500 transition">
            <svg viewBox="0 0 24 24" className="w-10 h-10 fill-neutral-200">
              <path d="M3 5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v13.5A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V5.25Zm4.5 9.75 3-3 4.5 4.5 2.25-2.25L19.5 18H4.5l3-3Z" />
            </svg>
            <span className="text-sm">Imagem</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleImageUpload(e.target.files[0])}
            />
          </label>

          {/* PDF */}
          <div className="w-40 h-28 bg-red-900 border border-red-500 rounded-xl
            flex flex-col items-center justify-center gap-2 opacity-40 cursor-not-allowed">
            <svg viewBox="0 0 24 24" className="w-10 h-10 fill-neutral-400">
              <path d="M6.75 2.25A2.25 2.25 0 0 0 4.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V8.25L14.25 2.25H6.75Z" />
            </svg>
            <span className="text-sm">PDF</span>
          </div>

        </section>

        {/* STATUS */}
        <section className="text-center min-h-[24px]">
          {loading && <p className="text-sm opacity-70">Processando OCR…</p>}
          {preparing && (
            <p className="text-sm text-yellow-400">Preparando leitura…10s</p>
          )}
          {!hasPlayedOnce && texts.length > 0 && !preparing && (
            <p className="text-sm opacity-70">
              ▶ Toque em play para iniciar a leitura
            </p>
          )}
        </section>

        {/* CARDS */}
        {texts.length > 0 && (
          <section className="flex gap-4 overflow-x-auto pb-2">
            {texts.map((text, i) => (
              <div
                key={i}
                className={`min-w-[320px] bg-neutral-900 rounded-xl p-4 border-2 ${
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
                      className="px-3 py-2 bg-green-700 rounded"
                    >
                      ▶
                    </button>
                    <button
                      onClick={pauseOrResume}
                      className="px-3 py-2 bg-blue-700 rounded"
                    >
                      {playerState === "paused" ? "▶" : "⏸"}
                    </button>
                    {isMobile && (
                      <button
                        onClick={rewind}
                        className="px-3 py-2 bg-neutral-700 rounded"
                      >
                        ↺
                      </button>
                    )}
                    <button
                      onClick={stop}
                      className="px-3 py-2 bg-red-700 rounded"
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

