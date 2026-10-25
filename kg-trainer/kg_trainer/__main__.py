import argparse
from .server import serve

p = argparse.ArgumentParser(prog='python -m kg_trainer', description='Kerning Grouper 学習ツール')
p.add_argument('--port', type=int, default=8765)
p.add_argument('--no-browser', action='store_true', help='ブラウザを自動で開かない')
a = p.parse_args()
serve(a.port, not a.no_browser)
