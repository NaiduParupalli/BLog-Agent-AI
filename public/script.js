const isNetlify = window.location.hostname.includes("netlify.app");
const API_BASE = (window.location.port === "3000" || window.location.protocol === "file:")
  ? "http://localhost:5000"
  : (isNetlify ? "/.netlify/functions" : "");

let generatedContent = "";
let historyData = [];

// 🔑 API Key management
function saveApiKey() {
  const input = document.getElementById("customApiKey");
  const key = input ? input.value.trim() : "";
  if (!key) {
    alert("Please enter a valid Gemini API Key.");
    return;
  }
  localStorage.setItem("gemini_api_key", key);
  const status = document.getElementById("keyStatus");
  if (status) {
    status.innerText = "✅ Saved!";
    setTimeout(() => { status.innerText = ""; }, 3000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const savedKey = localStorage.getItem("gemini_api_key");
  const input = document.getElementById("customApiKey");
  if (savedKey && input) {
    input.value = savedKey;
  }
  loadHistory();
});

// Direct Gemini API call (client fallback)
async function callGeminiDirect(prompt, apiKey) {
  const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  let lastErr = "";
  for (const m of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data.error) {
        lastErr = data.error.message || JSON.stringify(data.error);
      }
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(lastErr || "Failed to generate via Gemini API.");
}

function buildPrompt(topic, style, language) {
  const langLower = (language || "").toLowerCase();
  let langInstruction = `Language: ${language}`;
  let blogHint = `Write 200-300 words about ${topic}`;
  let kwHint = `10 SEO keywords separated by commas (e.g. ${topic}, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10)`;

  if (langLower === "telugu") {
    langInstruction = "CRITICAL LANGUAGE REQUIREMENT: You MUST write the entire ### Blog and ### Keywords strictly in Telugu language using native Telugu script (తెలుగు లిపిలో రాయండి). Every sentence of the blog must be in Telugu. DO NOT write in English.";
    blogHint = `Write 200-300 words strictly in Telugu script about ${topic}`;
    kwHint = "10 SEO keywords in Telugu separated by commas";
  } else if (langLower === "hindi") {
    langInstruction = "CRITICAL LANGUAGE REQUIREMENT: You MUST write the entire ### Blog and ### Keywords strictly in Hindi language using native Devanagari Hindi script (हिन्दी भाषा और देवनागरी लिपि में लिखें). Every sentence of the blog must be in Hindi. DO NOT write in English.";
    blogHint = `Write 200-300 words strictly in Hindi (Devanagari script) about ${topic}`;
    kwHint = "10 SEO keywords in Hindi separated by commas";
  }

  return `You are an expert content creator. Generate content for: "${topic}"

Tone/Style: ${style}
${langInstruction}

You MUST output ALL 4 sections below using these exact headers:

### Blog
(${blogHint})

### Keywords
${kwHint}

### Hashtags
10 hashtags starting with # (e.g. #tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10)

### Thumbnail
A cinematic 4k ultra-realistic image prompt describing a visual for this blog.`;
}

// 🚀 GENERATE CONTENT
async function generate() {
  const topicInput = document.getElementById("topic");
  const topic = topicInput.value.trim();
  const style = document.getElementById("style").value;
  const language = document.getElementById("language").value;
  const modelSelect = document.getElementById("model");
  const model = modelSelect ? modelSelect.value : "gemma3:1b";
  const customKey = (localStorage.getItem("gemini_api_key") || "").trim();

  if (!topic) {
    alert("Please enter a topic before generating.");
    topicInput.focus();
    return;
  }

  const btn = document.getElementById("generateBtn");
  const loader = document.getElementById("loader");
  const statusMsg = document.getElementById("statusMessage");

  btn.disabled = true;
  btn.style.opacity = "0.6";
  btn.innerText = "⏳ Generating...";
  loader.classList.remove("hidden");
  statusMsg.style.color = "#4f46e5";
  statusMsg.innerText = `🤖 Generating content for "${topic}"... Please wait (~15-25 seconds).`;

  try {
    let resultText = "";

    // 1. Try server endpoint
    try {
      const endpoint = isNetlify ? "/.netlify/functions/generate" : `${API_BASE}/generate`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, style, language, model, gemini_api_key: customKey })
      });

      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) {}

      if (data && data.result) {
        resultText = data.result;
      } else if (data && data.error && !customKey) {
        // If server complained about missing key, prompt user
        if (data.error.includes("No AI API key")) {
          const keyDetails = document.getElementById("keyDetails");
          if (keyDetails) keyDetails.open = true;
          const keyInput = document.getElementById("customApiKey");
          if (keyInput) keyInput.focus();
          throw new Error("Please enter your free Google Gemini API Key in the settings box above.");
        }
        throw new Error(data.error);
      }
    } catch (serverErr) {
      console.warn("Server generation attempt:", serverErr.message);
      // 2. Direct browser fallback if user entered API key
      if (customKey) {
        statusMsg.innerText = "⚡ Generating directly via Gemini API...";
        const prompt = buildPrompt(topic, style, language);
        resultText = await callGeminiDirect(prompt, customKey);
      } else {
        throw serverErr;
      }
    }

    if (!resultText) {
      throw new Error("No content received. Please check your API key or backend connection.");
    }

    generatedContent = resultText;
    parseOutput(generatedContent);
    statusMsg.style.color = "#10b981";
    statusMsg.innerText = "✅ Generated successfully!";

    saveLocalHistory({ topic, style, language, model, content: generatedContent });
    historyData = getLocalHistory();
    renderHistory();

  } catch (error) {
    console.error("GENERATE ERROR:", error);
    statusMsg.style.color = "#ef4444";
    statusMsg.innerText = `❌ ${error.message}`;
    alert(`Generation Notice: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.innerText = "⚡ Generate";
    loader.classList.add("hidden");
  }
}

// 🧠 PARSE OUTPUT (Robust for all models)
function parseOutput(text) {
  if (!text) {
    document.getElementById("blog").textContent = "No content received.";
    return;
  }

  let blog = "";
  let hashtags = "";
  let keywords = "";
  let thumbnail = "";

  let current = "blog"; // Default to blog so intro and content are never lost

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Match section headers like "**Blog:**", "### Keywords:", "### Hashtags:", "**Thumbnail:** prompt..."
    const match = rawLine.match(/^\s*(?:[*#\-_>\s]*)(blog(?:\s*post)?|hashtags?|hashtages?|tags|keywords?|seo\s*keywords?|thumbnail(?:\s*prompt)?|image\s*prompt|cover\s*prompt)\s*[:\-–—]?\s*(.*)$/i);
    if (match) {
      const headerType = match[1].toLowerCase();
      const remainingContent = match[2].trim();

      if (/^blog/i.test(headerType)) current = "blog";
      else if (/^(hashtag|tag)/i.test(headerType)) current = "hashtags";
      else if (/^keyword/i.test(headerType)) current = "keywords";
      else if (/^(thumbnail|image|cover)/i.test(headerType)) current = "thumbnail";

      if (remainingContent) {
        const cleanRem = remainingContent.replace(/^[*_]+|[*_]+$/g, "").trim();
        if (cleanRem) {
          if (current === "blog") blog += cleanRem + "\n";
          else if (current === "hashtags") hashtags += cleanRem + "\n";
          else if (current === "keywords") keywords += cleanRem + "\n";
          else if (current === "thumbnail") thumbnail += cleanRem + "\n";
        }
      }
      continue;
    }

    if (current === "blog") blog += rawLine + "\n";
    else if (current === "hashtags") hashtags += rawLine + "\n";
    else if (current === "keywords") keywords += rawLine + "\n";
    else if (current === "thumbnail") thumbnail += rawLine + "\n";
  }

  // Fallback if blog was somehow blank
  if (!blog.trim()) {
    blog = text;
  }

  // Fallback: If model omitted a distinct Keywords section, extract them from Hashtags
  if (!keywords.trim() && hashtags.trim()) {
    const tags = hashtags.match(/#([a-zA-Z0-9_\u0900-\u0D7F]+)/g);
    if (tags && tags.length > 0) {
      keywords = tags
        .map(t => t.replace(/^#/, "").replace(/([a-z])([A-Z])/g, "$1 $2"))
        .join(", ");
    }
  }

  document.getElementById("blog").textContent = blog.trim();
  document.getElementById("hashtags").textContent = hashtags.trim();
  document.getElementById("keywords").textContent = keywords.trim();
  document.getElementById("thumbnail").textContent = thumbnail.trim();
}

// 📥 DOWNLOAD PDF / TEXT
async function downloadPDF() {
  if (!generatedContent) {
    alert("Please generate content first before downloading.");
    return;
  }

function downloadBlogText() {
  const blob = new Blob([generatedContent || "No content"], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blog-content.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 📄 DOWNLOAD PDF (WITH AUTOMATIC TEXT FALLBACK)
function downloadPDF() {
  if (!generatedContent) {
    alert("Please generate content first.");
    return;
  }

  const hasIndic = /[\u0900-\u0D7F]/.test(generatedContent);
  if (hasIndic) {
    downloadBlogText();
    return;
  }

  fetch(`${API_BASE}/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content: generatedContent })
  })
  .then(res => {
    if (!res.ok) throw new Error("PDF endpoint failed");
    return res.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  })
  .catch(err => {
    console.warn("Falling back to text download:", err);
    downloadBlogText();
  });
}

// 🖼️ DOWNLOAD IMAGE HANDLER
function downloadImage() {
  const img = document.getElementById("aiImage");
  if (img && img.src && img.src.startsWith("http")) {
    const a = document.createElement("a");
    a.href = img.src;
    a.download = "thumbnail.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    alert("Image generation requires Stable Diffusion WebUI. You can use the Thumbnail Prompt above in Midjourney, DALL-E, or Stable Diffusion!");
  }
}

// 📂 HISTORY (CLOUD + LOCALSTORAGE SAFE)
function getLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem("ai_trendsetter_history") || "[]");
  } catch (e) {
    return [];
  }
}

function saveLocalHistory(item) {
  try {
    const list = getLocalHistory();
    list.push(item);
    localStorage.setItem("ai_trendsetter_history", JSON.stringify(list));
  } catch (e) {}
}

function renderHistory() {
  let html = "";
  historyData.slice().reverse().forEach((item, index) => {
    const realIndex = historyData.length - 1 - index;
    html += `<p style="cursor:pointer; padding:6px 8px; border-radius:4px; margin:4px 0; background:rgba(255,255,255,0.05);" onclick="showHistoryItem(${realIndex})" title="Click to view">🔥 ${item.topic}</p>`;
  });
  const histEl = document.getElementById("history");
  if (histEl) {
    histEl.innerHTML = html || "<p>No history yet.</p>";
  }
}

async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`);
    const data = await res.json();
    if (data && data.length > 0) {
      historyData = data;
    } else {
      historyData = getLocalHistory();
    }
  } catch (err) {
    historyData = getLocalHistory();
  }
  renderHistory();
}

function showHistoryItem(index) {
  if (historyData[index] && historyData[index].content) {
    generatedContent = historyData[index].content;
    document.getElementById("topic").value = historyData[index].topic || "";
    parseOutput(generatedContent);
  }
}