// Base oficial compacta de municípios brasileiros (amostra representativa)
// Fonte: IBGE. Normalizada para comparação case-insensitive sem acentos.

export interface BrazilCity {
  name: string;       // nome original com acentos
  normalized: string; // sem acentos, minúsculas
  uf: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const RAW_CITIES: Array<[string, string]> = [
  // RS
  ["Porto Alegre","RS"],["Canoas","RS"],["Caxias do Sul","RS"],["Pelotas","RS"],
  ["Santa Maria","RS"],["Gravataí","RS"],["Viamão","RS"],["Novo Hamburgo","RS"],
  ["São Leopoldo","RS"],["Rio Grande","RS"],["Alvorada","RS"],["Passo Fundo","RS"],
  ["Sapucaia do Sul","RS"],["Uruguaiana","RS"],["Santa Cruz do Sul","RS"],
  ["Cachoeirinha","RS"],["Bagé","RS"],["Bento Gonçalves","RS"],["Erechim","RS"],
  ["Guaíba","RS"],["Cachoeira do Sul","RS"],["Santana do Livramento","RS"],
  ["Alegrete","RS"],["Ijuí","RS"],["São Gabriel","RS"],["Farroupilha","RS"],
  ["Lajeado","RS"],["Sapiranga","RS"],["Camaquã","RS"],["Montenegro","RS"],
  ["Taquara","RS"],["Tramandaí","RS"],["Torres","RS"],["Osório","RS"],
  ["Campo Bom","RS"],["Estância Velha","RS"],["Portão","RS"],["Rolante","RS"],
  ["Eldorado do Sul","RS"],["Charqueadas","RS"],["Três Coroas","RS"],
  ["Novo Cabrais","RS"],["São Jerônimo","RS"],["Taquari","RS"],["Arroio dos Ratos","RS"],
  ["Triunfo","RS"],["General Câmara","RS"],["Butiá","RS"],["Barra do Ribeiro","RS"],
  // SC
  ["Florianópolis","SC"],["Joinville","SC"],["Blumenau","SC"],["São José","SC"],
  ["Criciúma","SC"],["Chapecó","SC"],["Itajaí","SC"],["Jaraguá do Sul","SC"],
  ["Palhoça","SC"],["Balneário Camboriú","SC"],["Brusque","SC"],["Tubarão","SC"],
  ["São Bento do Sul","SC"],["Caçador","SC"],["Concórdia","SC"],["Lages","SC"],
  ["Navegantes","SC"],["Içara","SC"],["Biguaçu","SC"],["Camboriú","SC"],
  ["Gaspar","SC"],["Indaial","SC"],["Timbó","SC"],["Rio do Sul","SC"],
  ["Araranguá","SC"],["Laguna","SC"],["Mafra","SC"],["Canoinhas","SC"],
  ["Xanxerê","SC"],["São Francisco do Sul","SC"],["Imbituba","SC"],
  ["Itapema","SC"],["Porto Belo","SC"],["Penha","SC"],["Piçarras","SC"],
  // SP
  ["São Paulo","SP"],["Guarulhos","SP"],["Campinas","SP"],["São Bernardo do Campo","SP"],
  ["Santo André","SP"],["Osasco","SP"],["São José dos Campos","SP"],["Ribeirão Preto","SP"],
  ["Sorocaba","SP"],["Mauá","SP"],["Santos","SP"],["Mogi das Cruzes","SP"],
  ["São José do Rio Preto","SP"],["Diadema","SP"],["Jundiaí","SP"],["Carapicuíba","SP"],
  ["Bauru","SP"],["Itaquaquecetuba","SP"],["Piracicaba","SP"],["São Vicente","SP"],
  ["Guarujá","SP"],["Taubaté","SP"],["Franca","SP"],["Praia Grande","SP"],
  ["Barueri","SP"],["Suzano","SP"],["Taboão da Serra","SP"],["Sumaré","SP"],
  ["Limeira","SP"],["Caçapava","SP"],["Marília","SP"],["Presidente Prudente","SP"],
  ["Americana","SP"],["Araraquara","SP"],["Jacareí","SP"],["Hortolândia","SP"],
  ["São Carlos","SP"],["Indaiatuba","SP"],["Cotia","SP"],["Araçatuba","SP"],
  ["Botucatu","SP"],["São Caetano do Sul","SP"],["Itapevi","SP"],["Embu das Artes","SP"],
  ["Mogi Guaçu","SP"],["Várzea Paulista","SP"],["Pindamonhangaba","SP"],
  // RJ
  ["Rio de Janeiro","RJ"],["São Gonçalo","RJ"],["Duque de Caxias","RJ"],
  ["Nova Iguaçu","RJ"],["Niterói","RJ"],["Belford Roxo","RJ"],["São João de Meriti","RJ"],
  ["Campos dos Goytacazes","RJ"],["Petrópolis","RJ"],["Volta Redonda","RJ"],
  ["Magé","RJ"],["Itaboraí","RJ"],["Mesquita","RJ"],["Nilópolis","RJ"],
  ["Nova Friburgo","RJ"],["Barra Mansa","RJ"],["Maricá","RJ"],["Queimados","RJ"],
  ["Angra dos Reis","RJ"],["Cabo Frio","RJ"],["Macaé","RJ"],["Resende","RJ"],
  // MG
  ["Belo Horizonte","MG"],["Uberlândia","MG"],["Contagem","MG"],["Juiz de Fora","MG"],
  ["Betim","MG"],["Montes Claros","MG"],["Ribeirão das Neves","MG"],["Uberaba","MG"],
  ["Governador Valadares","MG"],["Ipatinga","MG"],["Sete Lagoas","MG"],["Divinópolis","MG"],
  ["Santa Luzia","MG"],["Ibirité","MG"],["Poços de Caldas","MG"],["Patos de Minas","MG"],
  ["Pouso Alegre","MG"],["Vespasiano","MG"],["Coronel Fabriciano","MG"],["Itabira","MG"],
  // BA
  ["Salvador","BA"],["Feira de Santana","BA"],["Vitória da Conquista","BA"],
  ["Camaçari","BA"],["Juazeiro","BA"],["Ilhéus","BA"],
  ["Lauro de Freitas","BA"],["Jequié","BA"],["Teixeira de Freitas","BA"],
  ["Alagoinhas","BA"],["Barreiras","BA"],["Porto Seguro","BA"],
  // PR
  ["Curitiba","PR"],["Londrina","PR"],["Maringá","PR"],["Ponta Grossa","PR"],
  ["Cascavel","PR"],["São José dos Pinhais","PR"],["Foz do Iguaçu","PR"],
  ["Colombo","PR"],["Guarapuava","PR"],["Paranaguá","PR"],["Araucária","PR"],
  ["Toledo","PR"],["Apucarana","PR"],["Pinhais","PR"],["Campo Largo","PR"],
  ["Almirante Tamandaré","PR"],["Umuarama","PR"],["Sarandi","PR"],
  // GO / DF
  ["Goiânia","GO"],["Aparecida de Goiânia","GO"],["Anápolis","GO"],
  ["Rio Verde","GO"],["Luziânia","GO"],["Águas Lindas de Goiás","GO"],
  ["Brasília","DF"],["Ceilândia","DF"],["Taguatinga","DF"],["Samambaia","DF"],
  ["Gama","DF"],["Planaltina","DF"],
  // ES
  ["Vitória","ES"],["Serra","ES"],["Vila Velha","ES"],["Cariacica","ES"],
  ["Cachoeiro de Itapemirim","ES"],["Linhares","ES"],["Colatina","ES"],
  // MS / MT
  ["Campo Grande","MS"],["Dourados","MS"],["Três Lagoas","MS"],
  ["Cuiabá","MT"],["Várzea Grande","MT"],["Rondonópolis","MT"],
  // Norte / Nordeste
  ["Manaus","AM"],["Belém","PA"],["Fortaleza","CE"],["Recife","PE"],
  ["São Luís","MA"],["Teresina","PI"],["Natal","RN"],["Maceió","AL"],
  ["Aracaju","SE"],["João Pessoa","PB"],["Porto Velho","RO"],["Rio Branco","AC"],
  ["Boa Vista","RR"],["Macapá","AP"],["Palmas","TO"],
  ["Caucaia","CE"],["Maracanaú","CE"],["Sobral","CE"],
  ["Caruaru","PE"],["Olinda","PE"],["Petrolina","PE"],["CARUARU","PE"],
  ["Mossoró","RN"],["Campina Grande","PB"],["Feira Grande","AL"],
  ["Imperatriz","MA"],["Timon","MA"],
];

export const BRAZIL_CITIES: BrazilCity[] = RAW_CITIES.map(([name, uf]) => ({
  name,
  normalized: norm(name),
  uf,
}));

export function normalizeCityText(s: string): string {
  return norm(s);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findCityInText(text: string): { name: string; uf: string } | null {
  const t = norm(text);
  // Cidades mais longas têm prioridade (evita match parcial)
  const sorted = [...BRAZIL_CITIES].sort((a, b) => b.normalized.length - a.normalized.length);
  for (const city of sorted) {
    const re = new RegExp(`(?:^|[\\s,/\\-])${escapeRegex(city.normalized)}(?:[\\s,/\\-]|$)`);
    if (re.test(t)) return { name: city.name, uf: city.uf };
  }
  return null;
}
