exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        google_client_id: process.env.GOOGLE_CLIENT_ID || "",
        has_gemini: !!process.env.GEMINI_API_KEY
      })
    };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
