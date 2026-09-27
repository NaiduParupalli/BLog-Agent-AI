exports.handler = async function (event, context) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ models: ["gemini-1.5-flash", "llama-3.3-70b-versatile", "gemma3:1b"] }),
  };
};
