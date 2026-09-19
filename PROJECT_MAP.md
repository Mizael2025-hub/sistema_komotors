# PROJECT_MAP — sistema-komotors

> Módulo 1 do sistema "Baterias" (fábrica de baterias de motos). Fonte de verdade do PRD: `prd.md`.

## Stack

- **Monorepo** pnpm workspaces: `apps/web` (Next.js 16 App Router) · `packages/shared` (Zod + tipos de domínio)
- **Backend**: route handlers do Next.js (full-stack, serverless)
- **Banco**: PostgreSQL gerenciado **Supabase** (`sa-east-1`) via Prisma 6
- **Auth**: JWT (jose) — access 15min + refresh 30d com rotação; hash argon2id (`@node-rs/argon2`)
- **UI**: Tailwind CSS 4, PT-BR, mobile-first
- **Deploy**: Vercel (rootDirectory=`apps/web`), CI por push na `main`
- **Nota arquitetural**: Redis/BullMQ do PRD foi substituído por filas no Postgres (pg-boss, futuro); servidor local do PRD foi substituído por Vercel+Supabase (tudo free tier)

## Nomenclatura

- Domínio: PT-BR **sem acentos**, snake_case (`lote_chumbo.qtd_barras`)
- Rotas/infra: inglês (`POST /api/lead-lots`)
- UI/mensagens: português brasileiro com acentos
- Toda tabela com `created_at` / `updated_at`; pesos `Decimal(10,2)` (nunca float)

## Banco (Prisma — `apps/web/prisma/schema.prisma`)

Tabelas: `usuario`, `liga_chumbo`, `setor`, `colaborador`, `modelo_grade`, `polaridade`, `lote_chumbo`, `monte_chumbo`, `movimentacao_chumbo`, `contagem_chumbo`, `log_auditoria`, `notificacao`, `token_refresh`.

Enums: `PerfilUsuario`, `StatusMonte`, `TipoMovimentacao`, `AcaoAuditoria`, `CorLiga`, `Polaridade`, `TipoFornecedor`.

Regras-chave:
- `monte_chumbo` posicionado por `@@unique([lote_id, linha, coluna])`; peso exibido = `peso_real ?? peso_estimado`
- `movimentacao_chumbo` append-only (edições geram novas movimentações); `idempotency_key` única para sync offline
- `log_auditoria` imutável (sem update/delete pela aplicação)

## Fluxos implementados

1. **Login** (`POST /api/auth/login`) → cookies httpOnly (`komotors_access`, `komotors_refresh`) → registro em `token_refresh` → auditoria de login
2. **Refresh com rotação** (`POST /api/auth/refresh`): valida hash no banco, revoga o antigo, cria novo
3. **Logout**: revoga refresh + limpa cookies
4. **RBAC**: `ADMIN` (tudo) e `OPERADOR` (futuro); guardas em `@/lib/auth/sessao` (autorização revalidada no backend)
5. **Configurações** (`/api/config/{ligas|setores|colaboradores|modelos-grade|polaridades}`): CRUD com auditoria, dupla validação (Zod compartilhado), bloqueio de desativação com vínculos
6. **Health**: `/api/health` (sem banco), `/api/health/ready` (com banco)
7. **Chumbo — Entrada** (`POST /api/lead/lots`): lote + montes + movimentações ENTRADA em transação; peso estimado RF-P01; duplicidade de código 409
8. **Chumbo — Estoque/Ações** (`GET /api/lead/stock` sem `liga_id` = todas as ligas em 1 viagem ao banco; `?liga_id=` retrocompatível, `POST /api/lead/actions`, `PATCH /api/lead/piles/[id]`, `PATCH /api/lead/lots/[id]`): saldos RF-S07, reservar/cancelar/mover/venda/editar/reposicionar/redimensionar, reconciliação RF-P02..P07; **multi-monte sempre integral** — peso/barras só com 1 monte selecionado (UI bloqueia e API rejeita com 400); **UI otimista** — ações/reorganizar/expandir aplicam em memória na hora e revalidam em segundo plano (`startTransition`), com reversão a snapshot no erro
9. **Contagem diária** (`GET+POST /api/lead/counts`): apontamentos com **local (setor)**, totais por liga × sistema (estoque+setores), revisão persistente (RF-CT05), resumo de dias (`?resumo=1`) para comparação
10. **Dashboard/Relatórios/Notificações** (`/api/lead/dashboard`, `/api/lead/reports`, `/api/lead/notifications`): métricas com % pesado geral, XLSX/PDF com notificação, sino com badge

## Proteção de rotas

- `src/proxy.ts` (Next 16 — substitui middleware): redireciona para `/login` somente sem access válido **E** sem cookie de refresh — com refresh válido a página carrega e o cliente renova a sessão na 1ª chamada de API (`lib/api/cliente`), evitando logout falso quando só o access (15min) expirou
- APIs verificam sessão em cada rota (`exigirSessao` / `exigirAdmin`)

## Estrutura

```
apps/web/src/
├── app/                  # rotas (App Router)
│   ├── api/              # auth/*, config/*, health*, lead/* (lots, stock, actions, piles, counts, dashboard, reports, notifications)
│   ├── login/            # tela de login
│   ├── chumbo/           # entrada, estoque, contagem (visual do protótipo iOS)
│   ├── dashboard/        # dashboard do chumbo (Recharts)
│   ├── relatorios/       # exportação XLSX/PDF com filtros
│   ├── configuracoes/    # CRUDs base (abas)
│   ├── menu/             # tela "Mais" (análise, menu, sair)
│   └── page.tsx          # / → redirect (dashboard/login)
├── lib/
│   ├── auth/             # jwt, senha, sessão (cookies, rotação, RBAC)
│   ├── api/              # erros padronizados PT-BR + cliente fetch (401 → refresh)
│   ├── chumbo/           # servico.ts — regras de domínio do módulo 1
│   ├── relatorios/       # gerador.ts — XLSX/PDF
│   ├── configuracoes/    # servico + rotas helpers
│   ├── auditoria.ts      # registrarAuditoria (transacional)
│   └── prisma.ts         # singleton PrismaClient
├── components/           # ui (TabBar/FAB/BottomSheet/Toast/corLigaHex), sino, botao-sair
└── proxy.ts              # guarda de rotas
packages/shared/src/      # dominio (enums, cores, dataHojeLocal), auth, configuracoes, chumbo (Zod)
```

## Operações

- **Dev local**: `pnpm dev` (workspace) ou `pnpm --filter web dev`
- **Migrations**: `pnpm --filter web db:migrate -- --name <nome>` (aplica direto no Supabase)
- **Seed**: `pnpm --filter web db:seed` (cria ADMIN via `ADMIN_EMAIL`/`ADMIN_SENHA` do `.env`)
- **Deploy**: commit/push na `main` → Vercel (GitHub connection). Envs na Vercel: `DATABASE_URL`, `JWT_SECRET`
- **Migrations em prod**: ainda locais; automatizar via Vercel cron/CI é pendência

## Sprints (adaptadas à arquitetura Vercel+Supabase) — status

| Sprint (PRD §37) | Status | Notas |
|---|---|---|
| 1 — Fundação do monorepo | ✅ | pnpm workspaces, TS strict, ESLint, `packages/shared` (Zod). Prettier/docs-MKDocs pendentes |
| 2 — Docker local | 🔁 substituída | Deploy direto na Vercel; dev local com `pnpm dev` + Supabase remoto |
| 3 — API base | ✅ | Route handlers Next.js; health/health-ready; erros PT-BR padronizados |
| 4 — Prisma e banco | ✅ | Schema completo Módulo 1 + `token_refresh`; seed ADMIN; Supabase sa-east-1 |
| 5 — Auth e RBAC | ✅ parcial | Login JWT + rotação c/ revogação; guards ADMIN/OPERADOR. **Pendente:** alteração/recuperação de senha |
| 6 — Auditoria | ✅ parcial | `registrarAuditoria` em todas as ops; timeline do monte. **Pendente:** consulta filtrável ADMIN, timeline do lote |
| 7 — Configurações | ✅ | 5 CRUDs c/ auditoria, bloqueio de desativação c/ vínculo |
| 8 — Frontend base | 🔶 parcial | Layout mobile-first. **Pendente:** TanStack Query, RHF, drawer/menu, toasts globais |
| 9 — Chumbo: Entrada | ✅ | Grade 2D expansível, popup por célula, peso estimado RF-P01 |
| 10 — Chumbo: Estoque | ✅ | Saldos RF-S07, chips por liga, cards por lote, grade viva |
| 11 — Chumbo: Ações | ✅ | Reservar/cancelar/mover/venda/editar; append-only; ordem da grade; RF-P04 |
| 12 — Reconciliação | ✅ | RF-P02/P03/P05/P06 com movimentações RECONCILIACAO/AJUSTE |
| 13 — Contagem diária | ✅ | /chumbo/contagem: apontamentos por liga/barras/**local (setor)**/obs, totais com sistema (estoque+setores) + Revisar persistente (RF-CT01..CT05), histórico do dia editável só no dia atual (fuso America/Sao_Paulo); API /api/lead/counts |
| 14 — PWA offline-first | ⬜ pendente | Serwist + Dexie + fila idempotente |
| 15 — Dashboard | ✅ | /dashboard: saldo por liga (stack), entradas×saídas, por setor, divergências de contagem, aging de lotes, % pesado por lote; filtros 7/30/90d + liga; Recharts; API /api/lead/dashboard |
| 16 — Relatórios XLSX/PDF | ✅ parcial | /relatorios + /api/lead/reports: movimentações/saldo/contagens (com coluna Local por setor)/divergências/vendas em XLSX (exceljs) e PDF (pdfmake 0.3 + Roboto); notificação interna ao gerar; fila pg-boss p/ pesados pendente |
| 17 — Notificações internas | ✅ | /api/lead/notifications (listar + marcar lida) + SinoNotificacoes (badge, sheet, link direto); criarNotificacao em relatórios |
| 18–21 — Deploy local/Swarm/Tunnel/scripts | 🔁 substituídas | Vercel + Supabase (CI por push, envs secretas, HTTPS automático) |
| 22 — Hardening final | ⬜ pendente | |

## Log de Execução

- [x] 2026-09-09 — Último passo concluído: **módulo de autenticação + configurações no ar** (login/refresh/logout/me + CRUD de configurações com auditoria; seed ADMIN; testes locais de regressão OK)
- [x] 2026-09-09 — **Sprint Chumbo 1 (iniciada)**: schemas Zod do domínio em `packages/shared/src/chumbo.ts` (entradaLoteSchema com validação de posições da grade, reserva, moverSetor, baixaVenda, edicaoMonte, recorteMonte, redimensionarGrade) — fonte única de validação form/API
- [x] 2026-09-09 — **Serviço de domínio do chumbo** (`apps/web/src/lib/chumbo/servico.ts`): criarEntrada (lote+montes+movimentações ENTRADA em transação, peso estimado RF-P01), estoqueLiga (fórmulas RF-S07 via agregações), reservar/cancelarReserva/moverSetor/baixaVenda (movimentações append-only + auditoria transacional), reconciliarLote (RF-P02..P07 com movimentações RECONCILIACAO/AJUSTE do sistema), editarMonte (RF-M06), reposicionarMonte (drag, revalida ordem derivada), redimensionarLote (RF-S02), historicoMonte (timeline). Erros de domínio = RegraError → 409 em PT-BR
- [x] 2026-09-09 — **Rotas API do chumbo**: `POST /api/lead/lots` (entrada), `GET /api/lead/stock?liga_id` (saldos), `POST /api/lead/actions` (dispatcher reservar/cancelar-reserva/mover-setor/venda), `GET+PATCH /api/lead/piles/[id]` (histórico + edição + reposicionar por drag), `PATCH /api/lead/lots/[id]` (redimensionar grade). Writes restritos a ADMIN
- [x] 2026-09-09 — **UIs do Módulo 1 Chumbo implementadas**: `/chumbo/entrada` (grade 2D botões com popup peso/barras, expansível 1–20 linhas/colunas, resumo antes de salvar) e `/chumbo/estoque` (chips por liga com cor, cards resumo Disponível/No setor/Reservado/Vendido, cards de lote expansíveis, grade viva com status visuais, seleção múltipla, barra de ações fixa, modal de ações — Reservar/Mover ao setor/Baixa-Venda/Editar —, histórico em timeline, drag para reorganizar, clique em vazio limpa seleção)
- [x] 2026-09-10 — **Testes de regressão E2E do módulo chumbo (requests reais contra o Supabase)**: entrada L-TESTE-01 (estimados 333.33 por RF-P01) e L-TESTE-02 (EXTERNO/35 barras 266.67) · saldo disponível 999.99/30 barras (RF-S07 corrigido — bug `Decimal.plus` não mutativo) · reserva → cancelamento → mover parcial (4/10 barras, PARCIAL, peso médio) → mover total (NO_SETOR) → venda parcial (peso real 76.2 informado) → venda total com peso real → **reconciliação RF-P03** recalculou estimados do lote (432.25) · drag/reposicionamento (posição ocupada revalidada) · cancelar reserva (schema próprio sem setor) · timelines corretas · validações 409 em PT-BR para estados inválidos
- [x] 2026-09-10 — **Hardening de ambiente**: virtual store do pnpm movido para fora do OneDrive (`pnpm-workspace.yaml: virtualStoreDir`) — builds locais deixaram de falhar (EPERM do OneDrive em renames de .dll/.next); ORDEM de listagem corrigida para arrayorderBy
- [x] 2026-09-10 — **Último passo concluído: Sprints 1–4 do Módulo 1 (Chumbo) completas** — Entrada de lote (grade 2D), Estoque (cards+grade viva), Ações (reservar/mover/venda/editar/cancelar/reserva), Reconciliação de peso (RF-P01..P07)
- [x] 2026-09-10 — **Incidente resolvido: build de produção falhou** (`9431d16` → deploy ERROR). Causa: `virtualStoreDir` (caminho Windows) comitado no `pnpm-workspace.yaml`; a Vercel gerou o Prisma Client em `./../../C:/Users/...`. Fix (`2e14f9b`): config removida do arquivo versionado e movida para `~/.npmrc` global da máquina local. Deploy READY, estoque/saldos validados em produção
- [x] 2026-09-10 — **Projeto migrado do OneDrive para `C:\Users\Mizael\Projetos-Sistemas\sistema-komotors`** (robocopy /MOVE, git + .vercel + .env intactos; node_modules recriados do cache). Logo depois: configs globais do pnpm de virtual store removidas — Turbopack exige symlinks dentro do projeto; com o projeto fora do OneDrive o padrão funciona sem EPERM. Build e smoke test consistente; sem config de máquina. Work Dir definitivo do projeto
- [x] 2026-09-10 — **Auditoria de sincronização (a pedido)**: Git `main` = `origin/main` (HEAD `044d1d2`); Vercel: últimos 3 deploys READY (chumbo + docs) servindo em https://sistema-komotors.vercel.app — validado por API (`/api/lead/stock` com dados) e HTML; Supabase: banco conectado e schema em dia (health/ready 200). Sprints marcadas com [x] no PRD §37 e tabela de status adicionada aqui
- [x] 2026-09-10 — **Corrigido: menu inicial continuava exibindo Chumbo Entrada/Estoque como "em breve"** (omissão ao implementar as telas — as páginas existiam e funcionavam, apenas não estavam habilitadas no menu). Commit `9abbde3`. Também: cadastros padrão (ligas 6/5/0/4, setores Teleiras/Boleira/Moinho, polaridades) já existiam no banco — relato de "não consigo cadastrar" era a proteção de duplicidade (409) agindo corretamente; itens de teste removidos (desativados) e criação revalidada em produção (201)
- [x] 2026-09-10 — **Qualidade / feedback do usuário** (commit deste deploy): `(1)` TODOS os erros agora trazem `codigo` (ex.: `E_VALIDACAO`, `E_DUPLICADO`, `E_REGLA`, `E_INTERNO_P2024`) + mensagem específica; cliente exibe `[codigo]` junto; falhas de servidor são LOGADAS (`console.error` com stack); traduções de erros Prisma (P2024 pool, P2002 dup, P2025 nf). `(2)` Schema-refs (grade excedida/duplicada antes "Dados invalidos." vazio) mostram os motivos reais. `(3)` Pool do Supabase ampliado `connection_limit=1→5 + pool_timeout=20` (causa provável do 500 relatado — esgotamento de conexões em entrada com muitos montes; confirmado via log da Vercel: POST /api/lead/lots 500 às 12:50 sem stack possível — agora será logado). `(4)` Polaridades REMOVIDAS do CRUD (enum fixo POSITIVO/NEGATIVO por decisão do cliente, RF-C03 atualizado no PRD). `(5)` Modais de ações/histórico com fundo opaco e sombra. `(6)` Overlay "Aplicando operação…" durante ações + indicador de carregamento do estoque ao trocar liga
- [x] 2026-09-16 — **Sprint 13 — Contagem diária completa**: schemas Zod (apontamento/edição/exclusão/revisão) em `packages/shared`; serviço (registrar/editar/excluir apontamento com bloqueio "só hoje", contagemDoDia com sistema por liga = estoque+setores EM_ESTOQUE/RESERVADO/PARCIAL/NO_SETOR, revisarContagem persistindo divergência+revisada_em, tudo auditável); API `GET+POST /api/lead/counts` (dispatcher adicionar/editar/excluir/revisar); UI `/chumbo/contagem` no design iOS (chips de liga coloridos, teclado numérico, card de totais com Revisar, histórico editável, BottomSheet de edição); menu habilitado. E2E validado contra o Supabase
- [x] 2026-09-16 — **TabBar 5 posições + FAB + Sprints 15–17**: TabBar inferior redesign (Dashboard/Estoque/FAB ações rápidas com Entrada+Contagem/posição reservada/Configurações, safe-area bottom); tema via cookie (server lê cookie e seta data-theme — sem script inline, sem flash, fim do erro React do script); Sprint 17 Notificações (criarNotificacao + API + sino com badge/sheet nas headers); Sprint 16 Relatórios (4 relatórios em XLSX exceljs e PDF pdfmake 0.3 via createRequire — api/lead/reports, download datado + notificação + tela com filtros); Sprint 15 Dashboard (api/lead/dashboard: saldo por liga, entradas×saídas, por setor, divergências RF-CT05, aging, % pesado; UI com Recharts + filtros). E2E validado; correção de encoding em massa após scripts com Get-Content/Set-Content
- [x] 2026-09-16 — **Encoding + landing**: respostaJson central (`application/json; charset=utf-8`) em todas as APIs; scan do repo sem U+FFFD/BOM (UTF-8 sem BOM); `<meta charSet="utf-8">` nativo do Next; Supabase UTF8 (sem alteração); Menu movido para `/menu` — `/` agora redireciona: logado → `/dashboard` (nova home), deslogado → `/login`; login client redireciona direto `/dashboard`
- [x] 2026-09-16 — **Encoding definitivo**: detector amplo de mojibake (famílias `Ã`, `Â`, `â`, `ï`) revelou 31 linhas restantes (`â€"`→`—`, `â€¦`→`…`, `â†’`→`→`) no estoque/entrada/contagem/menu/serviço/gerador — reparadas com des-mojibake CP1252 recursivo (sem perda: rejeita camada que gere U+FFFD); repo 100% sem marcas, verificação LIMPA nas 8 telas servidas + banco (ligas/setores/usuarios/movimentações) sem strings corrompidas; APIs com `Content-Type: application/json; charset=utf-8` centralizado em `respostaJson`
- [x] 2026-09-17 — **Visual do protótipo (visual → main `4c2529a`)**: telas estoque/entrada/contagem/mais no design iOS do protótipo (`prototipo-chumbo.html`); TabBar 5+FAB com "Mais" em `/menu`; contagem por local (`setor_id`, migration `20260917100000_contagem_local`); % pesado geral no dashboard; E2E validado
- [x] 2026-09-17 — **Sprint de melhorias (local, branch `melhorias`)**: fix "Usu?rio" no relatório de contagens; **coluna "Local" (breakdown por setor) no relatório de contagens XLSX/PDF**; bloqueio de peso/barras em multi-seleção (UI desabilita + API rejeita 400); datas de negócio em `America/Sao_Paulo` via `dataHojeLocal` no shared (fim do bug 21h–00h em "só hoje"/defaults/revisão/relatório saldo); AJUSTE residual registrado 1× por lote; proxy libera com refresh válido (fim do logout falso após 15min); a11y/UX (Esc + role=dialog no BottomSheet, toast de falha parcial por liga, carga com guarda de sequência); organização (helper `corLigaHex`, dead code removido, `BotaoSair` variante linha, hoists, retornos diretos nos dispatchers); fail-fast `JWT_SECRET` em produção; PRD/PROJECT_MAP atualizados (fornecedor e lote da contagem removidos por decisão do cliente; actionbar substitui duplo clique)
- [x] 2026-09-19 — **Refatoração de desempenho do estoque (Passos A/B/C)**: (A) `estoqueCompleto` — 4 queries em UM `$transaction` batchado (ligas + lotes→montes + `groupBy` das movimentações + setores) matando o N+1 de 5 queries × N ligas por carga; `GET /api/lead/stock` sem parâmetro devolve tudo, `?liga_id=` mantido p/ retrocompat (relatórios usam); (B) tela do estoque com **UI otimista** — patches em memória (status/split PARCIAL com peso proporcional, posição, grade) + revalidação em segundo plano via `startTransition`, sem overlay bloqueante nem recarga total pós-ação, reversão a snapshot no erro; (C) `criarEntrada` com `createManyAndReturn` + 2 `createMany` (montes + movimentações ENTRADA + auditoria em lote JSON-safe) e transação com `timeout: 15s` — elimina o P2028 (antes 3 queries sequenciais × monte estouravam os 5s default com 8 montes)
- [ ] Próximo passo pendente: **Sprint 14 — PWA Offline-First** (Serwist + Dexie + fila idempotente)
