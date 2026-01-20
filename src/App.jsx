import { useEffect, useRef, useState } from "react";

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);
  const fileInputRef = useRef(null);

  /* OCR */
  async function handleImageUpload(e) {
    if (loading) return;
    const file = e.target.files?.[0];
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
      } else alert("Não foi possível ler a imagem.");
    } catch {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* VOZ */
  function startSpeech(index) {
    stopSpeech();
    const text = texts[index];
    if (!text) return;

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);

    utteranceRef.current = utter;
    speechSynthesis.speak(utter);
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

  useEffect(() => () => speechSynthesis.cancel(), []);

  /* UI */
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex justify-center p-4">
      <div className="w-full max-w-xl bg-neutral-900 p-5 rounded-2xl shadow-xl">
        <h1 className="text-center text-lg font-semibold mb-4">
          Heitor Reader
        </h1>

        {/* Scanner */}
        <label className="block text-center bg-blue-600 hover:bg-blue-700 rounded-lg py-3 cursor-pointer mb-4">
          📷 Ler imagem
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            hidden
          />
        </label>

        {loading && (
          <p className="text-center text-sm opacity-70 mb-3">
            Processando OCR…
          </p>
        )}

        {/* Cards */}
        <div className="flex flex-col gap-3">
          {texts.map((text, i) => {
            const isActive = activeIndex === i;

            return (
              <div
                key={i}
                className={`rounded-xl border-2 transition ${
                  isActive
                    ? "border-emerald-400 bg-neutral-800"
                    : "border-neutral-700 bg-neutral-850"
                } p-3`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-80">
                    📄 Texto {i + 1}
                  </span>

                  {isActive && (
                    <div className="flex gap-3 text-lg">
                      {!speaking ? (
                        <button
                          onClick={() => startSpeech(i)}
                          className="text-neutral-300 hover:text-white"
                        >
                          ▶
                        </button>
                      ) : (
                        <button
                          onClick={pauseSpeech}
                          className="text-emerald-400"
                        >
                          ⏸
                        </button>
                      )}

                      <button
                        onClick={resumeSpeech}
                        className="text-yellow-400"
                      >
                        ⏵
                      </button>

                      <button
                        onClick={stopSpeech}
                        className="text-red-400"
                      >
                        ⏹
                      </button>
                    </div>
                  )}
                </div>

                {isActive && (
                  <div className="mt-2 text-sm leading-relaxed max-h-44 overflow-y-auto whitespace-pre-wrap">
                    {text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

