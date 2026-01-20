import { useEffect, useRef, useState } from "react";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  /* ================= OCR ================= */
  async function processImage(file) {
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
        setActiveIndex(prev => (prev === null ? 0 : prev + 1));
      } else {
        alert("Não foi possível ler a imagem.");
      }
    } finally {
      setLoading(false);
    }
  }

  /* ================= VOZ ================= */
  function speak(index) {
    stopSpeech();
    const text = texts[index];
    if (!text) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";

    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      setSpeaking(false);
      if (index + 1 < texts.length) speak(index + 1);
    };

    utteranceRef.current = u;
    speechSynthesis.speak(u);
    setActiveIndex(index);
  }

  function pauseSpeech() {
    speechSynthesis.pause();
    setSpeaking(false);
  }

  function resumeSpeech() {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setSpeaking(true);
    }
  }

  function stopSpeech() {
    speechSynthesis.cancel();
    setSpeaking(false);
  }

  useEffect(() => () => speechSynthesis.cancel(), []);

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex justify-center p-4">
      <div className="w-full max-w-5xl bg-zinc-800 rounded-2xl p-4 space-y-4">

        <h1 className="text-center text-xl font-semibold">
          Heitor Reader
        </h1>

        {/* AÇÕES */}
        <div className="flex gap-3 justify-center">
          {/* BOTÃO A */}
          <label className="bg-green-600 px-4 py-2 rounded cursor-pointer">
            {isMobile ? "📷 Scanner" : "🖼 Imagem"}
            <input
              type="file"
              accept="image/*"
              {...(isMobile ? { capture: "environment" } : {})}
              hidden
              onChange={e => processImage(e.target.files[0])}
            />
          </label>

          {/* BOTÃO B */}
          <label className="bg-blue-600 px-4 py-2 rounded cursor-pointer">
            🖼 Imagem
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={e => processImage(e.target.files[0])}
            />
          </label>
        </div>

        {loading && <p className="text-center opacity-70">Processando OCR…</p>}

        {/* PROGRESSO */}
        {activeIndex !== null && (
          <p className="text-center text-sm opacity-70">
            Página {activeIndex + 1} / {texts.length}
          </p>
        )}

        {/* CARDS */}
        <div className="flex gap-3 overflow-x-auto">
          {texts.map((text, i) => (
            <div
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`min-w-[300px] p-3 rounded-xl border-2 cursor-pointer
                ${i === activeIndex
                  ? "border-green-400 bg-zinc-700"
                  : "border-zinc-600 bg-zinc-900"
                }`}
            >
              <div className="flex justify-between mb-2">
                <span>📄 {i + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => speak(i)}>▶</button>
                  <button onClick={pauseSpeech}>⏸</button>
                  <button onClick={resumeSpeech}>⏵</button>
                  <button onClick={stopSpeech}>⏹</button>
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
