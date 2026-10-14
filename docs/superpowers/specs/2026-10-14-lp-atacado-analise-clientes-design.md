# LP de Atacado (OKEY / Lov Club) e ferramenta "Análise de Clientes"

Data: 2026-10-14 · Status: aprovado para execução

## 1. O que é

Duas entregas ligadas por um link:

1. **Landing page de captação de revendedor**, pública, uma por marca. Fase 1:
   OKEY. Fase 2: Lov Club. Formulário de 18 perguntas em 4 seções, mais as
   seções institucionais e o FAQ.
2. **Análise de Clientes**, ferramenta interna no módulo Vendas, onde a
   vendedora de atacado avalia os cadastros que chegaram pelo link dela.

O link é parametrizado por vendedora: quem compartilha recebe na própria fila.

**Não é** cadastro de cliente. Aprovar aqui não cria `Customer` — a adesão
comercial continua acontecendo fora, pelas telas que já existem. Isto é
triagem de candidatura, e o registro serve a análise posterior pela Gestão.

**Fonte de verdade do conteúdo:** a planilha `Database - LP Atacado (OKEY & Lov
Club).xlsx`, seis abas. Onde a especificação escrita e a planilha divergirem, a
planilha vence (ver decisão 6). O conteúdo literal está transcrito no anexo A
desta spec, porque a planilha vive fora do repositório.

## 2. Decisões

Cada linha é uma pendência, com a decisão tomada e o motivo. São elas que
governam o código; divergência entre código e esta tabela é defeito.

| # | Pendência | Decisão | Motivo |
|---|---|---|---|
| 1 | Onde a LP vive | **Mesmo app**, grupo de rotas público em `/atacado/<marca>` | O formulário escreve direto no banco pela Server Action, sem API, token nem CORS para manter. E `/atacado/` é **um único segmento** na allowlist do middleware, para sempre |
| 2 | Caminho por marca | `/atacado/okey`, depois `/atacado/lov-club` — não `/okey/atacado` | Com marca no primeiro nível, cada marca nova exige um segmento público novo no middleware. O comentário do próprio `middleware.ts` descreve esse risco: rota futura nascendo sem sessão sem ninguém ter decidido isso |
| 3 | Marca no modelo | `enum WholesaleBrand { OKEY, LOV_CLUB }` já na Fase 1 | As abas se chamam "Por que revender **(marca)**" e o texto diz "nossa marca", nunca OKEY: o conteúdo é compartilhado e só a identidade visual difere. Fase 2 passa a ser uma LP e um valor, não uma migration |
| 4 | Submissão é `Customer`? | **Não.** Tabela própria `WholesaleLead` | São 18 respostas, máquina de status, código de reprovação e atendente. Em `Customer` isso viraria 20 colunas que só uma tela usa — e candidata reprovada apareceria no `CustomerCombobox` do Novo Pedido |
| 5 | O que a aprovação cria | **Nada.** Só marca `APROVADO` | `Customer.code` é único e digitado à mão; nada o gera. Criar cliente aqui exigiria inventar código ou pedir um no meio da triagem |
| 6 | "Solicitar ajustes" | **Não existe.** Quatro status: `EM_ANALISE`, `APROVADO`, `REPROVADO`, `CUIDADO` | A aba "Modal com as respostas" lista esses quatro. A especificação escrita citava "solicitar ajustes", que não aparece em lugar nenhum da planilha |
| 7 | Canal até a candidata | **Nenhum.** A vendedora liga | E-mail nunca existiu no projeto e o WhatsApp foi removido (`notifications/messages.ts`). Os dados servem a registro e análise pela Gestão, não a resposta automática |
| 8 | O que é `CUIDADO` | **Sinal de risco/fraude**, com **justificativa escrita obrigatória** | Serve para o resto da equipe não cair no mesmo. Sem o texto, o aviso diria "cuidado com esse" sem dizer por quê — e seria ignorado |
| 9 | `CUIDADO` atravessa o escopo da vendedora | Lead novo cujo **CNPJ ou telefone** já aparece em outro lead `CUIDADO` ou `REPROVADO` mostra aviso com código, data e justificativa — para qualquer vendedora | Alerta que só o dono vê não protege ninguém. Cobre de graça os códigos 31 (múltiplos cadastros) e 34 (tentativa de burlar cadastro) |
| 10 | Reprovar sem motivo | **Proibido.** `REPROVADO` exige um dos 34 códigos, conferido no servidor dentro da transação | Reprovação sem código não é analisável depois, e a análise posterior é a finalidade declarada da ferramenta |
| 11 | Onde vivem os 34 códigos | **Módulo TypeScript puro** (`src/lib/wholesale-rejection-codes.ts`), não tabela | É o idioma do projeto (`order-flow.ts`, `finance-constants.ts`), conferível por script. Guardar o código como string no lead preserva a leitura do histórico se um código for aposentado — o mesmo princípio que manteve `EMBALADO` no enum do Postgres |
| 12 | Histórico de decisões | **`WholesaleLeadEvent`** (de → para, código, autor, quando, nota). Sem seção no modal nesta versão | Sem o diário, os campos de decisão são sobrescritos e a Gestão só consegue analisar o veredito final — não reversões, não acerto do `CUIDADO`, não tempo até a decisão. Precedente: `OrderStatusHistory` |
| 13 | Formato do parâmetro do link | **`referralCode` opaco** no `User` (aleatório, único, revogável). Link: `/atacado/okey?r=<código>` | `?v=<userId>` vazaria ids internos, seria enumerável e deixaria qualquer pessoa apontar submissões para qualquer vendedora. Código opaco pode ser rotacionado se vazar |
| 14 | Link sem parâmetro ou com código morto | **Aceita**, com `sellerId = null`, numa fila que só a Gestão vê e distribui | Perder uma lojista real porque o parâmetro se perdeu no caminho é pior que uma fila de triagem |
| 15 | Quem tem código e botão | Só `VENDAS` com `salesModel = ATACADO` | Requisito: a funcionalidade é do perfil Vendas no escopo Atacado. Vendedora de varejo não capta revendedor |
| 16 | Quem vê e decide | `VENDAS`+`ATACADO` vê e decide **os próprios**; `GESTAO` vê e decide **todos**, inclusive os sem dono | Espelha `/vendas`, onde VENDAS vê só os próprios pedidos. A Gestão precisa de visão total porque a análise posterior é dela |
| 17 | `FINANCEIRO` | **Fora** | `permissions.ts` dá ao Financeiro paridade com Vendas **em pedidos**. Candidatura a revenda não é pedido: o Financeiro não decide quem revende a marca |
| 18 | "Atendente" | Puxado da sessão de quem decidiu (`decidedById`) | Planilha, aba 6: "deve puxar o usuário que aprovar ou reprovar o cadastro" |
| 19 | "Auxiliar Responsável" | **Texto livre**, exibido sempre em maiúsculas | Fiel à planilha. Custo aceito e registrado: "MARIA" e "MARIA SILVA" serão duas pessoas, e não haverá como contar carteira por auxiliar sem limpar a base |
| 20 | Obrigatoriedade dos campos | **Todos os 18 obrigatórios**, inclusive as duas imagens | Decisão do produto: a análise é minuciosa. **Consequência:** os códigos 26 e 27 ("não enviou o material", "recusa de envio") passam a valer só para material pedido **depois**, por telefone — não para o formulário |
| 21 | Foto do espaço físico de loja só online | Obrigatória **condicionada à resposta**: quem respondeu "Loja física" ou "Loja física e online" envia foto do espaço; quem respondeu "Loja online" envia **print da loja online** no mesmo campo, com o rótulo trocado | "Tudo obrigatório" e "Loja online" se contradizem: não existe foto de um espaço que não existe. Nada fica opcional — o que muda é o que se pede. Sem isso, toda loja online é barrada por um campo impossível, e o código 19 existe justamente para o caso de não haver operação nenhuma |
| 22 | Campo "Outro" | Escolher "Outro" torna o campo de escrita ao lado **obrigatório** | Coerência com a decisão 20: "Outro" sem o texto não informa nada |
| 23 | Campo "estado" | **Select das 27 UFs**, não texto livre | Texto livre daria "SP", "São Paulo" e "sp" para a mesma coisa, e os códigos 06–09 (conflito territorial, saturação, restrição geográfica) dependem de território confiável |
| 24 | Telefone | Normalizado na gravação (dígitos com DDD, sem país), como `lib/phone.ts` já faz | É a chave do aviso da decisão 9. Máscara divergente faria o mesmo número não casar consigo mesmo |
| 25 | Caminho de upload | **Reuso integral** do existente: `shrinkImageToBase64` no navegador, `validateUploadDataUrl` (magic bytes) no servidor, `sharp` → WebP 1600px, teto de 9 MB, **SVG recusado** | A auditoria de 08/10/2026 fechou esse caminho por causa da CVE-2026-96889 no librsvg. Abrir um segundo portão de upload reabriria exatamente o risco que ela fechou. A compressão no navegador não é otimização: sem ela, duas fotos estouram o limite de body do Next antes de a action rodar, com erro opaco |
| 26 | Onde as imagens ficam | `uploads/atacado/`, lidas pela rota **autenticada** `/api/uploads/[...path]` | Formulário público escreve; só gente de dentro lê. As imagens não têm por que ser públicas |
| 27 | Contenção de abuso | Rate limit por IP com balde próprio (`checkRate` + `request-ip.ts`), honeypot e tempo mínimo de preenchimento. **Sem captcha** | `request-ip.ts` já lê o `X-Forwarded-For` pelo final da lista, porque o início é escolhido pelo visitante. Captcha é dependência nova e fricção a mais num funil que se espalha por indicação, não por anúncio |
| 28 | Indexação | `noindex` na Fase 1 | O funil é por indicação. Tráfego orgânico só produziria leads sem dono, que caem na fila da Gestão |
| 29 | Validação de CNPJ | Formato e **dígitos verificadores**, por função pura. **Sem consulta à Receita** | A planilha diz "utilizado para confirmação do segmento", e os códigos 02 e 05 descrevem conferência humana. Consulta automática é fase futura |
| 30 | Mundo visual da LP | Tokens redefinidos **no layout do grupo** da LP, com escopo próprio; neutraliza o `.dark` herdado e sobrescreve `themeColor` por rota. **`globals.css` não muda** | O root layout força `document.documentElement.classList.add('dark')` e declara `themeColor: #29A0D9`. Mexer nos tokens globais poria o dashboard inteiro em risco por causa de uma landing page |
| 31 | Identidade visual da OKEY | **Pendente de referências** do usuário (site, Instagram, catálogo), pedidas no início da Fatia 3 | O site deu tom, categoria e tagline ("Atemporalidade e Arte em Cada Detalhe"); não deu paleta, tipografia nem imagem. Construir sem referência arrisca o retrabalho da LP inteira |
| 32 | Ordem de entrega | Fundação → ferramenta interna → LP → Lov Club | Migration em tabela que já tem dado real custa mais que esperar um dia pela primeira tela. E quando a LP subir, já existe lugar para o lead cair |
| 33 | Mudar um veredito já dado | **Permitido**, e sempre gera evento | A Gestão precisa poder corrigir um erro de triagem. O diário (decisão 12) é o que torna a correção auditável em vez de silenciosa — sem ele, permitir a troca seria perder a decisão anterior |
| 34 | Quando "Auxiliar Responsável" é preenchida | Editável em **qualquer status**, nunca obrigatória | A planilha não a marca como obrigatória nem a amarra a um status. Exigi-la na aprovação travaria a decisão por um dado que pode não estar definido na hora |
| 35 | Base do link copiado | Variável de ambiente (`NEXT_PUBLIC_APP_URL`), não host inferido da requisição | O botão é clicado dentro do dashboard, mas o link vai para fora. Inferir do `Host` produz link quebrado atrás do proxy do EasyPanel, e o erro só aparece no celular da lojista |

## 3. Modelo de dados

Duas tabelas novas, dois enums de domínio, quatro enums de resposta, um campo
novo em `User`. Nenhuma tabela existente muda de forma.

```prisma
enum WholesaleBrand      { OKEY LOV_CLUB }
enum WholesaleLeadStatus { EM_ANALISE APROVADO REPROVADO CUIDADO }

enum WholesaleServiceModel   { LOJA_FISICA LOJA_ONLINE FISICA_E_ONLINE OUTRO }
enum WholesaleFoundUs        { INSTAGRAM SITE INDICACAO OUTRO }
enum WholesaleInvestmentBand { ATE_3K DE_3_A_5K DE_5_A_10K ACIMA_10K }
enum WholesaleStoreImageKind { ESPACO_FISICO LOJA_ONLINE }
```

**`WholesaleLead`** — uma submissão.

| Campo | Observação |
|---|---|
| `id`, `createdAt`, `updatedAt` | — |
| `brand` | `WholesaleBrand` |
| `status` | `WholesaleLeadStatus`, default `EM_ANALISE` |
| `sellerId` | nulo = sem dono (decisão 14) |
| `contactName`, `email`, `phone`, `story` | seção 1; `phone` normalizado (decisão 24) |
| `state`, `city` | `state` é UF de 2 letras (decisão 23) |
| `serviceModel`, `serviceModelOther` | `Other` obrigatório quando `OUTRO` (decisão 22) |
| `instagram` | handle sem o `@` |
| `instagramImagePath`, `storeImagePath` | caminhos sob `uploads/atacado/` |
| `storeImageKind` | `ESPACO_FISICO` ou `LOJA_ONLINE` — qual foi pedida (decisão 21) |
| `marketTime`, `teamSize` | texto |
| `brandsCarried`, `followTime` | texto |
| `foundUs`, `foundUsOther` | idem decisão 22 |
| `investmentBand` | `WholesaleInvestmentBand` |
| `wantsVisit` | `Boolean` |
| `cnpj` | só dígitos. **Sem `@unique`**: a repetição é informação, não erro — é ela que alimenta o aviso da decisão 9 |
| `decidedById`, `decidedAt` | "Atendente" (decisão 18) |
| `rejectionCode` | `String?`, um dos 34 (decisão 11) |
| `cautionReason` | `String?`, obrigatório quando `CUIDADO` (decisão 8) |
| `assistantName` | `String?`, texto livre (decisão 19) |
| `submittedIp` | para o rate limit e para o código 34 |

Índices: `(brand, status)`, `(sellerId, status)`, `cnpj`, `phone` — os dois
últimos servem ao aviso da decisão 9.

**`WholesaleLeadEvent`** — o diário (decisão 12).

`id`, `leadId`, `fromStatus`, `toStatus`, `rejectionCode?`, `note?`,
`actorId`, `createdAt`.

**`User.referralCode`** — `String? @unique`. Gerado para `VENDAS`+`ATACADO`
(decisão 13). Regenerável.

## 4. Atribuição por link

Três funções puras, conferíveis por script sem banco:

- `generateReferralCode()` — **10 caracteres**, alfabeto base32 sem os
  ambíguos (`I`, `L`, `O`, `U`), gerado por `crypto.randomBytes`. Dez
  caracteres nesse alfabeto dão espaço de busca grande o bastante para que
  adivinhar um código seja mais caro que inútil, e curtos o bastante para
  caber num link que a lojista lê no WhatsApp. Colisão é tratada por
  regeneração, porque `@unique` a recusaria na gravação.
- `resolveReferral(code, candidatos)` → `sellerId | null`. Código ausente,
  malformado, inexistente, de usuário inativo ou fora de `VENDAS`+`ATACADO`
  resolve para `null`, nunca para erro: o lead entra sem dono (decisão 14).
- `buildReferralLink(baseUrl, brand, code)` — o texto que o botão copia.

O botão "Copiar link de indicação" vive no cabeçalho de `/vendas`, ao lado dos
que já existem, visível só para `VENDAS`+`ATACADO` (decisão 15).

## 5. Acesso e decisão

A guarda vive **na Server Action**, não só na página — hábito do projeto.

```
podeVerLead(ator, lead)  = GESTAO
                         | (VENDAS && ATACADO && lead.sellerId === ator.id)
podeDecidirLead          = o mesmo conjunto
```

Função pura em `src/lib/wholesale-permissions.ts`, no padrão de
`permissions.ts`.

**Transição de status.** De `EM_ANALISE` para qualquer um dos três. De um
veredito para outro é **permitido** e gera evento — a Gestão precisa poder
corrigir, e o diário é o que torna isso auditável em vez de silencioso.

Invariantes conferidas no servidor, dentro da transação:

1. `REPROVADO` sem `rejectionCode` válido → recusa (decisão 10).
2. `CUIDADO` sem `cautionReason` não vazio → recusa (decisão 8).
3. `rejectionCode` que não está no módulo dos 34 → recusa.
4. Toda mudança grava `WholesaleLeadEvent` na mesma transação. Sem evento,
   sem mudança.

## 6. Formulário público

Quatro seções, 18 perguntas, todas obrigatórias (decisão 20). A lista literal
está no anexo A.

**Parâmetros de contenção**, explícitos para não virarem palpite na
implementação: **5 envios por IP por hora** (balde próprio, não o do login),
honeypot num campo de texto escondido por CSS que precisa chegar **vazio**, e
**5 segundos** de tempo mínimo entre abrir e enviar o formulário. Os três são
condições independentes: falhar qualquer uma recusa o envio com a mesma
mensagem genérica, porque dizer qual falhou ensina a contorná-la.

**Fluxo de envio.** Navegador comprime as duas imagens → Server Action recebe
o payload com os dois data-URLs → valida honeypot, tempo mínimo e rate limit
por IP → `validateUploadDataUrl` confere magic bytes → `zod` valida o resto →
`sharp` grava WebP em `uploads/atacado/` → `resolveReferral` decide o dono →
`WholesaleLead` nasce `EM_ANALISE` em uma transação.

**Resposta à candidata:** uma tela de confirmação. Nada mais — não há canal
(decisão 7).

**O que a página não faz:** não mostra nome de vendedora, não confirma se o
código existe, não diz se o CNPJ já se cadastrou. Um formulário público que
responde isso vira ferramenta de enumeração.

## 7. Mundo visual

Dois mundos no mesmo repositório. A ferramenta interna é **Operate** e herda o
Build.Flow sem inventar nada. A LP é **Persuade** e tem a identidade da marca.

O risco concreto está na decisão 30: o root layout é compartilhado, força
`.dark` antes da hidratação e declara `themeColor` azul. A primeira tarefa da
Fatia 3 é uma página de prova deliberadamente feia que demonstre o escopo de
tokens funcionando nos dois sentidos — LP sem cara de dashboard, dashboard
intacto — **antes** de qualquer trabalho de composição.

## 8. Fatias

| Fatia | Entrega | Verificação |
|---|---|---|
| 1 | Schema + migration, módulo dos 34 códigos, `referralCode`, funções puras de referral e permissão | `npx tsc --noEmit`, `npx next build`, scripts novos em `scripts/checks/` |
| 2 | Análise de Clientes: lista, modal de decisão, RBAC, botão de copiar link, aviso de CNPJ/telefone repetido | leads semeados; as quatro invariantes da seção 5 |
| 3 | LP OKEY: prova de escopo de tokens, mundo visual, 4 seções, uploads, contenção de abuso | celular real; `impeccable` + `mobile-native` |
| 4 | Fase 2: Lov Club | um valor de enum e um mundo visual; zero migration |

**O plano de implementação cobre as Fatias 1 a 3** — a Fase 1 do projeto. A
Fatia 4 ganha plano próprio quando a Fase 2 for aberta, e esta spec já a deixa
sem dívida: nenhuma decisão aqui precisa ser revista para ela acontecer.

## 9. Fora de escopo

Nomeado para não ser reinventado depois como se fosse esquecimento:

- Consulta automática à Receita Federal (decisão 29).
- Qualquer aviso automático à candidata: e-mail, WhatsApp, SMS (decisão 7).
- Criação de `Customer` na aprovação (decisão 5).
- Painel de indicadores dos leads. Ninguém pediu; a Gestão analisa na lista.
- Captcha (decisão 27).
- Edição do cadastro pela candidata — não existe estado que peça isso
  (decisão 6).

## Anexo A — conteúdo literal da planilha

Transcrito porque a planilha vive fora do repositório.

### A.1 Formulário

**Boas-vindas e Identificação**
1. Como podemos te chamar?
2. Qual é o seu melhor e-mail para contato?
3. Qual é o seu WhatsApp ou telefone para conversarmos?
4. Conte-nos um pouco sobre você e sua trajetória:

**Sobre o Seu Negócio**
5. Qual é o seu estado?
6. Em qual cidade sua loja está localizada?
7. Como você atende suas clientes hoje? · Loja física · Loja online · Loja
   física e online · Outro (abre campo para escrever)
8. Qual é o Instagram da sua loja? (@)
9. Envie uma imagem ou print do perfil do seu Instagram:
10. Compartilhe conosco uma foto do seu espaço físico:
11. Há quanto tempo sua loja atua no mercado?
12. Quantas pessoas fazem parte da sua equipe atualmente?

**Conectividade e Parceria Comercial**
13. Quais marcas já fazem parte do seu espaço?
14. Como você nos encontrou? · Instagram · Site · Indicação · Outro (abre
    campo para escrever)
15. Há quanto tempo você acompanha a nossa marca?
16. Qual valor você planeja investir na sua próxima coleção conosco? · Até
    R$ 3 mil · De R$ 3 a R$ 5 mil · De R$ 5 a R$ 10 mil · Acima de R$ 10 mil
17. Gostaria de receber a visita de uma de nossas representantes em sua loja?
    · Sim · Não

**Validação Cadastro**
18. Para finalizarmos, informe o CNPJ da sua empresa (utilizado para
    confirmação do segmento):

### A.2 Por que revender (3 motivos)

1. **Altamente Lucrativo** — Sua loja com mais rentabilidade
2. **Diferencial Qualitativo** — Atemporalidade e padrão alta-costura
3. **Design Autoral e Genuíno** — Identidade única para o seu ponto de venda

### A.3 Por que escolher (6 vantagens)

1. **Suporte Exclusivo** — Acompanhamento personalizado para o seu negócio
   Oferecemos suporte completo na representação da marca. Nossos catálogos
   contam com especificações detalhadas de cada peça, e você dispõe do
   atendimento dedicado de uma consultora exclusiva para auxiliar suas
   escolhas e otimizar seus resultados.
2. **Logística Ágil** — Segurança e eficiência na entrega
   Parcerias com as principais transportadoras do país garantem a entrega dos
   seus pedidos com máxima agilidade e segurança, seja por meio de frete aéreo
   ou envio rodoviário/expressa.
3. **Posicionamento de Mercado** — Acesso ao segmento mais promissor da moda
   Desenvolvemos coleções direcionadas ao público consumidor de maior
   relevância e poder de compra no mercado de moda, assegurando demanda
   constante e alinhada às expectativas de clientes exigentes.
4. **Excelência em Produto** — Design autoral e padrão alta-costura
   Criamos peças modernas que combinam alta qualidade, caimento impecável e
   design autoral. Um portfólio exclusivo estruturado para diferenciar a sua
   loja no mercado e destacar o seu espaço frente à concorrência.
5. **Rentabilidade Estratégica** — Excelente retorno financeiro e alto giro
   Proporcione ao seu negócio margens de lucro atrativas e superiores à média
   de mercado. Nossas peças combinam alto apelo visual e aceitação,
   favorecendo um giro de estoque contínuo e rentável.
6. **Valor Percebido** — Sofisticação comparável às grifes internacionais
   A qualidade singular dos tecidos e o design refinado posicionam nossas
   coleções ao lado dos grandes nomes da moda europeia, proporcionando uma
   experiência de compra que encanta e fideliza suas clientes.

### A.4 FAQ (4 grupos, 7 perguntas)

Correção de 14/10/2026: este cabeçalho dizia "8 perguntas" por erro de contagem
meu ao escrever a spec. A planilha tem **sete**: os grupos 1, 2 e 3 têm duas
perguntas cada, e o grupo 4 ("Qualidade e Trocas") tem **uma só**. Conferido na
aba "Sugestões de FAQ" do arquivo original, que termina no par da linha 20–21
sem oitava entrada. A Tarefa 13 parou ao bater nessa divergência em vez de
inventar uma pergunta para uma página pública, o que foi a decisão certa.

**1. Pedido e Condições de Compra**

- *Qual é o valor ou a quantidade mínima para o primeiro pedido?*
  Trabalhamos com condições acessíveis para que você possa introduzir a marca
  em seu ponto de venda com tranquilidade.
- *Como funciona o processo de seleção das peças e coleções?*
  Disponibilizamos catálogos digitais completos e atualizados, com
  especificações técnicas e materiais de apoio. Além disso, nossa equipe de
  consultoria está à disposição para auxiliar na escolha das peças que melhor
  se adaptam ao perfil do seu público.

**2. Logística e Entrega**

- *Quais são as opções e prazos de entrega para a minha região?*
  Possuímos parcerias com as principais transportadoras do país, incluindo
  modalidades de envio aéreo e rodoviário expresso. O prazo e o valor do frete
  são calculados de acordo com a sua localidade e o volume do pedido,
  garantindo máxima eficiência e segurança.
- *Como funcionam as etiquetas com preços sugeridos?*
  Para sua maior praticidade, os produtos são entregues devidamente etiquetados
  com os valores sugeridos para revenda. Esses valores são planejados
  estrategicamente para cobrir os seus custos logísticos e assegurar a sua
  margem de lucro.

**3. Margem e Exclusividade**

- *Qual é a margem de lucro praticada nas revendas?*
  Nossos parceiros contam com uma margem de lucro de até 100%, variando
  conforme a linha de produtos e o volume de aquisição.
- *Existe política de exclusividade territorial para a minha cidade?*
  Sim. Avaliamos a localização e a viabilidade do ponto de venda para garantir
  a exclusividade de marca em determinadas regiões, preservando o valor
  percebido e a competitividade do seu negócio. (Consulte os critérios junto à
  nossa equipe).

**4. Qualidade e Trocas**

- *Qual é a garantia em relação à qualidade e acabamento dos produtos?*
  Todas as peças passam por um rigoroso controle de qualidade, desde a seleção
  dos tecidos importados da Linha Italiana Premium até a confecção artesanal
  dos detalhes. Caso ocorra qualquer divergência, dispomos de uma política ágil
  de suporte e troca para lojistas.

### A.5 Códigos de reprovação (34 códigos, 9 categorias)

Na planilha a coluna "Categoria" é célula mesclada: o rótulo aparece uma vez e
vale para o grupo inteiro. Aqui ele está repetido linha a linha para a tabela
ser legível isolada. Em particular, **"Ausência de CNPJ" rotula os códigos 01 a
05**, embora 02–05 tratem de CNPJ existente mas irregular — é o rótulo que a
planilha traz, transcrito como está. Quem for "corrigir" isso depois precisa
decidir com o negócio, não no código.

| Código | Categoria | Motivo | Critério |
|---|---|---|---|
| 01 | Ausência de CNPJ | Sem CNPJ | Cliente não possui registro de CNPJ. |
| 02 | Ausência de CNPJ | CNPJ Inválido, Inapto ou Baixado | CNPJ com inconsistências ou irregular na Receita Federal. |
| 03 | Ausência de CNPJ | CNPJ Criado Recentemente | CNPJ recém-aberto e sem histórico operacional. |
| 04 | Ausência de CNPJ | CNPJ de Terceiros | Dados do CNPJ pertencem a outra pessoa. |
| 05 | Ausência de CNPJ | CNPJ de Outro Segmento | Registrado em ramo diferente do vestuário. |
| 06 | Conflito Territorial | Praça Fechada (Exclusividade) | Cidade/região com contrato de exclusividade vigente. |
| 07 | Conflito Territorial | Revenda / Cliente Recorrente Próximo | Raio de distância muito próximo de cliente ativo. |
| 08 | Conflito Territorial | Saturação de Mercado | Cidade já possui quantidade máxima de revendedores. |
| 09 | Conflito Territorial | Restrição Geográfica | Região bloqueada por política comercial. |
| 10 | Incompatibilidade de Perfil | Loja Fora do Padrão | Comunicação e estética fora do padrão da marca. |
| 11 | Incompatibilidade de Perfil | Produtos Populares / Preços Baixos | Peças de baixo custo (faixa de R$ 20 a R$ 50) ou de feira. |
| 12 | Incompatibilidade de Perfil | Nicho Incompatível | Foco exclusivo em outro público (Kids, Masculino, etc.). |
| 13 | Incompatibilidade de Perfil | Loja Multissegmento | Mistura de segmentos sem foco definido. |
| 14 | Concorrência Direta | Fabricação Própria / Confecção | Cliente possui produção própria de peças. |
| 15 | Concorrência Direta | Venda de Cópias | Comercializa réplicas ou imitações. |
| 16 | Concorrência Direta | Venda em Atacado | Atua focado em redistribuição no atacado. |
| 17 | Inexistência de Loja | Loja Ainda Não Existe | Projeto em fase de planejamento, sem operação. |
| 18 | Inexistência de Loja | Loja Não Encontrada | Endereço ou estabelecimento físico/online não localizado. |
| 19 | Inexistência de Loja | Sem Loja Física e Sem Online Ativa | Não possui ponto de venda operacional. |
| 20 | Inexistência de Loja | Venda Informal | Atuação porta em porta, bag ou sacoleira. |
| 21 | Problemas no Digital | Sem Instagram | Não possui perfil comercial nas redes sociais. |
| 22 | Problemas no Digital | Instagram Pessoal | Utilização de perfil pessoal para vendas. |
| 23 | Problemas no Digital | Perfil Privado / Sem Acesso | Conta fechada que impede a avaliação. |
| 24 | Problemas no Digital | Perfil Abandonado | Sem publicações recentes há meses ou anos. |
| 25 | Problemas no Digital | Engajamento Insuficiente | Pouquíssimos seguidores e sem prova social. |
| 26 | Falta de Documentação | Documentos / Fotos Não Enviados | Cliente não enviou o material solicitado. |
| 27 | Falta de Documentação | Recusa de Envio de Informações | Cliente negou-se a compartilhar dados/fotos. |
| 28 | Falta de Documentação | Contato Incorreto / Sem Retorno | Telefone/WhatsApp inválido ou sem resposta. |
| 29 | Perfil do Comprador | Suspeita de Uso Pessoal | Cadastro com intenção de compra própria a preço de atacado. |
| 30 | Perfil do Comprador | Histórico de Inadimplência | Pedidos anteriores sem confirmação de pagamento. |
| 31 | Perfil do Comprador | Múltiplos Cadastros Sem Compra | Aprovado anteriormente, mas nunca efetivou pedidos. |
| 32 | Perfil do Comprador | Especulação de Preços | Apenas busca por catálogos e tabelas. |
| 33 | Inconsistência de Dados | Divergência de Endereço/CNPJ | Localização do CNPJ divergente da loja física/online. |
| 34 | Inconsistência de Dados | Tentativa de Burlar Cadastro | Uso repetido de dados alterados para novas tentativas. |

### A.6 Modal com as respostas

As 18 perguntas acima, com origem "Formulário", mais quatro campos internos:

- **Atendente** — puxa o usuário que aprovar ou reprovar o cadastro.
- **Status** — Em análise, Aprovado, Reprovado, Cuidado.
- **Motivo de reprovação** — dropdown com os 34 códigos, visível só quando
  reprovado.
- **Auxiliar Responsável** — nome digitado, exibido sempre em maiúsculas.
