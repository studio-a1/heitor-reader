import { useEffect, useRef, useState } from "react";

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);
  const imageInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  /* ================= OCR ================= */
  async function processFile(file) {
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
        alert("Não foi possível ler o conteúdo.");
      }
    } catch {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
    }
  }

  /* ================= LEITURA ================= */
  function startSpeech(index) {
    stopSpeech();

    const text = texts[index];
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      if (index < texts.length - 1) {
        setActiveIndex(index + 1);
        startSpeech(index + 1);
      }
    };
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

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex justify-center p-4">
      <div className="w-full max-w-xl bg-neutral-800 rounded-xl p-4 shadow-xl">

        <h1 className="text-xl font-semibold text-center mb-4">
          Heitor Reader
        </h1>

        {/* BOTÕES PRINCIPAIS */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={() => cameraInputRef.current.click()}
            className="bg-green-600 hover:bg-green-500 p-3 rounded-lg text-sm"
          >
            📷 Scanner
          </button>

          <button
            onClick={() => imageInputRef.current.click()}
            className="bg-blue-600 hover:bg-blue-500 p-3 rounded-lg text-sm"
          >
            🖼 Imagem
          </button>

          <button
            onClick={() => pdfInputRef.current.click()}
            className="bg-purple-600 hover:bg-purple-500 p-3 rounded-lg text-sm"
          >
            📄 PDF
          </button>
        </div>

        {/* INPUTS OCULTOS */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={e => processFile(e.target.files[0])}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => processFile(e.target.files[0])}
        />

        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={() =>
            alert("PDF grande será tratado no próximo passo.")
          }
        />

        {loading && (
          <p className="text-center text-sm opacity-70 mb-2">
            Processando OCR…
          </p>
        )}

        {/* CARDS */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory">
          {texts.map((text, i) => (
            <div
              key={i}
              className={`min-w-[260px] snap-center rounded-lg border p-3 ${
                activeIndex === i
                  ? "border-green-400"
                  : "border-neutral-600"
              } bg-neutral-900`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm">📄 Página {i + 1}</span>

                <div className="flex gap-1 text-lg">
                  <button onClick={() => startSpeech(i)}>▶</button>
                  <button onClick={pauseSpeech}>⏸</button>
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
