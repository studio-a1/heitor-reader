import { useState } from "react";
import "./App.css";

function App() {
  const [imageFile, setImageFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Web Speech API
  const speakText = (text) => {
    if (!("speechSynthesis" in window)) {
      alert("Seu navegador não suporta leitura por voz.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleFileChange = (e) => {
    setImageFile(e.target.files[0]);
    setExtractedText("");
    setError("");
  };

  const handleSubmit = async () => {
    if (!imageFile) {
      setError("Nenhuma imagem selecionada.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // (por enquanto não precisamos converter a imagem)
      const response = await fetch("/.netlify/functions/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: "placeholder", // backend ignora por enquanto
        }),
      });

      const data = await response.json();

      if (data.success) {
        setExtractedText(data.text);
        speakText(data.text);
      } else {
        setError("Falha ao processar OCR.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Heitor Reader</h1>

      <input type="file" accept="image/*" onChange={handleFileChange} />

      <div style={{ marginTop: "10px" }}>
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Processando OCR…" : "Ler imagem"}
        </button>
      </div>

      {error && (
        <p style={{ color: "red", marginTop: "10px" }}>
          {error}
        </p>
      )}

      {extractedText && (
        <div style={{ marginTop: "20px" }}>
          <h3>Texto extraído</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{extractedText}</p>

          <button onClick={() => speakText(extractedText)}>
            🔊 Ouvir novamente
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

