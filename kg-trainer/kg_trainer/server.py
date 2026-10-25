"""Local web server: serves the GUI and a small JSON API. Listens on 127.0.0.1 only."""
import json, os, threading, traceback, urllib.parse, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from .project import Project

STATIC = os.path.abspath(os.path.join(os.path.dirname(__file__), 'static'))
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}


def make_handler(project):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def send(self, code, body, ctype='application/json; charset=utf-8', extra=None):
            data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def body(self):
            n = int(self.headers.get('Content-Length') or 0)
            return self.rfile.read(n) if n else b''

        def json(self):
            raw = self.body()
            return json.loads(raw or b'{}')

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            q = dict(urllib.parse.parse_qsl(u.query))
            try:
                if u.path in ('/', '/index.html'):
                    return self.static('index.html')
                if u.path.startswith('/static/'):
                    return self.static(u.path[len('/static/'):])
                if u.path == '/api/state':
                    return self.send(200, project.state())
                if u.path == '/api/result':
                    return self.send(200, project.result or {})
                if u.path == '/api/pair':
                    svg = project.pair_svg(q['font'], int(q['a']), int(q['b']), float(q['pro']), float(q['ours']))
                    return self.send(200, svg, 'image/svg+xml')
                if u.path == '/api/valuemodel':
                    from .build_value_model import as_module
                    if not project.value:
                        raise ValueError('先に値の補正モデルを学習してください。')
                    return self.send(200, as_module(project.value), 'text/javascript; charset=utf-8',
                                     {'Content-Disposition': "attachment; filename=kern-model.js"})
                if u.path == '/api/package':
                    pkg = project.package(q.get('name', 'model'))
                    fn = urllib.parse.quote((q.get('name') or 'model') + '.kgmodel.json')
                    return self.send(200, json.dumps(pkg, ensure_ascii=False, indent=1), 'application/json; charset=utf-8',
                                     {'Content-Disposition': f"attachment; filename*=UTF-8''{fn}"})
                self.send(404, {'error': 'not found'})
            except Exception as e:
                self.send(400, {'error': str(e)})

        def do_POST(self):
            u = urllib.parse.urlparse(self.path)
            try:
                if u.path == '/api/fonts':
                    name = urllib.parse.unquote(self.headers.get('X-Filename') or 'font.otf')
                    key = project.add_font(name, self.body())
                    return self.send(200, {'key': key, **project.state()})
                if u.path.startswith('/api/fonts/'):
                    key, _, action = u.path[len('/api/fonts/'):].partition('/')
                    if action == 'remove':
                        project.remove_font(key)
                    else:
                        data = self.json()
                        for f in project.fonts:
                            if f['key'] == key:
                                if 'license' in data:
                                    f['license'] = str(data['license'])[:200]
                                if 'use' in data:
                                    f['use'] = bool(data['use'])
                                    project.result = None; project.value = None
                    return self.send(200, project.state())
                if u.path == '/api/settings':
                    data = self.json()
                    if 'chars' in data:
                        project.chars = str(data['chars'])[:5000]
                    if 'references' in data:
                        project.references = str(data['references'])[:300]
                    if 'minimum' in data:
                        project.minimum = max(0, min(200, float(data['minimum'])))
                    project._invalidate()
                    return self.send(200, project.state())
                if u.path == '/api/valuemodel':
                    if project.progress['busy']:
                        return self.send(409, {'error': '実行中です。'})
                    def work_v():
                        try:
                            project.value_model()
                        except Exception as e:
                            project.progress.update(label='エラー：' + str(e), value=0)
                    project.progress.update(busy=True, label='開始', value=0)
                    threading.Thread(target=work_v, daemon=True).start()
                    return self.send(200, {'started': True})
                if u.path == '/api/run':
                    if project.progress['busy']:
                        return self.send(409, {'error': '実行中です。'})
                    def work():
                        try:
                            project.run()
                        except Exception as e:
                            project.progress.update(label='エラー：' + str(e), value=0)
                            traceback.print_exc()
                    project.progress.update(busy=True, label='開始', value=0)
                    threading.Thread(target=work, daemon=True).start()
                    return self.send(200, {'started': True})
                self.send(404, {'error': 'not found'})
            except Exception as e:
                self.send(400, {'error': str(e)})

        def static(self, name):
            path = os.path.normpath(os.path.join(STATIC, name))
            if not path.startswith(STATIC) or not os.path.isfile(path):
                return self.send(404, {'error': 'not found'})
            with open(path, 'rb') as fh:
                self.send(200, fh.read(), TYPES.get(os.path.splitext(path)[1], 'application/octet-stream'))

    return Handler


def make_server(port=8765, project=None):
    """The server, not yet running. port=0 picks a free port."""
    return ThreadingHTTPServer(('127.0.0.1', port), make_handler(project or Project()))


def serve(port=8765, open_browser=True, project=None):
    try:
        httpd = make_server(port, project)
    except OSError:
        print(f'ポート {port} は使用中です。空いているポートで起動します。')
        httpd = make_server(0, project)
    url = f'http://127.0.0.1:{httpd.server_address[1]}/'
    print(f'Kerning Grouper 学習ツール: {url}  （終了は Ctrl+C）')
    if open_browser:
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return httpd
