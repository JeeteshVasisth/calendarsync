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

  // Put responsive models first. gemini-3.5-flash is currently fast and active.
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
  const geminiPayload = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType, data: image } },
        { text: prompt }
      ]
    }]
  };

  let lastError = null;

  for (const model of models) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      console.log(`[OCR Serverless] Calling model: ${model}`);

      // Abort each request after 6.5s to fit within Netlify's 10s execution limit
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      let resp;
      try {
        resp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const geminiResp = await resp.json();

      // Check if this model returned an error (like 503 high demand, rate limit, etc.)
      if (geminiResp.error) {
        throw new Error(`${model} error ${geminiResp.error.code}: ${geminiResp.error.message}`);
      }

      const candidates = geminiResp.candidates || [];
      if (!candidates.length) {
        throw new Error(`No candidates in ${model} response: ` + JSON.stringify(geminiResp).slice(0, 300));
      }

      let text = candidates[0]?.content?.parts?.[0]?.text || "";
      text = text.trim();
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

      const result = JSON.parse(text);
      console.log(`[OCR Serverless] Successfully parsed timetable using ${model}`);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ok", result, modelUsed: model })
      };
    } catch (err) {
      console.warn(`[OCR Serverless] Fallback from ${model}:`, err.message);
      lastError = err;
      // Continue to next model in the fallback array
    }
  }

  console.error("[OCR function error - all models failed]", lastError);
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "error", message: lastError ? lastError.message : "OCR failed on all models" })
  };
};
