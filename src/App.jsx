import { useEffect, useRef, useState } from "react";

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);
  const fileInputRef = useRef(null);

  /* =========================
     OCR (mobile-safe)
  ========================== */
  async function handleImageUpload(e) {
    if (loading) return; // 🔒 lock contra loop mobile

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
      } else {
        alert("Não foi possível ler a imagem.");
      }
    } catch (err) {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);

      // 🔁 reset do input (EVITA loop no mobile)
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  /* =========================
     LEITURA POR VOZ
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
     UI (inalterada conceitualmente)
  ========================== */
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center font-sans">
      <div className="w-full max-w-xl bg-neutral-900 p-6 rounded-2xl shadow-2xl">
        <h1 className="text-center text-xl font-semibold mb-4">
          Heitor Reader
        </h1>

        {/* Upload / Scanner */}
        <label className="block text-center bg-blue-600 hover:bg-blue-700 transition rounded-lg py-3 cursor-pointer mb-3">
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
          <p className="text-center text-sm opacity-80 mb-3">
            Processando OCR…
          </p>
        )}

        {/* Cards */}
        <div className="flex flex-col gap-3">
          {texts.map((text, i) => (
            <div
              key={i}
              className={`bg-neutral-800 rounded-xl p-3 border-2 ${
                activeIndex === i
                  ? "border-emerald-400"
                  : "border-neutral-700"
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm">📄 Texto {i + 1}</span>

                <div className="flex gap-2 text-sm">
                  {!speaking || activeIndex !== i ? (
                    <button onClick={() => startSpeech(i)}>▶</button>
                  ) : (
                    <button onClick={pauseSpeech}>⏸</button>
                  )}
                  <button onClick={resumeSpeech}>⏵</button>
                  <button onClick={stopSpeech}>⏹</button>
                </div>
              </div>

              <div className="text-sm leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
