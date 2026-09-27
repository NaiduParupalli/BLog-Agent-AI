const API_BASE = (window.location.port === "3000" || window.location.protocol === "file:") ? "http://localhost:5000" : "";
let generatedContent = "";
let historyData = [];

// 🚀 GENERATE CONTENT
async function generate() {
  const topicInput = document.getElementById("topic");
  const topic = topicInput.value.trim();
  const style = document.getElementById("style").value;
  const language = document.getElementById("language").value;
  const modelSelect = document.getElementById("model");
  const model = modelSelect ? modelSelect.value : "gemma3:1b";

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
  statusMsg.innerText = `🤖 Generating content for "${topic}"... Please wait (~20-30 seconds).`;

  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic, style, language, model })
    });

    const data = await res.json();

    if (data.error) {
      statusMsg.style.color = "#ef4444";
      statusMsg.innerText = `❌ Error: ${data.error}`;
      alert(`Generation Error: ${data.error}`);
      return;
    }

    if (!data.result) {
      statusMsg.style.color = "#ef4444";
      statusMsg.innerText = "❌ No content received from model.";
      alert("No content received from AI.");
      return;
    }

    generatedContent = data.result;
    parseOutput(generatedContent);
    statusMsg.style.color = "#10b981";
    statusMsg.innerText = "✅ Generated successfully!";

  } catch (error) {
    console.error("FETCH ERROR:", error);
    statusMsg.style.color = "#ef4444";
    statusMsg.innerText = "❌ Backend not reachable. Ensure Flask backend is running.";
    alert("Backend not reachable. Please check backend status.");
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

  // If content contains Indic scripts (Telugu, Hindi, etc.), download as UTF-8 document
  // so characters render perfectly and are not corrupted by latin-1 PDF generators
  const hasIndic = /[\u0900-\u0D7F]/.test(generatedContent);
  if (hasIndic) {
    const blob = new Blob([generatedContent], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blog-content.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: generatedContent })
    });

    if (!res.ok) {
      alert("Failed to generate PDF");
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "content.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("PDF Download error:", err);
    alert("Failed to download PDF.");
  }
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

// 📂 HISTORY (SAFE VERSION)
async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`);
    const data = await res.json();
    historyData = data;

    let html = "";
    data.slice().reverse().forEach((item, index) => {
      const realIndex = data.length - 1 - index;
      html += `<p style="cursor:pointer; padding:6px 8px; border-radius:4px; margin:4px 0; background:rgba(255,255,255,0.05);" onclick="showHistoryItem(${realIndex})" title="Click to view">🔥 ${item.topic}</p>`;
    });

    document.getElementById("history").innerHTML = html || "<p>No history yet.</p>";
  } catch (err) {
    console.log("History load error:", err);
  }
}

function showHistoryItem(index) {
  if (historyData[index] && historyData[index].content) {
    generatedContent = historyData[index].content;
    document.getElementById("topic").value = historyData[index].topic || "";
    parseOutput(generatedContent);
  }
}