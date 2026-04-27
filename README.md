# Ohuhu Colors — versão estática

App client-only que roda 100% no navegador. Pode ser servido por GitHub Pages.

## Estrutura

- `index.html` — shell SPA (hash routing)
- `style.css` — mesmos design tokens do app FastAPI
- `app.js` — toda a lógica (estado, render, router)
- `db.json` — snapshot inicial das cores e kits

## Como funciona o estado

Na primeira visita o `app.js` busca `db.json`, parseia, e salva em
`localStorage` na chave `ohuhu_state_v1`. Depois disso todas as edições
(HEX, preço, cores do kit, criar/desabilitar kit, importar/exportar) vão
direto pro `localStorage` — sem servidor.

Para resetar pro snapshot original, usa o botão **Resetar** em `#/admin`.

## Setup no GitHub Pages

1. Faz commit dessa pasta `docs/` na branch `main`.
2. Em **Settings → Pages**, escolhe:
   - Source: **Deploy from a branch**
   - Branch: `main` / Folder: `/docs`
3. Espera 1–2 minutos. URL vai ser tipo
   `https://<user>.github.io/<repo>/`.

## Atualizar o snapshot inicial

Quando o DB no Pi muda e você quer que novas visitas comecem com o
estado atualizado, roda do diretório raiz do projeto:

```bash
./docs-sync.sh
git add docs/db.json && git commit -m "snapshot db" && git push
```

Visitantes que já têm `localStorage` populado continuam com o estado
deles — só novos visitantes (ou quem clicar em **Resetar** em
`#/admin`) pegam a nova snapshot.

## Diferenças vs. versão FastAPI

- Sem `/admin/check-images` (CORS do CDN bloqueia HEAD do browser).
  O campo `has_image` da snapshot continua respeitado pra filtros.
- Sem ingestor c1..c6 — use o app FastAPI pra fazer o ingest, depois
  atualize o snapshot.
- Tudo o mais (cores, sort, detalhe + picker de pixel, kits +
  edit/criar/desabilitar, compare A vs B com filtros, export/import) é
  paridade.
