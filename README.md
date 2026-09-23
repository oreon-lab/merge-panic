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

| Jogador | Mover | Pegar/Soltar | Trabalhar (segurar) | Dash | Comprar (em cima da placa) |
|---|---|---|---|---|---|
| Teclado 1 | WASD | E | Q | Shift esq. | **F** |
| Teclado 2 | IJKL | O | U | H | **P** |
| Teclado 3 | Setas | Shift dir. / . | Ctrl dir. / , | Num0 / / | **Num3** / **;** |
| Controle | Analógico/D-pad | A | X | B / RB | **Y** |
| Mouse (uma mão) | Clique esq. | Botão dir. | Clique esq. segurando | Botão do meio | segurar o esquerdo |

No lobby, cada jogador aperta **Pegar** para entrar (no mouse, o botão direito). **Espaço/Start** começa a sprint. **Esc** pausa.

O esquema de mouse existe pra jogar com **uma mão só**: segure o esquerdo e ele anda até o cursor (o destino trava no clique, senão ele perseguiria a câmera). Se o cursor estiver numa estação, ele vai pro ponto de pé na frente dela e encara — aí é só continuar segurando pra trabalhar.

## Telas e fluxo

```
Abertura → (1ª vez) Fundar empresa → HQ ⇄ painéis → Partida → Resultado (3 passos) → HQ
```

- **HQ**: o escritório 3D da sua empresa é a base. Qualquer um entra no time apertando *Pegar* e pode andar pelas placas de compra. Embaixo fica a dock: **👥 Convidar · ▶ JOGAR · 📖 Ajuda · ⚙️ Ajustes**.
- **Painéis** abrem por cima do HQ com o mesmo layout (cabeçalho, conteúdo, rodapé). **Esc / B** sempre volta.
- **Teclado no HQ**: o movimento é dos jogadores; **Enter** começa a próxima sprint; **Tab** (ou *Select*) foca a dock para navegar com as setas.
- **Resultado** em 3 passos: desempenho → receita da empresa → prêmios do time.

## Progressão (tycoon)

- **Um escritório só, que cresce.** A empresa começa como garagem (2 mesas, 1 teste, 1 review, 1 merge) e expande com **placas de compra** no chão.
- **Placas amarelas**: pise e aperte **Comprar** (F / P / Num3 / Y no controle). Expansões (mesa de dev, agente de IA, esteira de testes, review, merge, café) aparecem na hora com holograma de prévia; melhorias (monitores, CI turbinado, IA v2, Wi-Fi mesh...) mudam o escritório e os números da sprint.
- **Dá pra comprar no meio da sprint** com o dinheiro que ela já rendeu (o servidor aceita até esse valor; o acerto vem no fim — desistir depois de gastar deixa a empresa no vermelho).
- **Sem fases**: cada sprint (#1, #2, #3...) fica mais caótica conforme a empresa sobe de estágio (🏚️ Garagem → 🚀 Startup → 📈 Scale-up → 🦄 Unicórnio → 🏢 Big Tech) — e paga mais.
- **Tudo fica salvo no servidor** (`data/db.json`): o navegador guarda só um id + token anônimo. O código da conta (em ⚙️ Ajustes) leva o progresso para outro navegador.
- No online, a sprint usa a **empresa do host**; cada convidado ganha XP e histórico no próprio perfil.

## Como jogar

1. Pegue um ticket no **📋 Backlog**.
2. Implemente numa **💻 mesa de Dev** (segure *Trabalhar*). Dois devs na mesma mesa = pair programming.
3. Leve aos **🧪 Testes** (automático).
4. Features e projetos passam por **👀 Code Review** — ninguém revisa o próprio código.
5. Entregue no **🔀 Merge** antes do prazo. Entregas rápidas dão gorjeta; tickets tocados por 2+ devs dão bônus de equipe.
6. **🔥 Combo**: entregas em sequência multiplicam tudo — x1.5 → x2 → x2.5 → x3. Deixar um prazo estourar (ou jogar um ticket no lixo) esfria a sequência, e ficar 16 s sem entregar apaga a chama.
7. **⭐ Estrelas**: a barrinha abaixo dos pontos mostra os três limites da sprint (sobem junto com a empresa). Cruzar um deles avisa na hora, então dá pra sentir o "quase lá".

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
