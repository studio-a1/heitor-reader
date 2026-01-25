import { useEffect, useRef, useState } from "react";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playerState, setPlayerState] = useState("idle");
  // idle | playing | paused

  const utteranceRef = useRef(null);
  const voicesRef = useRef([]);
  const charIndexRef = useRef(0);

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
    } catch {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     PLAYER
  ========================== */
  function play(index, startChar = 0) {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    charIndexRef.current = startChar;

    const text = texts[index];
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text.slice(startChar));
    utterance.lang = "pt-BR";
    utterance.rate = 1;

    const voice =
      voicesRef.current.find(v => v.lang === "pt-BR") ||
      voicesRef.current[0];

    if (voice) utterance.voice = voice;

    utterance.onboundary = e => {
      if (typeof e.charIndex === "number") {
        charIndexRef.current = startChar + e.charIndex;
      }
    };

    utterance.onstart = () => {
      setActiveIndex(index);
      setPlayerState("playing");
    };

    utterance.onend = () => {
      setPlayerState("idle");
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setPlayerState("idle");
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }

  function pauseOrResume() {
    if (!utteranceRef.current) return;

    if (playerState === "playing") {
      speechSynthesis.pause();
      setPlayerState("paused");
      return;
    }

    if (playerState === "paused" && !isMobile) {
      speechSynthesis.resume();
      setPlayerState("playing");
    }
  }

  function rewind() {
    if (activeIndex === null) return;

    const rewindChars = 120;
    const start = Math.max(0, charIndexRef.current - rewindChars);
    play(activeIndex, start);
  }

  function stop() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    charIndexRef.current = 0;
    setPlayerState("idle");
  }

  useEffect(() => {
    return () => speechSynthesis.cancel();
  }, []);

  /* =========================
     UI
  ========================== */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex justify-center p-4">
      <div className="w-full max-w-4xl bg-neutral-800 rounded-2xl p-4">
        <h1 className="text-center text-xl mb-4">Heitor Reader</h1>

        <div className="flex gap-2 justify-center mb-4">
          <label className="px-3 py-2 bg-blue-600 rounded cursor-pointer text-sm">
            📷 Scanner
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => handleImageUpload(e.target.files[0])}
            />
          </label>

          <label className="px-3 py-2 bg-indigo-600 rounded cursor-pointer text-sm">
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
            className="px-3 py-2 bg-neutral-600 rounded text-sm opacity-50"
          >
            📄 PDF
          </button>
        </div>

        {loading && (
          <p className="text-center text-sm opacity-70 mb-3">
            Processando OCR…
          </p>
        )}

        <div className="flex gap-3 overflow-x-auto">
          {texts.map((text, i) => (
            <div
              key={i}
              className={`min-w-[260px] bg-neutral-900 rounded-xl p-3 border-2 ${
                activeIndex === i ? "border-green-500" : "border-neutral-700"
              }`}
            >
              <div className="flex justify-between items-center mb-2 text-sm">
                <span>Página {i + 1}</span>

                <div className="flex gap-1">
                  <button
                    onClick={() => play(i)}
                    className="px-2 py-1 bg-green-600 rounded text-xs"
                  >
                    ▶
                  </button>

                  {!isMobile && (
                    <button
                      onClick={pauseOrResume}
                      className="px-2 py-1 bg-blue-600 rounded text-xs"
                    >
                      {playerState === "paused" ? "▶" : "⏸"}
                    </button>
                  )}

                  {isMobile && (
                    <button
                      onClick={rewind}
                      className="px-2 py-1 bg-yellow-600 rounded text-xs"
                    >
                      ⏪
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

              <div className="text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
