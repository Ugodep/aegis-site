#!/usr/bin/env python3
# Serveur local sans cache : le navigateur recharge toujours la dernière version.
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f"AEGIS -> http://localhost:{port}")
ThreadingHTTPServer(("", port), H).serve_forever()
