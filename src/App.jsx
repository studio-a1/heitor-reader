import { useEffect, useRef, useState } from "react";

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);

  /* =========================
     OCR
  ========================== */
  async function handleImageUpload(e) {
    const file = e.target.files[0];
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
      } else {
        alert("Não foi possível ler a imagem.");
      }
    } catch (err) {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     VOZ
  ========================== */
  function startSpeech(index) {
    stopSpeech();

    const text = texts[index];
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setActiveIndex(index);
  }

  function pauseSpeech() {
    speechSynthesis.pause();
    setSpeaking(false);
  }

  function resumeSpeech() {
    speechSynthesis.resume();
    setSpeaking(true);
  }

  function stopSpeech() {
    speechSynthesis.cancel();
    setSpeaking(false);
  }

  useEffect(() => {
    return () => speechSynthesis.cancel();
  }, []);

  /* =========================
     UI
  ========================== */
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-zinc-800 rounded-2xl shadow-xl p-4 space-y-4">

        <h1 className="text-center text-xl font-semibold">
          Heitor Reader
        </h1>

        {/* Upload */}
        <label className="block text-center bg-blue-600 hover:bg-blue-700 transition rounded-lg py-3 cursor-pointer">
          📷 Selecionar imagem / Scanner
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleImageUpload}
          />
        </label>

        {loading && (
          <p className="text-center text-sm opacity-70">
            Processando OCR…
          </p>
        )}

        {/* Cards horizontais */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {texts.map((text, i) => (
            <div
              key={i}
              onClick={() => {
                stopSpeech();
                setActiveIndex(i);
              }}
              className={`min-w-[280px] max-w-[280px] cursor-pointer rounded-xl border-2 p-3 transition
                ${
                  activeIndex === i
                    ? "border-green-400 bg-zinc-700"
                    : "border-zinc-600 bg-zinc-900"
                }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  📄 Página {i + 1}
                </span>

                <div className="flex gap-1">
                  {!speaking || activeIndex !== i ? (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        startSpeech(i);
                      }}
                      className="px-2 py-1 bg-green-600 rounded"
                    >
                      ▶
                    </button>
                  ) : (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        pauseSpeech();
                      }}
                      className="px-2 py-1 bg-yellow-500 rounded"
                    >
                      ⏸
                    </button>
                  )}

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      resumeSpeech();
                    }}
                    className="px-2 py-1 bg-blue-600 rounded"
                  >
                    ⏵
                  </button>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      stopSpeech();
                    }}
                    className="px-2 py-1 bg-red-600 rounded"
                  >
                    ⏹
                  </button>
                </div>
              </div>

              {/* Texto */}
              <div className="text-sm leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                {text}
              </div>
            </div>
          ))}
        </div>

        {texts.length === 0 && (
          <p className="text-center text-sm opacity-60">
            Nenhuma página escaneada ainda.
          </p>
        )}
      </div>
    </div>
  );
}

