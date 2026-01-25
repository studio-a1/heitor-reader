import { useEffect, useRef, useState } from "react";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playerState, setPlayerState] = useState("idle");
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // idle | playing | paused

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
    return () => (speechSynthesis.onvoiceschanged = null);
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

  useEffect(() => {
    return () => speechSynthesis.cancel();
  }, []);

  /* =========================
     UI
  ========================== */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex justify-center p-4">
      <div className="w-full max-w-5xl bg-neutral-800 rounded-2xl p-4">
        <h1 className="text-center text-xl mb-4">Heitor Reader</h1>

        {/* BOTÕES DE UPLOAD */}
        <div className="flex gap-2 justify-center mb-4">
          <label className="px-4 py-2 bg-blue-600 rounded cursor-pointer text-sm focus:ring-2">
            📷 Scanner
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <label className="px-4 py-2 bg-indigo-600 rounded cursor-pointer text-sm focus:ring-2">
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
            className="px-4 py-2 bg-neutral-600 rounded text-sm opacity-50"
          >
            📄 PDF
          </button>
        </div>

        {/* STATUS */}
        {loading && (
          <p className="text-center text-sm opacity-70 mb-3">
            Processando OCR…
          </p>
        )}

        {preparing && (
          <p className="text-center text-sm text-yellow-400 mb-3">
            Preparando leitura…
          </p>
        )}

        {!hasPlayedOnce && texts.length > 0 && !preparing && (
          <p className="text-center text-sm opacity-70 mb-3">
            ▶ Clique em ouvir. A primeira leitura pode levar alguns segundos.
          </p>
        )}

        {/* CARDS */}
        <div className="flex gap-4 overflow-x-auto pb-2">
          {texts.map((text, i) => (
            <div
              key={i}
              className={`min-w-[300px] bg-neutral-900 rounded-xl p-3 border-2 ${
                activeIndex === i ? "border-green-500" : "border-neutral-700"
              }`}
            >
              <div className="flex justify-between items-center mb-2 text-sm">
                <span>Página {i + 1}</span>

                <div className="flex gap-1">
                  <button
                    onClick={() => play(i)}
                    className="px-3 py-2 bg-green-600 rounded cursor-pointer focus:ring-2"
                    title="Ouvir"
                  >
                    ▶
                  </button>

                  <button
                    onClick={pauseOrResume}
                    className="px-3 py-2 bg-blue-600 rounded cursor-pointer focus:ring-2"
                    title="Pausar / Retomar"
                  >
                    {playerState === "paused" ? "▶" : "⏸"}
                  </button>

                  {isMobile && (
                    <button
                      onClick={rewind}
                      className="px-3 py-2 bg-yellow-600 rounded cursor-pointer focus:ring-2"
                      title="Voltar um pouco"
                    >
                      ↺
                    </button>
                  )}

                  <button
                    onClick={stop}
                    className="px-3 py-2 bg-red-600 rounded cursor-pointer focus:ring-2"
                    title="Parar"
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
        </div>
      </div>
    </div>
  );
}
