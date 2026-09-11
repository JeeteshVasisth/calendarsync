"""
Flame Calendar to Google Calendar Sync - Local Server
Serves the web application at http://localhost:8000 and handles configuration API.
"""

import http.server
import json
import os
import sys
import urllib.request
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(DIRECTORY, "config.json")

def load_config():
    config = {
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "gemini_api_key": os.environ.get("GEMINI_API_KEY", "")
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if not config["google_client_id"] and saved.get("google_client_id"):
                    config["google_client_id"] = saved["google_client_id"]
                if not config["gemini_api_key"] and saved.get("gemini_api_key"):
                    config["gemini_api_key"] = saved["gemini_api_key"]
        except Exception as e:
            print(f"Warning loading config.json: {e}")
    return config

def save_config(new_data):
    current = load_config()
    current.update(new_data)
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving config.json: {e}")
        return False

class FlameRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/config':
            cfg = load_config()
            resp = {
                "google_client_id": cfg.get("google_client_id", ""),
                "has_gemini": bool(cfg.get("gemini_api_key", ""))
            }
            body = json.dumps(resp).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def do_POST(self):
        if self.path == '/api/config':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            try:
                data = json.loads(post_body.decode('utf-8'))
                save_config({
                    "google_client_id": data.get("google_client_id", ""),
                    "gemini_api_key": data.get("gemini_api_key", "")
                })
                resp = {"status": "ok", "message": "Config updated"}
                code = 200
            except Exception as e:
                resp = {"status": "error", "message": str(e)}
                code = 400

            body = json.dumps(resp).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        elif self.path == '/api/ocr':
            # Expect JSON payload with base64-encoded image data
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            try:
                data = json.loads(post_body.decode('utf-8'))
                b64_image = data.get('image')
                mime_type = data.get('mimeType', 'image/png')
                if not b64_image:
                    raise ValueError('Missing image data')
                # Load Gemini API key
                api_key = load_config().get('gemini_api_key')
                if not api_key:
                    raise ValueError('Gemini API key not configured')
                gemini_url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={api_key}'
                prompt = (
                    "You are a timetable parser. Look at this university schedule screenshot carefully. "
                    "Extract ALL the classes shown and return ONLY a raw JSON object (no markdown, no code fences, no explanation). "
                    "The JSON must have these exact fields: "
                    "dateText (string, the date shown e.g. 'Thursday, September 3'), "
                    "targetDate (string, YYYY-MM-DD format), "
                    "events (array of objects, each with: courseCode, courseTitle, instructor, startTime, endTime, location). "
                    "Return ONLY the JSON object, nothing else."
                )
                gemini_payload = {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"inline_data": {"mime_type": mime_type, "data": b64_image}},
                                {"text": prompt}
                            ]
                        }
                    ]
                }
                req = urllib.request.Request(gemini_url, data=json.dumps(gemini_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req) as resp:
                    resp_body = resp.read().decode('utf-8')
                gemini_resp = json.loads(resp_body)
                candidates = gemini_resp.get('candidates', [])
                if not candidates:
                    raise ValueError('No candidates in Gemini response: ' + resp_body[:300])
                text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                # Strip markdown code fences if Gemini wraps the JSON
                text = text.strip()
                if text.startswith('```'):
                    text = text.split('\n', 1)[-1]  # remove opening fence line
                if text.endswith('```'):
                    text = text.rsplit('```', 1)[0]  # remove closing fence
                text = text.strip()
                result = json.loads(text)
                response_body = json.dumps({"status": "ok", "result": result}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
                return
            except Exception as e:
                import traceback
                traceback.print_exc()
                err_body = json.dumps({"status": "error", "message": str(e)}).encode('utf-8')
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(err_body)))
                self.end_headers()
                self.wfile.write(err_body)
                return

        self.send_response(404)
        self.end_headers()

def main():
    os.chdir(DIRECTORY)
    with http.server.ThreadingHTTPServer(("", PORT), FlameRequestHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 65)
        print(f"  Flame University Timetable -> Google Calendar Sync")
        print("=" * 65)
        print(f"  Web application running at: {url}")
        print(f"  Project Directory: {DIRECTORY}")
        print("-" * 65)
        print("  Features:")
        print("   - One-Click 'Sign in with Google' authentication")
        print("   - Direct Google Calendar API sync")
        print("   - Instant .ICS Google Calendar Import link")
        print("   - Zero-config OCR & Flame layout parser")
        print("=" * 65)
        print("  Press Ctrl+C to stop the server.\n")

        if "--open" in sys.argv:
            try:
                webbrowser.open(url)
            except Exception:
                pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == "__main__":
    main()
