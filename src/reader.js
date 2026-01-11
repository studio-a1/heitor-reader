// src/reader.js

const DAILY_LIMIT = 3;

function getUsage() {
  const today = new Date().toDateString();

  const stored = JSON.parse(localStorage.getItem("ocrUsage"));

  if (!stored || stored.date !== today) {
    return { date: today, count: 0 };
  }

  return stored;
}

function saveUsage(usage) {
  localStorage.setItem("ocrUsage", JSON.stringify(usage));
}

export async function sendImageToOCR(imageBase64) {
  const usage = getUsage();

 if (usage.count >= DAILY_LIMIT) {
  return {
    success: false,
    error: "Você atingiu o limite gratuito de hoje.",
    limitReached: true,
  };
}

  usage.count++;
  saveUsage(usage);

  const response = await fetch("/.netlify/functions/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: imageBase64, // pode ser ignorado por enquanto
    }),
  });

  const data = await response.json();
  return data;
}

export function speakText(text) {
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
}

