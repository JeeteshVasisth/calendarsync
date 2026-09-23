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
    "You are an expert university schedule and timetable parser. Look at this schedule screenshot carefully. " +
    "The screenshot may show a single day OR a weekly calendar grid with multiple day columns (e.g. Mon, Tue, Wed, Thu, Fri, Sat, Sun). " +
    "Extract ALL classes shown across all columns or days. " +
    "Return ONLY a raw JSON object (no markdown, no code fences, no commentary) with this structure: " +
    "{" +
    "  \"dateText\": string (if the screenshot is for a single day, the date string e.g. 'Thursday, September 3'; if multi-day or not visible, return ''), " +
    "  \"targetDate\": string (YYYY-MM-DD if a single date is shown, else ''), " +
    "  \"events\": [ " +
    "    { " +
    "      \"dayName\": string ('Sunday'|'Monday'|'Tuesday'|'Wednesday'|'Thursday'|'Friday'|'Saturday' - the day of the week this class belongs to from the column header or day section), " +
    "      \"dateText\": string (the date/day text shown for this specific day column e.g. 'Wed 9/23', or empty string), " +
    "      \"courseCode\": string (e.g. 'PUBP207_UGSEM3'), " +
    "      \"courseTitle\": string (e.g. 'Principles of Music' or empty string), " +
    "      \"instructor\": string (e.g. 'Dr. Juhi Sidharth'), " +
    "      \"startTime\": string (12h format e.g. '10:00 AM'), " +
    "      \"endTime\": string (12h format e.g. '10:55 AM'), " +
    "      \"location\": string (classroom e.g. 'APJ Abdul Kalam 102' or empty string) " +
    "    } " +
    "  ] " +
    "}";

  // Put responsive models first. gemini-3.5-flash is currently fast and active.
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

  let lastError = null;

  for (const model of models) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      console.log(`[OCR Serverless] Calling model: ${model}`);

      // gemini-3.5-flash supports thinkingConfig (budget 0 = 3s response); lite models do not accept thinkingConfig
      const payload = {
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: image } },
            { text: prompt }
          ]
        }]
      };

      if (model === 'gemini-3.5-flash') {
        payload.generationConfig = {
          thinkingConfig: {
            thinkingBudget: 0
          }
        };
      }

      // Abort each request after 24s to ensure response completes within Netlify's 26s execution limit
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 24000);

      let resp;
      try {
        resp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
