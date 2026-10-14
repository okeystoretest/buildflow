/**
 * Os 34 motivos de reprovação de um cadastro de atacado.
 *
 * POR QUE MÓDULO E NÃO TABELA (decisão 11 da spec): é o idioma deste projeto
 * para regra decidível (`order-flow.ts`, `finance-constants.ts`), e um script
 * confere a taxonomia inteira sem subir banco. O lead guarda o `code` como
 * string, então aposentar um código no futuro não apaga a leitura do histórico
 * de quem já foi reprovado por ele — o mesmo princípio que manteve EMBALADO no
 * enum do Postgres.
 *
 * O rótulo de categoria vem da célula mesclada da planilha. Em particular
 * "Ausência de CNPJ" cobre 01 a 05, embora 02–05 tratem de CNPJ existente mas
 * irregular. É o rótulo da planilha, transcrito como está: mudá-lo é decisão
 * do negócio, não do código.
 */
export interface RejectionCode {
  /** Dois dígitos, com zero à esquerda. É a chave gravada no lead. */
  code: string;
  category: string;
  /** "Descrição Curta / Motivo" na planilha — o que aparece no dropdown. */
  label: string;
  /** "Detalhamento / Critério" — o texto de apoio à decisão. */
  criteria: string;
}

export const REJECTION_CODES: readonly RejectionCode[] = [
  {
    code: "01",
    category: "Ausência de CNPJ",
    label: "Sem CNPJ",
    criteria: "Cliente não possui registro de CNPJ.",
  },
  {
    code: "02",
    category: "Ausência de CNPJ",
    label: "CNPJ Inválido, Inapto ou Baixado",
    criteria: "CNPJ com inconsistências ou irregular na Receita Federal.",
  },
  {
    code: "03",
    category: "Ausência de CNPJ",
    label: "CNPJ Criado Recentemente",
    criteria: "CNPJ recém-aberto e sem histórico operacional.",
  },
  {
    code: "04",
    category: "Ausência de CNPJ",
    label: "CNPJ de Terceiros",
    criteria: "Dados do CNPJ pertencem a outra pessoa.",
  },
  {
    code: "05",
    category: "Ausência de CNPJ",
    label: "CNPJ de Outro Segmento",
    criteria: "Registrado em ramo diferente do vestuário.",
  },
  {
    code: "06",
    category: "Conflito Territorial",
    label: "Praça Fechada (Exclusividade)",
    criteria: "Cidade/região com contrato de exclusividade vigente.",
  },
  {
    code: "07",
    category: "Conflito Territorial",
    label: "Revenda / Cliente Recorrente Próximo",
    criteria: "Raio de distância muito próximo de cliente ativo.",
  },
  {
    code: "08",
    category: "Conflito Territorial",
    label: "Saturação de Mercado",
    criteria: "Cidade já possui quantidade máxima de revendedores.",
  },
  {
    code: "09",
    category: "Conflito Territorial",
    label: "Restrição Geográfica",
    criteria: "Região bloqueada por política comercial.",
  },
  {
    code: "10",
    category: "Incompatibilidade de Perfil",
    label: "Loja Fora do Padrão",
    criteria: "Comunicação e estética fora do padrão da marca.",
  },
  {
    code: "11",
    category: "Incompatibilidade de Perfil",
    label: "Produtos Populares / Preços Baixos",
    criteria: "Peças de baixo custo (faixa de R$ 20 a R$ 50) ou de feira.",
  },
  {
    code: "12",
    category: "Incompatibilidade de Perfil",
    label: "Nicho Incompatível",
    criteria: "Foco exclusivo em outro público (Kids, Masculino, etc.).",
  },
  {
    code: "13",
    category: "Incompatibilidade de Perfil",
    label: "Loja Multissegmento",
    criteria: "Mistura de segmentos sem foco definido.",
  },
  {
    code: "14",
    category: "Concorrência Direta",
    label: "Fabricação Própria / Confecção",
    criteria: "Cliente possui produção própria de peças.",
  },
  {
    code: "15",
    category: "Concorrência Direta",
    label: "Venda de Cópias",
    criteria: "Comercializa réplicas ou imitações.",
  },
  {
    code: "16",
    category: "Concorrência Direta",
    label: "Venda em Atacado",
    criteria: "Atua focado em redistribuição no atacado.",
  },
  {
    code: "17",
    category: "Inexistência de Loja",
    label: "Loja Ainda Não Existe",
    criteria: "Projeto em fase de planejamento, sem operação.",
  },
  {
    code: "18",
    category: "Inexistência de Loja",
    label: "Loja Não Encontrada",
    criteria: "Endereço ou estabelecimento físico/online não localizado.",
  },
  {
    code: "19",
    category: "Inexistência de Loja",
    label: "Sem Loja Física e Sem Online Ativa",
    criteria: "Não possui ponto de venda operacional.",
  },
  {
    code: "20",
    category: "Inexistência de Loja",
    label: "Venda Informal",
    criteria: "Atuação porta em porta, bag ou sacoleira.",
  },
  {
    code: "21",
    category: "Problemas no Digital",
    label: "Sem Instagram",
    criteria: "Não possui perfil comercial nas redes sociais.",
  },
  {
    code: "22",
    category: "Problemas no Digital",
    label: "Instagram Pessoal",
    criteria: "Utilização de perfil pessoal para vendas.",
  },
  {
    code: "23",
    category: "Problemas no Digital",
    label: "Perfil Privado / Sem Acesso",
    criteria: "Conta fechada que impede a avaliação.",
  },
  {
    code: "24",
    category: "Problemas no Digital",
    label: "Perfil Abandonado",
    criteria: "Sem publicações recentes há meses ou anos.",
  },
  {
    code: "25",
    category: "Problemas no Digital",
    label: "Engajamento Insuficiente",
    criteria: "Pouquíssimos seguidores e sem prova social.",
  },
  {
    code: "26",
    category: "Falta de Documentação",
    label: "Documentos / Fotos Não Enviados",
    criteria: "Cliente não enviou o material solicitado.",
  },
  {
    code: "27",
    category: "Falta de Documentação",
    label: "Recusa de Envio de Informações",
    criteria: "Cliente negou-se a compartilhar dados/fotos.",
  },
  {
    code: "28",
    category: "Falta de Documentação",
    label: "Contato Incorreto / Sem Retorno",
    criteria: "Telefone/WhatsApp inválido ou sem resposta.",
  },
  {
    code: "29",
    category: "Perfil do Comprador",
    label: "Suspeita de Uso Pessoal",
    criteria: "Cadastro com intenção de compra própria a preço de atacado.",
  },
  {
    code: "30",
    category: "Perfil do Comprador",
    label: "Histórico de Inadimplência",
    criteria: "Pedidos anteriores sem confirmação de pagamento.",
  },
  {
    code: "31",
    category: "Perfil do Comprador",
    label: "Múltiplos Cadastros Sem Compra",
    criteria: "Aprovado anteriormente, mas nunca efetivou pedidos.",
  },
  {
    code: "32",
    category: "Perfil do Comprador",
    label: "Especulação de Preços",
    criteria: "Apenas busca por catálogos e tabelas.",
  },
  {
    code: "33",
    category: "Inconsistência de Dados",
    label: "Divergência de Endereço/CNPJ",
    criteria: "Localização do CNPJ divergente da loja física/online.",
  },
  {
    code: "34",
    category: "Inconsistência de Dados",
    label: "Tentativa de Burlar Cadastro",
    criteria: "Uso repetido de dados alterados para novas tentativas.",
  },
] as const;

export function findRejectionCode(code: string): RejectionCode | null {
  return REJECTION_CODES.find((c) => c.code === code) ?? null;
}

export function isValidRejectionCode(code: string): boolean {
  return findRejectionCode(code) !== null;
}

/** Agrupado para o dropdown, preservando a ordem da planilha. */
export function rejectionCodesByCategory(): { category: string; codes: RejectionCode[] }[] {
  const out: { category: string; codes: RejectionCode[] }[] = [];
  for (const c of REJECTION_CODES) {
    const atual = out[out.length - 1];
    if (atual && atual.category === c.category) atual.codes.push(c);
    else out.push({ category: c.category, codes: [c] });
  }
  return out;
}
