import { useEffect, useRef, useState } from "react";

export default function App() {
  const [texts, setTexts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);

  /* =========================
     OCR (imagem)
  ========================== */
  async function handleImage(file) {
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
        setActiveIndex(prev => (prev === null ? 0 : prev));
      } else {
        alert("Não foi possível ler a imagem.");
      }
    } catch {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     LEITURA POR VOZ
  ========================== */
  function playSpeech(index) {
    stopSpeech();

    const text = texts[index];
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setActiveIndex(index);
  }

  function continueSpeech() {
    if (!utteranceRef.current) return;
    speechSynthesis.speak(utteranceRef.current);
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-900 rounded-2xl shadow-xl p-5 space-y-4">

        <h1 className="text-xl font-semibold text-center">
          Heitor Reader
        </h1>

        {/* ===== BARRA FIXA DE AÇÕES (3 BOTÕES) ===== */}
        <div className="grid grid-cols-3 gap-3">

          {/* SCANNER */}
          <label className="text-center bg-green-600 hover:bg-green-500 transition rounded-lg py-3 cursor-pointer">
            📷 Scanner
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => handleImage(e.target.files[0])}
            />
          </label>

          {/* IMAGEM */}
          <label className="text-center bg-blue-600 hover:bg-blue-500 transition rounded-lg py-3 cursor-pointer">
            🖼 Imagem
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={e => handleImage(e.target.files[0])}
            />
          </label>

          {/* PDF (base pronta) */}
          <button
            disabled
            className="bg-zinc-700 rounded-lg py-3 opacity-50 cursor-not-allowed"
            title="PDF disponível nos planos pagos"
          >
            📄 PDF
          </button>
        </div>

        {loading && (
          <p className="text-center text-sm opacity-70">
            Processando OCR…
          </p>
        )}

        {/* ===== MINI-CARDS ===== */}
        {texts.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {texts.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`min-w-[60px] h-10 rounded-lg flex items-center justify-center text-sm font-medium transition
                  ${activeIndex === i
                    ? "bg-green-500 text-black"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}
                `}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* ===== CARD ATIVO ===== */}
        {activeIndex !== null && texts[activeIndex] && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">

            <div className="flex justify-between items-center">
              <span className="text-sm opacity-70">
                Página {activeIndex + 1}
              </span>

              <div className="flex gap-2 text-lg">
                <button
                  onClick={() => playSpeech(activeIndex)}
                  className={`px-3 py-1 rounded-lg ${
                    speaking ? "bg-green-500 text-black" : "bg-zinc-800"
                  }`}
                >
                  ▶
                </button>

                <button
                  onClick={continueSpeech}
                  className="px-3 py-1 rounded-lg bg-zinc-800"
                >
                  ⏭
                </button>

                <button
                  onClick={stopSpeech}
                  className="px-3 py-1 rounded-lg bg-red-600"
                >
                  ⏹
                </button>
              </div>
            </div>

            <div className="text-sm leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
              {texts[activeIndex]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

