// Checagem dos helpers puros de src/lib/utils.ts.
// Rodar com: npx tsx scripts/checks/utils.ts
import { shortName, firstName, iniciais, nextCampaignId, dataCurtaBR, rotuloDePeriodo } from "../../src/lib/utils";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- firstName: SO o primeiro, para a grade de 12 meses do Acompanhamento ---
check("firstName dois nomes", firstName("Ana Paula"), "Ana");
check("firstName tres nomes", firstName("Ana Paula Rodrigues"), "Ana");
check("firstName nome unico", firstName("Ana"), "Ana");
// Particula NAO e tratada de proposito: o primeiro token nunca e particula.
check("firstName com particula", firstName("Maria da Silva Souza"), "Maria");
check("firstName espacos extras", firstName("  Ana   Paula   Rodrigues "), "Ana");
// As duas bordas que o ponytail pegou na primeira versao desta funcao:
check("firstName vazio", firstName(""), "");
check("firstName so espacos", firstName("   "), "");

// --- iniciais: as duas letras do disco de avatar (Relatorio Semanal) ---
// Primeiro + ULTIMO, ao contrario de shortName: e assim que uma pessoa e
// reconhecida por duas letras.
check("iniciais primeiro e ultimo nome", iniciais("Karen Souza Lima"), "KL");
check("iniciais nome unico", iniciais("Karen"), "K");
check("iniciais espacos extras", iniciais("  Karen   Lima  "), "KL");
check("iniciais com particula nao a trata", iniciais("Maria da Silva"), "MS");
// Disco em branco parece defeito de carregamento; "?" diz que nao ha nome.
check("iniciais vazio vira interrogacao", iniciais("   "), "?");

// --- shortName: primeiro + segundo nome, para caber no card ---
check("dois nomes", shortName("Ana Paula"), "Ana Paula");
check("tres nomes", shortName("Ana Paula Rodrigues"), "Ana Paula");
check("nome composto longo", shortName("Maria Fernanda Souza Lima"), "Maria Fernanda");
check("nome unico", shortName("Ana"), "Ana");

// Particulas (de/da/do/dos/das/e) NAO contam como o segundo nome. Pegar os dois
// primeiros pedacos literalmente devolveria "Maria da", que le como nome
// cortado no meio — o oposto do objetivo. Pulamos a particula e levamos o
// sobrenome seguinte.
check("particula da", shortName("Maria da Silva Souza"), "Maria Silva");
check("particula de", shortName("Ana de Souza Lima"), "Ana Souza");
check("particula dos", shortName("Joao dos Santos Pereira"), "Joao Santos");
check("particula e", shortName("Rita e Souza Alves"), "Rita Souza");
// Particula no fim, sem sobrenome depois: devolve so o primeiro nome, em vez
// de terminar a exibicao numa preposicao solta.
check("so particula depois", shortName("Maria de"), "Maria");

// --- Entradas sujas nao podem quebrar o card ---
check("espacos extras", shortName("  Ana   Paula   Rodrigues "), "Ana Paula");
check("vazio", shortName(""), "");
check("so espacos", shortName("   "), "");

// --- nextCampaignId: rodizio das campanhas no Ranking de Vendas ---
check("avanca p/ a proxima", nextCampaignId(["a", "b", "c"], "a"), "b");
check("volta ao inicio no fim", nextCampaignId(["a", "b", "c"], "c"), "a");
check("campanha unica fica nela", nextCampaignId(["a"], "a"), "a");
check("lista vazia", nextCampaignId([], "a"), "");

// A lista e recarregada a cada 30 min (auto-refresh do quadro) e pode mudar:
// uma campanha desativada some. Se a campanha atual sumiu, o rodizio recomeca
// do inicio em vez de travar num id que nao existe mais — sem isso o bloco
// ficaria parado para sempre exibindo o fallback.
check("id ausente recomeca", nextCampaignId(["a", "b"], "zzz"), "a");
check("id vazio comeca do inicio", nextCampaignId(["a", "b"], ""), "a");

// --- rotulo do botao de periodo ---------------------------------------------
// Sem periodo, o botao diz o que aquele periodo SIGNIFICA naquela tela.
check("sem periodo, mostra o titulo", rotuloDePeriodo("", "", "Abertura"), "Abertura");
// A ordem dos pedacos e o risco real: dd/mm/aa, nao aa/mm/dd.
check("data vira dd/mm/aa", dataCurtaBR("2026-10-19"), "19/10/26");
check("periodo fechado", rotuloDePeriodo("2026-10-01", "2026-10-19", "P"), "01/10/26 – 19/10/26");
// As duas pontas sao independentes: a consulta aceita periodo aberto dos dois
// lados, e o botao precisa saber dizer os dois.
check("so o inicio", rotuloDePeriodo("2026-10-01", "", "P"), "desde 01/10/26");
check("so o fim", rotuloDePeriodo("", "2026-10-19", "P"), "até 19/10/26");
// Valor estranho nao pode virar "undefined/undefined/un" no botao.
check("valor fora do formato sai inteiro", dataCurtaBR("xxx"), "xxx");

console.log(falhas === 0 ? "OK: utils" : `${falhas} falha(s) em utils`);
process.exit(falhas === 0 ? 0 : 1);
