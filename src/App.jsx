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
    } catch {
      alert("Erro ao processar OCR.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     LEITURA
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
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Heitor Reader</h1>

        {/* SCANNER MOBILE */}
        <label style={styles.upload}>
          📷 Selecionar imagem
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            hidden
          />
        </label>

        {loading && <p style={styles.info}>Processando OCR…</p>}

        <div style={styles.list}>
          {texts.map((text, i) => (
            <div
              key={i}
              style={{
                ...styles.textCard,
                borderColor: activeIndex === i ? "#4ade80" : "#333"
              }}
            >
              <div style={styles.cardHeader}>
                <span>📄 Texto {i + 1}</span>

                <div style={styles.icons}>
                  {!speaking || activeIndex !== i ? (
                    <button onClick={() => startSpeech(i)}>▶</button>
                  ) : (
                    <button onClick={pauseSpeech}>⏸</button>
                  )}
                  <button onClick={resumeSpeech}>⏵</button>
                  <button onClick={stopSpeech}>⏹</button>
                </div>
              </div>

              <div style={styles.text}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================
   STYLES
========================= */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    color: "#e5e5e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui"
  },
  card: {
    width: "100%",
    maxWidth: 700,
    background: "#181818",
    padding: 24,
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,.6)"
  },
  title: {
    textAlign: "center",
    marginBottom: 16
  },
  upload: {
    display: "block",
    textAlign: "center",
    padding: 12,
    background: "#2563eb",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 12
  },
  info: {
    textAlign: "center",
    marginBottom: 12,
    opacity: 0.8
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  textCard: {
    background: "#111",
    borderRadius: 12,
    padding: 12,
    border: "2px solid #333"
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  icons: {
    display: "flex",
    gap: 6
  },
  text: {
    fontSize: 14,
    lineHeight: 1.5,
    maxHeight: 160,
    overflowY: "auto",
    whiteSpace: "pre-wrap"
  }
};

