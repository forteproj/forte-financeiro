import {
  db,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, writeBatch, increment,
} from './firebase-config.js';

export { increment };

// ════════════════════════════════════════════
//  PLANO DE CONTAS
// ════════════════════════════════════════════
export async function carregarPlanoContas() {
  const snap = await getDocs(collection(db, 'planoContas'));
  if (snap.empty) {
    await seedPlanoContas();
    return [...PLANO_SEED];
  }
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

async function seedPlanoContas() {
  const batch = writeBatch(db);
  PLANO_SEED.forEach(cat => {
    batch.set(doc(db, 'planoContas', cat.id), cat);
  });
  await batch.commit();
}

export async function salvarCategoria(cat) {
  await setDoc(doc(db, 'planoContas', cat.id), cat);
}

export async function toggleCategoriaAtiva(id, ativa) {
  await updateDoc(doc(db, 'planoContas', id), { ativa });
}

export async function deletarCategoria(id) {
  await deleteDoc(doc(db, 'planoContas', id));
}

// ════════════════════════════════════════════
//  CONTRATOS
// ════════════════════════════════════════════
export async function carregarContratos() {
  const snap = await getDocs(collection(db, 'contratos'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente));
}

export async function buscarContrato(id) {
  const snap = await getDoc(doc(db, 'contratos', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function criarContrato(contrato) {
  const ref = await addDoc(collection(db, 'contratos'), {
    ...contrato,
    cadastradoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function atualizarContrato(id, dados) {
  await updateDoc(doc(db, 'contratos', id), dados);
}

export async function deletarContrato(id) {
  await deleteDoc(doc(db, 'contratos', id));
}

export async function buscarContratoPorNum(numContrato) {
  const q = query(
    collection(db, 'contratos'),
    where('numContrato', '==', numContrato),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function buscarContratoPorCC(ccCodigo) {
  const q = query(
    collection(db, 'contratos'),
    where('ccCodigo', '==', ccCodigo),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ════════════════════════════════════════════
//  LANÇAMENTOS
// ════════════════════════════════════════════
export async function salvarLancamento(lanc) {
  const ref = await addDoc(collection(db, 'lancamentos'), {
    ...lanc,
    lancadoEm: serverTimestamp(),
    syncedToSheets: false,
  });
  return ref.id;
}

export async function carregarLancamentosRecentes(tipo, qtd = 8) {
  const q = query(
    collection(db, 'lancamentos'),
    where('tipo', '==', tipo),
    orderBy('data', 'desc'),
    limit(qtd)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function contarLancamentos(tipo) {
  const q = query(collection(db, 'lancamentos'), where('tipo', '==', tipo));
  const snap = await getDocs(q);
  return snap.size;
}

export async function carregarLancamentos(ano) {
  const q = query(
    collection(db, 'lancamentos'),
    where('ano', '==', ano)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

export async function deletarLancamento(id) {
  await deleteDoc(doc(db, 'lancamentos', id));
}

export async function atualizarLancamento(id, dados) {
  await updateDoc(doc(db, 'lancamentos', id), dados);
}

export async function buscarLancamento(id) {
  const snap = await getDoc(doc(db, 'lancamentos', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function buscarRetencoesDaReceita(nrDoc) {
  const q = query(
    collection(db, 'lancamentos'),
    where('nrDoc', '==', nrDoc),
    where('formaPgto', '==', 'Retenção')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ════════════════════════════════════════════
//  USUÁRIOS (administração)
// ════════════════════════════════════════════
export async function carregarUsuarios() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function toggleStatusUsuario(uid, novoStatus) {
  await updateDoc(doc(db, 'users', uid), { status: novoStatus });
}

// ════════════════════════════════════════════
//  FORNECEDORES
// ════════════════════════════════════════════
export async function carregarFornecedores() {
  const snap = await getDocs(collection(db, 'fornecedores'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function salvarFornecedor(dados) {
  const ref = await addDoc(collection(db, 'fornecedores'), {
    ...dados,
    cadastradoEm: serverTimestamp(),
  });
  return ref.id;
}

// ════════════════════════════════════════════
//  SEED — Plano de Contas completo
// ════════════════════════════════════════════
const PLANO_SEED = [
  // 1.x RECEITA
  { id:'1.1.001', grupo:'1', desc:'Receita de Serviços (NFS-e)',                         cc:'CC-CLI-xxx', tipo:'receita',  ex:'NFS-e emitida para Pref. BH — sinalização horizontal',        ativa:true },
  // 2.x RETENÇÕES
  { id:'2.1.001', grupo:'2', desc:'ISS Retido',                                          cc:'CC-CLI-xxx', tipo:'despesa', ex:'ISS retido na fonte pela prefeitura na NFS-e',                  ativa:true },
  { id:'2.1.002', grupo:'2', desc:'INSS Retido',                                         cc:'CC-CLI-xxx', tipo:'despesa', ex:'INSS retido conforme art. 31 Lei 8.212',                        ativa:true },
  { id:'2.1.003', grupo:'2', desc:'IRRF Retido',                                         cc:'CC-CLI-xxx', tipo:'despesa', ex:'IR retido na fonte sobre serviço',                              ativa:true },
  { id:'2.1.004', grupo:'2', desc:'PCC/CSRF Retido (PIS/COFINS/CSLL)',                   cc:'CC-CLI-xxx', tipo:'despesa', ex:'Retenção federal — Lei 10.833',                                 ativa:true },
  { id:'2.2.001', grupo:'2', desc:'ISS a Recolher (próprio)',                            cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'ISS sobre serviços sem retenção na fonte',                      ativa:true },
  { id:'2.2.002', grupo:'2', desc:'Tributos Federais a Recolher (próprio)',              cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'DARF IRPJ/CSLL/PIS/COFINS próprios',                           ativa:true },
  // 3.x CUSTOS DIRETOS
  { id:'3.1.001', grupo:'3', desc:'Tintas / Resinas / Pigmentos / Solventes',            cc:'CC-CLI-xxx', tipo:'despesa', ex:'Compra de tinta para obra em BH',                              ativa:true },
  { id:'3.1.002', grupo:'3', desc:'Termoplástico / Pré-formado / Massas',               cc:'CC-CLI-xxx', tipo:'despesa', ex:'Compra de termoplástico para Caxias',                           ativa:true },
  { id:'3.1.003', grupo:'3', desc:'Microesferas / Aditivos / Agregados',                cc:'CC-CLI-xxx', tipo:'despesa', ex:'Microesferas para retrorrefletância',                           ativa:true },
  { id:'3.1.004', grupo:'3', desc:'Dispositivos — Tachas / Tachões',                    cc:'CC-CLI-xxx', tipo:'despesa', ex:'Compra de tachões para Santos',                                 ativa:true },
  { id:'3.1.005', grupo:'3', desc:'Placas / Chapas / Suportes',                         cc:'CC-CLI-xxx', tipo:'despesa', ex:'Placas de sinalização vertical',                               ativa:true },
  { id:'3.1.006', grupo:'3', desc:'EPIs / Uniformes das Equipes',                       cc:'CC-CLI-xxx', tipo:'despesa', ex:'EPIs para equipe da obra',                                      ativa:true },
  { id:'3.1.007', grupo:'3', desc:'Sinalização Temporária — Cones / Cavaletes',         cc:'CC-CLI-xxx', tipo:'despesa', ex:'Cones para sinalização de obra',                               ativa:true },
  { id:'3.2.001', grupo:'3', desc:'MO Operacional — Rateio de Folha',                   cc:'CC-CLI-xxx', tipo:'despesa', ex:'Rateio mensal por dias-equipe',                                ativa:true },
  { id:'3.2.900', grupo:'3', desc:'Folha Operacional Bruta',                            cc:'CC-ADM-02-FOLHA DE PAGAMENTO',  tipo:'despesa', ex:'Salários CLT das equipes de campo',                             ativa:true },
  { id:'3.2.901', grupo:'3', desc:'Encargos Operacionais — INSS / FGTS / RAT',         cc:'CC-ADM-02-FOLHA DE PAGAMENTO',  tipo:'despesa', ex:'INSS/FGTS patronal das equipes',                               ativa:true },
  { id:'3.2.902', grupo:'3', desc:'Benefícios Operacionais — VA / VT',                 cc:'CC-ADM-02-FOLHA DE PAGAMENTO',  tipo:'despesa', ex:'Vale transporte e alimentação equipes',                        ativa:true },
  { id:'3.2.903', grupo:'3', desc:'Horas Extras / Adicionais Operacionais',             cc:'CC-ADM-02-FOLHA DE PAGAMENTO',  tipo:'despesa', ex:'Horas extras das equipes de campo',                            ativa:true },
  { id:'3.3.001', grupo:'3', desc:'Combustível Operacional',                            cc:'CC-CLI-xxx', tipo:'despesa', ex:'Abastecimento de caminhão em obra',                             ativa:true },
  { id:'3.3.002', grupo:'3', desc:'Manutenção / Peças / Pneus (Operação)',              cc:'CC-CLI-xxx', tipo:'despesa', ex:'Troca de pneus do veículo de obra',                            ativa:true },
  { id:'3.3.003', grupo:'3', desc:'Locação de Equipamentos / Veículos',                 cc:'CC-CLI-xxx', tipo:'despesa', ex:'Locação de equipamento para Juiz de Fora',                     ativa:true },
  { id:'3.4.001', grupo:'3', desc:'Fretes (Operação)',                                  cc:'CC-CLI-xxx', tipo:'despesa', ex:'Frete de material para Cascavel',                              ativa:true },
  { id:'3.4.002', grupo:'3', desc:'Pedágios / Estacionamento',                          cc:'CC-CLI-xxx', tipo:'despesa', ex:'Pedágio equipe em deslocamento',                               ativa:true },
  { id:'3.4.003', grupo:'3', desc:'Hospedagem / Alimentação em Obra',                  cc:'CC-CLI-xxx', tipo:'despesa', ex:'Hotel da equipe durante execução',                             ativa:true },
  { id:'3.5.001', grupo:'3', desc:'Terceiros / Subcontratos (Operação)',                cc:'CC-CLI-xxx', tipo:'despesa', ex:'Subcontrato de serviço auxiliar',                              ativa:true },
  { id:'3.6.001', grupo:'3', desc:'Retrabalho Operacional',                             cc:'CC-CLI-xxx', tipo:'despesa', ex:'Refazer faixa rejeitada pelo cliente',                        ativa:true },
  { id:'3.6.002', grupo:'3', desc:'Glosas / Ajustes de Medição',                       cc:'CC-CLI-xxx', tipo:'despesa', ex:'Glosa em medição pelo cliente',                               ativa:true },
  { id:'3.7.001', grupo:'3', desc:'Estrutura de Obra — Canteiro / Galpão / Energia exclusiva', cc:'CC-CLI-xxx', tipo:'despesa', ex:'Aluguel de galpão exclusivo para obra POA', ativa:true },
  { id:'3.8.001', grupo:'3', desc:'ART / Responsabilidade Técnica por Obra',            cc:'CC-CLI-xxx', tipo:'despesa', ex:'ART do contrato vinculado',                                    ativa:true },
  { id:'3.8.002', grupo:'3', desc:'Prêmio de Seguro Garantia (Apólice por Contrato)',   cc:'CC-CLI-xxx', tipo:'despesa', ex:'Apólice de seguro garantia por contrato',                     ativa:true },
  // 4.x ADM
  { id:'4.1.001', grupo:'4', desc:'Pró-labore / Salários Pessoal Escritório',           cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Pró-labore dos sócios + escritório',                           ativa:true },
  { id:'4.1.002', grupo:'4', desc:'Encargos ADM (INSS / FGTS / RAT)',                  cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Encargos sobre folha administrativa',                          ativa:true },
  { id:'4.1.003', grupo:'4', desc:'Benefícios ADM (VA / VT)',                          cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'VA/VT do pessoal de escritório',                              ativa:true },
  { id:'4.2.001', grupo:'4', desc:'Aluguel / Condomínio — Escritório Central',         cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Aluguel sede',                                                  ativa:true },
  { id:'4.2.002', grupo:'4', desc:'Energia / Água — Escritório Central',               cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Contas da sede',                                               ativa:true },
  { id:'4.2.003', grupo:'4', desc:'Internet / Telefonia',                               cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Internet e telefonia da sede',                                ativa:true },
  { id:'4.2.004', grupo:'4', desc:'Softwares / Sistemas / Licenças',                   cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Conta Azul, licenças de software',                            ativa:true },
  { id:'4.2.005', grupo:'4', desc:'Seguro de Frota / Equipamentos',                    cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Seguro anual da frota — corporativo',                         ativa:true },
  { id:'4.3.001', grupo:'4', desc:'Contabilidade',                                     cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Honorários contábeis mensais',                                 ativa:true },
  { id:'4.3.002', grupo:'4', desc:'Jurídico',                                           cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Assessoria jurídica',                                          ativa:true },
  { id:'4.4.001', grupo:'4', desc:'Certidões / Taxas de Licitação',                    cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Certidão / taxa para licitação',                              ativa:true },
  { id:'4.4.002', grupo:'4', desc:'Viagens / Visitas Técnicas (Comercial)',             cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Viagem comercial para visita técnica',                        ativa:true },
  { id:'4.5.001', grupo:'4', desc:'Material de Escritório',                             cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Papelaria e material de escritório',                          ativa:true },
  // 5.x FINANCEIRO
  { id:'5.1.001', grupo:'5', desc:'Tarifas Bancárias',                                  cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Tarifas bancárias do mês',                                    ativa:true },
  { id:'5.1.002', grupo:'5', desc:'Juros / Encargos Financeiros',                       cc:'CC-ADM-01-MATRIZ',  tipo:'despesa', ex:'Juros sobre financiamento',                                   ativa:true },
  { id:'5.2.001', grupo:'5', desc:'Receitas Financeiras',                               cc:'CC-ADM-01-MATRIZ',  tipo:'receita', ex:'Rendimento de aplicação financeira',                          ativa:true },
  // 6.x CAPEX
  { id:'6.1.001', grupo:'6', desc:'Investimentos / Imobilizado — CAPEX (acima R$ 2.500)', cc:'CC-ADM-03-INVESTIMENTOS', tipo:'despesa', ex:'Compra de máquina Hotspray ou veículo',                     ativa:true },
];
