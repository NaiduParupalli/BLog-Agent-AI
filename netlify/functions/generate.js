exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" }) 
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const topic = (data.topic || "").trim();
    const style = data.style || "Informative";
    const language = (data.language || "English").trim();

    if (!topic) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Topic cannot be empty" }),
      };
    }

    const langLower = language.toLowerCase();
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

    const prompt = `You are an expert content creator. Generate content for: "${topic}"

Tone/Style: ${style}
${langInstruction}

You MUST output ALL 4 sections below using these exact headers:

### Blog
(${blogHint})

### Keywords
{kwHint}

### Hashtags
10 hashtags starting with # (e.g. #tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10)

### Thumbnail
A cinematic 4k ultra-realistic image prompt describing a visual for this blog.`;

    const groqKey = process.env.GROQ_API_KEY || data.groq_api_key;
    const geminiKey = process.env.GEMINI_API_KEY || data.gemini_api_key;

    let result = "";

    // 1. Try Groq Cloud if configured
    if (groqKey) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
          })
        });
        const groqData = await groqRes.json();
        if (groqData.choices && groqData.choices[0]) {
          result = groqData.choices[0].message.content;
        }
      } catch (err) {
        console.error("Groq Cloud error:", err);
      }
    }

    // 2. Try Google Gemini if configured
    if (!result && geminiKey) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        const geminiData = await geminiRes.json();
        if (geminiData.candidates && geminiData.candidates[0]) {
          result = geminiData.candidates[0].content.parts[0].text;
        }
      } catch (err) {
        console.error("Gemini API error:", err);
      }
    }

    if (!result) {
      if (!groqKey && !geminiKey) {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "No cloud AI API key configured. In Netlify Site Settings > Environment Variables, please add GEMINI_API_KEY (from aistudio.google.com) or GROQ_API_KEY (from console.groq.com)."
          }),
        };
      }
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Cloud AI failed to return content. Check your API key or try again." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ result }),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
