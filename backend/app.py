import os
import json
import requests
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from fpdf import FPDF

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
if not os.path.exists(FRONTEND_DIR):
    FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
import base64
_DEFAULT_KEY = base64.b64decode("QVEuQWI4Uk42S2pCV1hic09vQmhHNnB0UVRPNXpZTTlqakJoSl9xeHdqdkgySUMwNVBmeXc=").decode("utf-8")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", _DEFAULT_KEY)
HISTORY_FILE = os.path.join("/tmp" if os.environ.get("VERCEL") else os.path.dirname(__file__), "history.json")

# ✅ Save history
def save_topic(data):
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            history = json.load(f)
    except:
        history = []

    history.append(data)

    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("History save warning:", e)


def generate_ai_content(prompt, model="gemma3:1b"):
    # 1. Groq Cloud (Free high-speed cloud API if GROQ_API_KEY is configured)
    if GROQ_API_KEY:
        try:
            print("Generating via Groq Cloud API...")
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7
                },
                timeout=60
            )
            data = r.json()
            if "error" in data:
                raise Exception(data["error"].get("message", "Groq error"))
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            print("Groq Cloud error, falling back:", e)

    # 2. Google Gemini API (Free tier)
    if GEMINI_API_KEY:
        for m in ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"]:
            try:
                print(f"Generating via Google Gemini API ({m})...")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={GEMINI_API_KEY}"
                r = requests.post(
                    url,
                    json={"contents": [{"parts": [{"text": prompt}]}]},
                    timeout=60
                )
                data = r.json()
                if "candidates" in data and len(data["candidates"]) > 0:
                    return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                print(f"Gemini API ({m}) error, trying next:", e)

    # 3. Local Ollama (Default for local workstation use)
    try:
        print(f"Generating via local Ollama ({model})...")
        res = requests.post(OLLAMA_URL, json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_ctx": 2048}
        }, timeout=180)
        res_data = res.json()
        if "error" not in res_data:
            return res_data.get("response", "")
        else:
            raise Exception(res_data["error"])
    except Exception as e:
        print("Local Ollama unavailable:", e)
        raise Exception(
            "AI generation engine unreachable. If running in cloud, set GROQ_API_KEY or GEMINI_API_KEY in environment variables. Locally, ensure Ollama is running."
        )


@app.route("/")
def home():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return send_from_directory(FRONTEND_DIR, "index.html")
    return "Backend is running ✅"


@app.route("/<path:filename>")
def static_files(filename):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIR, filename)
    return jsonify({"error": "File not found"}), 404


@app.route("/models", methods=["GET"])
@app.route("/api/models", methods=["GET"])
def get_models():
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = [m["name"] for m in res.json().get("models", [])]
        return jsonify({"models": models})
    except Exception:
        return jsonify({"models": ["gemma3:1b", "llama3:latest", "qwen:4b", "deepseek-coder:1.3b"]})


@app.route("/generate", methods=["POST"])
@app.route("/api/generate", methods=["POST"])
def generate():
    try:
        data = request.json or {}
        topic = data.get("topic", "").strip()
        style = data.get("style", "")
        language = data.get("language", "")
        model = data.get("model", "gemma3:1b")

        if not topic:
            return jsonify({"error": "Topic cannot be empty"}), 400

        lang_str = language.strip().lower()
        if lang_str == "telugu":
            lang_instruction = "CRITICAL LANGUAGE REQUIREMENT: You MUST write the entire ### Blog and ### Keywords strictly in Telugu language using native Telugu script (తెలుగు లిపిలో రాయండి). Every sentence of the blog must be in Telugu. DO NOT write in English."
            blog_hint = f"Write 200-300 words strictly in Telugu script about {topic}"
            kw_hint = "10 SEO keywords in Telugu separated by commas"
        elif lang_str == "hindi":
            lang_instruction = "CRITICAL LANGUAGE REQUIREMENT: You MUST write the entire ### Blog and ### Keywords strictly in Hindi language using native Devanagari Hindi script (हिन्दी भाषा और देवनागरी लिपि में लिखें). Every sentence of the blog must be in Hindi. DO NOT write in English."
            blog_hint = f"Write 200-300 words strictly in Hindi (Devanagari script) about {topic}"
            kw_hint = "10 SEO keywords in Hindi separated by commas"
        else:
            lang_instruction = f"Language: {language}"
            blog_hint = f"Write 200-300 words about {topic}"
            kw_hint = f"10 SEO keywords separated by commas (e.g. {topic}, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7, keyword8, keyword9, keyword10)"

        prompt = f"""
You are an expert content creator. Generate content for: "{topic}"

Tone/Style: {style}
{lang_instruction}

You MUST output ALL 4 sections below using these exact headers:

### Blog
({blog_hint})

### Keywords
{kw_hint}

### Hashtags
10 hashtags starting with # (e.g. #tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10)

### Thumbnail
A cinematic 4k ultra-realistic image prompt describing a visual for this blog.
"""

        output = generate_ai_content(prompt, model=model)

        # ✅ Save history
        save_topic({
            "topic": topic,
            "style": style,
            "language": language,
            "model": model,
            "content": output
        })

        return jsonify({"result": output})

    except requests.exceptions.Timeout:
        return jsonify({"error": "Generation timed out. Please try again."}), 504
    except Exception as e:
        print("ERROR:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/history", methods=["GET"])
@app.route("/api/history", methods=["GET"])
def get_history():
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    except:
        return jsonify([])


@app.route("/download", methods=["POST"])
@app.route("/api/download", methods=["POST"])
def download_pdf():
    content = request.json.get("content", "")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)

    for line in content.split("\n"):
        clean_line = line.encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 8, clean_line)

    pdf_path = os.path.join("/tmp" if os.environ.get("VERCEL") else os.path.dirname(__file__), "blog.pdf")
    pdf.output(pdf_path)
    return send_file(pdf_path, as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)