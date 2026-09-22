# Merge Panic 🔀

Jogo cooperativo 3D (Three.js + Vite) para até 4 jogadores locais — um Overcooked dentro de um escritório de devs.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5199.

## Multiplayer online

1. Rode `npm run dev` (ou `npm run serve` para o build de produção). Os dois servem o jogo e o relay WebSocket (`/mp`) na porta 5199.
2. Exponha a porta: `ngrok http 5199`.
3. No lobby, clique **➕ Criar sala** e mande o link (`...?sala=ABCD`) pros amigos. Também dá para digitar o código.
4. Cada PC aperta **Pegar** para colocar seus jogadores (até 4 no total, somando todos os PCs). Só o host inicia, pausa e reinicia.

Como funciona: o navegador do host roda a simulação. Os clientes movem o próprio personagem localmente (sem latência), mandam posição e ações para o host e recebem snapshots do estado a 20 Hz. O servidor Node só repassa mensagens entre as salas.

## Controles

| Jogador | Mover | Pegar/Soltar | Trabalhar (segurar) | Dash |
|---|---|---|---|---|
| Teclado 1 | WASD | E | Q | Shift esq. |
| Teclado 2 | IJKL | O | U | H |
| Teclado 3 | Setas | Shift dir. / . | Ctrl dir. / , | Num0 / ; |
| Controle | Analógico/D-pad | A | X | B / RB |

No lobby, cada jogador aperta **Pegar** para entrar. **Espaço/Start** começa a sprint. **Esc** pausa (R reinicia).

## Como jogar

1. Pegue um ticket no **📋 Backlog**.
2. Implemente numa **💻 mesa de Dev** (segure *Trabalhar*). Dois devs na mesma mesa = pair programming.
3. Leve aos **🧪 Testes** (automático).
4. Features e projetos passam por **👀 Code Review** — ninguém revisa o próprio código.
5. Entregue no **🔀 Merge** antes do prazo. Entregas rápidas dão gorjeta; tickets tocados por 2+ devs dão bônus de equipe.

## Caos (o que pode dar errado)

| Evento | O que acontece | Como resolver |
|---|---|---|
| 🤖 **Agente de IA** | Implementa/corrige sozinho e rápido, mas às vezes deixa um bug escondido | Revise e teste bem 😅 |
| ❌ **Testes falham** | Ticket com bug ganha uma etapa 🔧 *Corrigir* | Corrija numa mesa de Dev (ou na IA) e teste de novo |
| 📝 **Changes requested** | O review devolve o ticket uma vez com um "nit" | Corrija e mande pro review de novo |
| ⚔️ **Conflito de merge** | Merge trava (mais chance se outro merge acabou de acontecer) | Segure *Trabalhar* no Merge |
| 🚨 **Bug em produção** | Bug que passou nos testes vira Hotfix urgente; pontos escorrem até resolver | Hotfix fura a fila do backlog |
| 🤖💥 **IA alucinando** | Agente trava e estraga o ticket que estava nele | Segure *Trabalhar* nele para reiniciar |
| 📶 **Wi-Fi caiu** | IA e testes param | Reinicie o roteador |
| 📅 **Reunião surpresa** | Um dev fica preso numa reunião por alguns segundos | O resto do time cobre |

Dev sozinho às vezes deixa bug; **pair programming nunca deixa**.

## Estrutura

- `src/main.js` — renderer, câmera isométrica, fluxo lobby → partida → resultados
- `src/game.js` — regras da partida (pedidos, estações, pontuação)
- `src/world.js` / `src/levels.js` — mapa em ASCII → cenário 3D
- `src/models.js` — modelos procedurais (devs, estações, tickets)
- `src/player.js` — movimento, colisão e animações
- `src/ui.js` / `src/style.css` — HUD, cards de pedidos, telas
- `src/net.js` — cliente WebSocket (criar/entrar em sala)
- `server/relay.js` — relay de salas (plugin do Vite em dev; `server/prod.js` em produção)
- `src/input.js`, `src/audio.js`, `src/fx.js`, `src/debug.js`
