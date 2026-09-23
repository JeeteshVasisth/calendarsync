exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: "Gemini API key not configured" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: "Invalid JSON body" })
    };
  }

  const { image, mimeType = "image/png" } = body;
  if (!image) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: "Missing image data" })
    };
  }

  const prompt =
    "You are a timetable parser. Look at this university schedule screenshot carefully. " +
    "Extract ALL the classes shown and return ONLY a raw JSON object (no markdown, no code fences, no explanation). " +
    "The JSON must have these exact fields: " +
    "dateText (string, the full date shown in the image e.g. 'Thursday, September 3'. If NO date or day is visible in the image, return empty string \"\"), " +
    "targetDate (string, YYYY-MM-DD format if a date is shown in the image. If NO date is visible in the image, return empty string \"\"), " +
    "events (array of objects each with: courseCode, courseTitle, instructor, startTime (12h e.g. '8:00 AM'), endTime, location). " +
    "Do NOT hallucinate or guess a day or date if it is not clearly written in the screenshot. Return ONLY the JSON object, nothing else.";

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

  const geminiPayload = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType, data: image } },
        { text: prompt }
      ]
    }]
  };

  try {
    const resp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    const geminiResp = await resp.json();
    const candidates = geminiResp.candidates || [];

    if (!candidates.length) {
      throw new Error("No candidates in Gemini response: " + JSON.stringify(geminiResp).slice(0, 300));
    }

    let text = candidates[0]?.content?.parts?.[0]?.text || "";
    text = text.trim();
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    const result = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", result })
    };
  } catch (err) {
    console.error("[OCR function error]", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: err.message || "OCR failed" })
    };
  }
};
