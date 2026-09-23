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
| Mouse (uma mão) | Clique esq. | Botão dir. | Clique esq. segurando | Botão do meio |

No lobby, cada jogador aperta **Pegar** para entrar (no mouse, o botão direito). **Espaço/Start** começa a sprint. **Esc** pausa.

O esquema de mouse existe pra jogar com **uma mão só**: segure o esquerdo e ele anda até o cursor (o destino trava no clique, senão ele perseguiria a câmera). Se o cursor estiver numa estação, ele vai pro ponto de pé na frente dela e encara — aí é só continuar segurando pra trabalhar.

## Como jogar

1. Pegue um ticket no **📋 Backlog**.
2. Implemente numa **💻 mesa de Dev** (segure *Trabalhar*). Dois devs na mesma mesa = pair programming.
3. Leve aos **🧪 Testes** (automático).
4. Features e projetos passam por **👀 Code Review** — ninguém revisa o próprio código.
5. Entregue no **🔀 Merge** antes do prazo. Entregas rápidas dão gorjeta; tickets tocados por 2+ devs dão bônus de equipe.
6. **🔥 Combo**: entregas em sequência multiplicam tudo — x1.5 → x2 → x2.5 → x3. Deixar um prazo estourar (ou jogar um ticket no lixo) esfria a sequência, e ficar 16 s sem entregar apaga a chama.
7. **⭐ Estrelas**: a barrinha abaixo dos pontos mostra os três limites da sprint (o card do lobby diz quais são). Cruzar um deles avisa na hora, então dá pra sentir o "quase lá".

## Progressão

Cada sprint tem 3 estrelas. Tirar **pelo menos 1** libera a seguinte, e o jogo volta na fase mais nova quando você abre de novo. O card do lobby mostra o seletor (`◀ ▶`, ou as teclas `[` e `]`), os limites de estrela da fase e o seu melhor ali.

| Fase | Tema | O que muda |
|---|---|---|
| ⭐ **Sprint 1 — Primeiro Dia** | onboarding | 20 demandas, caos começa aos 45 s, 4 mesas e 2 IAs |
| ⭐⭐ **Sprint 2 — Era da IA** | mais volume | 24 demandas, 3 agentes de IA (e mais propensos a bug), só 1 merge, uma mesa a menos |
| ⭐⭐⭐ **Sprint 3 — Deploy na Sexta** | caos máximo | 26 demandas, demanda a cada 9-14 s, caos desde os 25 s, mais conflitos e bugs escapando |

Os limites de estrela de cada fase saem de um modelo que espelha a pontuação real (gorjeta + combo), por perfil de jogador: 1★ no p10 do casual, 2★ no do bom, 3★ no do excelente.

O recorde, as estrelas acumuladas, a fase liberada e o som ficam salvos no navegador (`localStorage`). A tela de título mostra seu melhor resultado e o lobby guarda o melhor de cada fase.

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

## Bênçãos (o caos também dá trégua)

Sorteios que ajudam o time, pra curva não ser só de descida. Cada uma avisa em banner e fica na pílula do HUD enquanto durar.

| Evento | O que acontece |
|---|---|
| 💛 **Deploy dourado** | Todo merge vale **o dobro** por 15 s |
| ⚡ **Cache quente** | As mesas de Dev rendem **o dobro** por 12 s (acumula com pair programming) |
| 🧑‍🎓 **Estagiário** | Fecha de graça a etapa de um ticket que está em andamento |

## Estrutura

- `src/main.js` — renderer, câmera isométrica, fluxo lobby → partida → resultados
- `src/game.js` — regras da partida (pedidos, estações, pontuação)
- `src/world.js` / `src/levels.js` — mapa em ASCII → cenário 3D
- `src/models.js` — modelos procedurais (devs, estações, tickets)
- `src/player.js` — movimento, colisão e animações
- `src/ui.js` / `src/style.css` — HUD, cards de pedidos, telas
- `src/net.js` — cliente WebSocket (criar/entrar em sala)
- `src/save.js` — persistência local (recorde, estrelas, som)
- `server/relay.js` — relay de salas (plugin do Vite em dev; `server/prod.js` em produção)
- `src/input.js`, `src/audio.js`, `src/fx.js`, `src/debug.js`
