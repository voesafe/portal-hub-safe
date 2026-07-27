#!/usr/bin/env bash
# Sobe o Hub localmente para conferir a interface antes de publicar.
#
# O frontend chama o Apps Script de PRODUÇÃO direto do navegador: o web app
# responde `Access-Control-Allow-Origin: *`, e o POST usa `text/plain` de
# propósito, que evita o preflight do CORS. Ou seja, rodando aqui você entra
# com o seu login de verdade e vê os dados de verdade, com o código que ainda
# não subiu.
#
# ⚠️ O backend é o de produção. Ler é seguro; SALVAR é real. Se for testar
#    escrita, use um registro descartável.
#
# Uso:
#   ./tools/preview.sh              sobe e segura o terminal (Ctrl+C encerra)
#   ./tools/preview.sh --fundo      sobe e devolve o terminal (não morre ao fechar)
#   ./tools/preview.sh --parar      encerra o que estiver rodando
#   ./tools/preview.sh 8081         escolhe outra porta

set -uo pipefail

PORTA=8080
FUNDO=0
PARAR=0
for arg in "$@"; do
  case "$arg" in
    --fundo|-f)  FUNDO=1 ;;
    --parar|-p)  PARAR=1 ;;
    [0-9]*)      PORTA="$arg" ;;
    *) echo "opção desconhecida: $arg"; exit 1 ;;
  esac
done

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/safe-hub-preview-$PORTA.log"

parar_porta() {
  local pids
  pids="$(lsof -ti tcp:"$PORTA" 2>/dev/null || true)"
  [ -n "$pids" ] && { echo "$pids" | xargs kill 2>/dev/null || true; sleep 1; return 0; }
  return 1
}

if [ "$PARAR" = 1 ]; then
  parar_porta && echo "Servidor da porta $PORTA encerrado." || echo "Não havia nada rodando na porta $PORTA."
  exit 0
fi

parar_porta && echo "A porta $PORTA estava ocupada; encerrei o que estava lá."

cd "$RAIZ"

# DOIS sockets de laço local, um por pilha, de propósito.
#
# O `python3 -m http.server --bind 127.0.0.1` escuta só em IPv4, e neste Mac o
# nome `localhost` resolve para `::1` (IPv6) ANTES do IPv4: o navegador tentava
# o IPv6, batia em porta fechada e a página não abria, com o servidor no ar.
#
# ⚠️ Não adianta um socket IPv6 com `IPV6_V6ONLY` desligado: esse mapeamento só
#    vale quando o bind é em `::` (qualquer endereço), o que abriria o servidor
#    para a rede toda. Ligado a `::1` ele atende apenas IPv6 (medido). Por isso
#    são dois: `127.0.0.1` e `::1`, ambos presos ao laço local.
python3 - "$PORTA" <<'PY' >"$LOG" 2>&1 &
import http.server, socket, socketserver, sys, threading

class Handler(http.server.SimpleHTTPRequestHandler):
    # Sem cache: conferir UI com o navegador servindo arquivo velho é
    # perda de tempo pura, e o `?v=` já resolve isso em produção.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

class IPv4(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

class IPv6(IPv4):
    address_family = socket.AF_INET6

porta = int(sys.argv[1])
servidores = [IPv4(('127.0.0.1', porta), Handler)]
try:
    servidores.append(IPv6(('::1', porta), Handler))
except OSError:
    pass  # máquina sem IPv6: o IPv4 sozinho já serve

for s in servidores[1:]:
    threading.Thread(target=s.serve_forever, daemon=True).start()
servidores[0].serve_forever()
PY
SERVIDOR=$!

for _ in $(seq 1 25); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORTA/index.html" && break
  sleep 0.2
done

if ! curl -sf -o /dev/null "http://127.0.0.1:$PORTA/index.html"; then
  echo "Não consegui subir o servidor na porta $PORTA. Log em $LOG:"
  tail -5 "$LOG" 2>/dev/null
  kill "$SERVIDOR" 2>/dev/null || true
  exit 1
fi

URL="http://localhost:$PORTA/index.html"
echo
echo "  SAFE Hub no ar:  $URL"
echo "                   http://127.0.0.1:$PORTA/index.html"
echo
echo "  Entre com o seu login normal: os dados vêm do backend de produção."
echo "  O modo escuro fica no menu do avatar, no canto superior direito."
echo
echo "  ⚠️  Salvar aqui salva de verdade. Para só conferir a interface, navegue sem gravar."
echo

command -v open >/dev/null 2>&1 && open "$URL" || true

if [ "$FUNDO" = 1 ]; then
  disown "$SERVIDOR" 2>/dev/null || true
  echo "  Rodando em segundo plano (PID $SERVIDOR)."
  echo "  Para encerrar:  ./tools/preview.sh --parar"
  echo
  exit 0
fi

echo "  Ctrl+C encerra."
echo
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT INT TERM
wait "$SERVIDOR"
