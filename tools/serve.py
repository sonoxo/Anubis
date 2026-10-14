"""Local preview server for the Waggles demos.

Usage:  python tools/serve.py [port]   (default 8000)
Serves the repository root with caching disabled, so edits show up on reload.
Open http://localhost:8000/ for the gallery or http://localhost:8000/<demo>/ for a demo.
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler) as srv:
        print(f'Serving {ROOT} at http://localhost:{port}/')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
