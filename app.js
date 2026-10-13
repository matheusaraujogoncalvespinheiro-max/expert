/**
 * EXPERT SUPORTE — LÓGICA DA APLICAÇÃO
 * Sistema de Chamados & Chat estilo WhatsApp
 */

import Chart from 'chart.js/auto';
import {
  initFirebaseService,
  isUsingFirebase,
  getGlobalMetrics,
  cleanupOldHistory,
  shouldRunAutoCleanup,
  syncUsersWithFirebase,
  saveUserToFirestore,
  deleteUserFromFirestore,
  syncTicketsWithFirebase,
  saveTicketToFirestore,
  updateTicketInFirestore,
  sendMessageToFirestore,
  subscribeToTicketMessages
} from './firebase-service.js';
import { isFirebaseConfigured, getActiveFirebaseConfig } from './firebase-config.js';

// =============================================================================
// 1. BANCO DE DADOS LOCAL (LOCALSTORAGE COM SINCRONIZAÇÃO EM TEMPO REAL)
// =============================================================================

const STORAGE_KEYS = {
  USERS: 'expert_users_v6',
  TICKETS: 'expert_tickets_v6',
  MESSAGES: 'expert_messages_v6',
  CURRENT_USER: 'expert_current_user_v6',
  ACTIVE_TICKET: 'expert_active_ticket_v6'
};

// Dados padrão iniciais exclusivos do Hospital Geral (HGP) - Todos do CPD TI
const INITIAL_USERS = [
  {
    id: 'user-admin-1',
    nome: 'Administrador TI',
    cpf: '000.000.000-00',
    senha: 'admin123',
    perfil: 'admin',
    setor: 'CPD TI'
  },
  {
    id: 'user-solicitante-1',
    nome: 'Mariana Costa',
    cpf: '111.222.333-44',
    senha: '123',
    perfil: 'solicitante',
    setor: 'CPD TI'
  },
  {
    id: 'user-prestador-1',
    nome: 'Lucas Mendes',
    cpf: '999.888.777-66',
    senha: '123',
    perfil: 'prestador',
    setor: 'CPD TI'
  }
];

const INITIAL_TICKETS = [
  {
    id: 'EXP-101',
    titulo: 'Impressora térmica de pulseiras de identificação travada',
    local: 'HGP - Triagem / Pronto-Socorro (Recepção 1)',
    categoria: 'Impressora de Pulseiras / Etiquetas',
    prioridade: 'urgente',
    status: 'aberto',
    descricao: 'A impressora térmica Zebra de pulseiras de pacientes travou a bobina e não traciona. Está com luz vermelha acesa e não estamos conseguindo identificar os pacientes que chegam na emergência.',
    solicitanteCpf: '111.222.333-44',
    solicitanteNome: 'Mariana Costa',
    prestadorCpf: null,
    prestadorNome: null,
    solucao: null,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    finishedAt: null
  },
  {
    id: 'EXP-102',
    titulo: 'Papel enroscando e atolando nos roletes da impressora de prescrições',
    local: 'HGP - Posto de Enfermagem (Ala Cirúrgica - 2º Andar)',
    categoria: 'Atolamento / Enrosco de Papel',
    prioridade: 'alta',
    status: 'em_andamento',
    descricao: 'A impressora puxa a folha torta e atola logo na entrada do rolo fusor. As prescrições médicas estão rasgando ao tentar imprimir.',
    solicitanteCpf: '111.222.333-44',
    solicitanteNome: 'Mariana Costa',
    prestadorCpf: '999.888.777-66',
    prestadorNome: 'Lucas Mendes',
    solucao: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    finishedAt: null
  },
  {
    id: 'EXP-103',
    titulo: 'Substituição da guilhotina e rolete tracionador na impressora de etiquetas',
    local: 'HGP - Farmácia Central (Dispensação de Medicamentos)',
    categoria: 'Guilhotina / Roletes / Barulho',
    prioridade: 'media',
    status: 'encerrado',
    descricao: 'A guilhotina não estava cortando as etiquetas adesivas de medicação e o rolete patinava fazendo barulho mecânico ao tracionar a fita.',
    solicitanteCpf: '111.222.333-44',
    solicitanteNome: 'Mariana Costa',
    prestadorCpf: '999.888.777-66',
    prestadorNome: 'Lucas Mendes',
    solucao: 'Desmontagem do bloco mecânico, troca da navalha da guilhotina e substituição do rolete tracionador (pickup roller). Lubrificação das engrenagens e teste com 40 etiquetas 100% normalizadas.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    finishedAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString()
  }
];

const INITIAL_MESSAGES = [
  {
    id: 'msg-1',
    ticketId: 'EXP-101',
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: '📢 Chamado de manutenção aberto por Mariana Costa. Local: HGP - Triagem / Pronto-Socorro. Aguardando técnico da Expert.',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-2',
    ticketId: 'EXP-102',
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: '📢 Chamado de manutenção aberto por Mariana Costa.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-3',
    ticketId: 'EXP-102',
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: '🛠️ O técnico Lucas Mendes aceitou este chamado e está a caminho do Posto de Enfermagem.',
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-4',
    ticketId: 'EXP-102',
    senderCpf: '999.888.777-66',
    senderNome: 'Lucas Mendes',
    senderRole: 'prestador',
    text: 'Olá Mariana! Vi que a impressora de prescrições da Ala Cirúrgica está enroscando as folhas. Já peguei as peças de reposição e estou subindo para o 2º Andar.',
    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-5',
    ticketId: 'EXP-101',
    senderCpf: '111.222.333-44',
    senderNome: 'Mariana Costa',
    senderRole: 'solicitante',
    text: 'Técnico, conseguem verificar a impressora de pulseiras da triagem logo em seguida? Estamos com muitos pacientes para admissão.',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-6',
    ticketId: 'EXP-102',
    senderCpf: '999.888.777-66',
    senderNome: 'Lucas Mendes',
    senderRole: 'prestador',
    text: 'Com certeza Mariana! Assim que ajustar a mecânica da impressora aqui no 2º andar já desço direto para a triagem.',
    timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString()
  }
];

// Funções de Acesso ao Storage
function getStorage(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error('Erro ao ler localStorage', e);
    return defaultValue;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Erro ao salvar no localStorage', e);
  }
}

// Inicializar banco padrão se não existir e migrar para CPD TI
function initDatabase() {
  let users = getStorage(STORAGE_KEYS.USERS, null);
  if (!users) {
    setStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  } else {
    // Normalizar usuários existentes para CPD TI e nomes limpos sem parênteses
    let changed = false;
    users = users.map(u => {
      let cleanName = u.nome.replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanName === 'Administrador' || cleanName === 'Administrador Expert') {
        cleanName = 'Administrador TI';
      }
      if (cleanName !== u.nome || u.setor !== 'CPD TI' || u.telefone) {
        changed = true;
      }
      const updated = { ...u, nome: cleanName, setor: 'CPD TI' };
      delete updated.telefone;
      return updated;
    });
    if (changed) {
      setStorage(STORAGE_KEYS.USERS, users);
    }
  }

  // Também atualizar currentUser se já estiver salvo
  if (currentUser) {
    let cleanName = currentUser.nome.replace(/\s*\([^)]*\)/g, '').trim();
    if (cleanName === 'Administrador' || cleanName === 'Administrador Expert') {
      cleanName = 'Administrador TI';
    }
    currentUser.nome = cleanName;
    currentUser.setor = 'CPD TI';
    delete currentUser.telefone;
    setStorage(STORAGE_KEYS.CURRENT_USER, currentUser);
  }

  // Normalizar nomes em chamados existentes
  let tickets = getStorage(STORAGE_KEYS.TICKETS, null);
  if (!tickets) {
    setStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  } else {
    let tChanged = false;
    tickets = tickets.map(t => {
      let sNome = t.solicitanteNome ? t.solicitanteNome.replace(/\s*\([^)]*\)/g, '').trim() : t.solicitanteNome;
      let pNome = t.prestadorNome ? t.prestadorNome.replace(/\s*\([^)]*\)/g, '').trim() : t.prestadorNome;
      if (sNome !== t.solicitanteNome || pNome !== t.prestadorNome) {
        tChanged = true;
      }
      return { ...t, solicitanteNome: sNome, prestadorNome: pNome };
    });
    if (tChanged) {
      setStorage(STORAGE_KEYS.TICKETS, tickets);
    }
  }

  if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
    setStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  }
}

// =============================================================================
// 2. ESTADO DA SESSÃO ATUAL
// =============================================================================

let currentUser = getStorage(STORAGE_KEYS.CURRENT_USER, null);
let activeTicketId = getStorage(STORAGE_KEYS.ACTIVE_TICKET, null);
let activeFilter = 'todos';
let searchQuery = '';

initDatabase();

// =============================================================================
// 3. EFEITOS SONOROS (WEB AUDIO API SINTETIZADA)
// =============================================================================

let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'sent') {
      // Som estilo 'pop/click' de envio
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'received') {
      // Som estilo 'ping' suave de mensagem recebida
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'success') {
      // Som de chamado encerrado / comemoração
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'alert') {
      // Som de alerta urgente de novo chamado para o prestador
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    // Silencioso se o navegador bloquear autoplay
  }
}

// =============================================================================
// 4. MÁSCARAS E UTILITÁRIOS
// =============================================================================

function maskCPF(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  input.value = v;
}

function maskPhone(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (v.length > 5) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  } else {
    v = v.replace(/^(\d*)/, '($1');
  }
  input.value = v;
}

function cleanDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  if (!name) return 'EX';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showToast(message, type = 'info', duration = 4000, onClick = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div>${message}</div>`;
  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.title = 'Clique para ver o chamado';
    toast.onclick = (e) => {
      onClick(e);
      toast.remove();
    };
  }
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// =============================================================================
// 5. TELAS E AUTENTICAÇÃO (LOGIN & REGISTRO)
// =============================================================================

// =============================================================================
// 5. TELAS E AUTENTICAÇÃO (LOGIN DIRETO POR CPF E PORTAL DO ADM)
// =============================================================================

function switchToAdminLogin() {
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-admin-login').classList.remove('hidden');
  document.getElementById('auth-title').textContent = 'Acesso do Administrador';
  document.getElementById('auth-desc').textContent = 'Área restrita para gestão e cadastro de usuários.';
}

function switchToUserLogin() {
  document.getElementById('form-admin-login').classList.add('hidden');
  document.getElementById('form-login').classList.remove('hidden');
  document.getElementById('auth-title').textContent = 'Acesso ao Sistema';
  document.getElementById('auth-desc').textContent = 'Informe seu CPF e senha para acessar os chamados.';
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}

// Preenchimento com 1 clique para demonstração imediata
function fillDemo(role) {
  switchToUserLogin();
  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  const target = users.find(u => u.perfil === role);
  if (target) {
    document.getElementById('login-cpf').value = target.cpf;
    document.getElementById('login-senha').value = target.senha;
    showToast(`Credenciais de ${role.toUpperCase()} preenchidas!`, 'info');
  }
}

function fillAdminDemo() {
  document.getElementById('admin-cpf').value = 'admin';
  document.getElementById('admin-senha').value = 'admin123';
  showToast('Credenciais do Administrador preenchidas!', 'info');
}

// Login de Usuários (Solicitante ou Prestador) — Apenas CPF e Senha
function handleLoginSubmit(event) {
  event.preventDefault();
  const cpfInput = document.getElementById('login-cpf').value.trim();
  const senhaInput = document.getElementById('login-senha').value.trim();

  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  const user = users.find(u => cleanDigits(u.cpf) === cleanDigits(cpfInput));

  if (!user) {
    showToast('CPF não encontrado. Solicite o seu cadastro ao Administrador da Expert.', 'info');
    return;
  }

  if (user.senha !== senhaInput) {
    showToast('Senha incorreta! Verifique os dados ou contate o Administrador.', 'info');
    return;
  }

  loginSuccess(user);
}

// Login Específico do Administrador
function handleAdminLoginSubmit(event) {
  event.preventDefault();
  const userOrCpf = document.getElementById('admin-cpf').value.trim().toLowerCase();
  const senhaInput = document.getElementById('admin-senha').value.trim();

  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  
  // O ADM pode logar como 'admin' ou com o CPF 000.000.000-00 ou qualquer usuário com perfil 'admin'
  let adminUser = users.find(u => 
    (u.perfil === 'admin' && (cleanDigits(u.cpf) === cleanDigits(userOrCpf) || userOrCpf === 'admin')) ||
    (userOrCpf === 'admin' && u.perfil === 'admin')
  );

  if (!adminUser && (userOrCpf === 'admin' || userOrCpf === '00000000000')) {
    // Garantir criação do admin se não existir
    adminUser = INITIAL_USERS[0];
    users.unshift(adminUser);
    setStorage(STORAGE_KEYS.USERS, users);
  }

  if (!adminUser) {
    showToast('Administrador não localizado.', 'info');
    return;
  }

  if (senhaInput !== adminUser.senha && senhaInput !== 'admin123') {
    showToast('Senha do Administrador incorreta!', 'info');
    return;
  }

  loginSuccess(adminUser);
}

function loginSuccess(user) {
  currentUser = user;
  setStorage(STORAGE_KEYS.CURRENT_USER, user);
  showToast(`Bem-vindo, ${user.nome}!`, 'success');
  playSound('sent');

  if (currentUser.perfil === 'prestador') {
    activeFilter = 'disponiveis';
  } else {
    activeFilter = 'todos';
  }

  renderApp();
}

function handleLogout() {
  currentUser = null;
  activeTicketId = null;
  setStorage(STORAGE_KEYS.CURRENT_USER, null);
  setStorage(STORAGE_KEYS.ACTIVE_TICKET, null);
  switchToUserLogin();
  renderApp();
  showToast('Sessão encerrada com sucesso.', 'info');
}

// Alternar perfil rapidamente sem precisar deslogar (ótimo para testar como Solicitante e Prestador)
function toggleQuickSwitchMenu() {
  const menu = document.getElementById('quick-options-menu');
  menu.classList.toggle('hidden');
}

function quickSwitchRole() {
  const menu = document.getElementById('quick-options-menu');
  menu.classList.add('hidden');

  if (!currentUser) return;
  const newRole = currentUser.perfil === 'solicitante' ? 'prestador' : 'solicitante';
  currentUser.perfil = newRole;

  // Atualizar no storage
  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  const idx = users.findIndex(u => cleanDigits(u.cpf) === cleanDigits(currentUser.cpf));
  if (idx !== -1) {
    users[idx].perfil = newRole;
    setStorage(STORAGE_KEYS.USERS, users);
  }
  setStorage(STORAGE_KEYS.CURRENT_USER, currentUser);

  activeFilter = newRole === 'prestador' ? 'disponiveis' : 'todos';

  showToast(`Perfil alternado para ${newRole.toUpperCase()} com sucesso!`, 'info');
  renderApp();
}

// =============================================================================
// 5.1 PAINEL EXCLUSIVO DO ADMINISTRADOR (CADASTRO E GESTÃO DE USUÁRIOS)
// =============================================================================

function renderAdminPanel() {
  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);

  // Métricas
  const totalSolicitantes = users.filter(u => u.perfil === 'solicitante').length;
  const totalPrestadores = users.filter(u => u.perfil === 'prestador').length;
  const totalPendentes = tickets.filter(t => t.status === 'aberto' || t.status === 'em_andamento').length;
  const totalConcluidos = tickets.filter(t => t.status === 'encerrado').length;

  document.getElementById('metric-solicitantes').textContent = totalSolicitantes;
  document.getElementById('metric-prestadores').textContent = totalPrestadores;
  document.getElementById('metric-pendentes').textContent = totalPendentes;
  document.getElementById('metric-concluidos').textContent = totalConcluidos;

  // Atualizar Contagem Vitalícia de Chamados Abertos e Status de Retenção
  getGlobalMetrics(tickets).then(metrics => {
    const el = document.getElementById('metric-total-abertos');
    if (el) el.textContent = metrics.lifetimeCount;

    const retText = document.getElementById('retention-status-text');
    if (retText) {
      const lastDate = metrics.lastCleanup ? new Date(metrics.lastCleanup).toLocaleDateString('pt-BR') : 'Hoje';
      retText.innerHTML = `Chamados encerrados há mais de 21 dias são arquivados para manter o Firebase leve. Contagem vitalícia: <strong>${metrics.lifetimeCount} chamados abertos</strong> (Última limpeza: ${lastDate} • ${metrics.totalPurged} arquivados).`;
    }
  });

  const fbBadge = document.getElementById('firebase-status-badge');
  if (fbBadge) {
    fbBadge.textContent = isUsingFirebase() ? '🔥 Firestore Conectado' : '💾 Banco Local Otimizado';
  }

  // Renderizar Gráficos no Painel ADM
  setTimeout(() => {
    renderAdminCharts(tickets);
  }, 50);

  // Renderizar Tabela de Usuários
  const tbody = document.getElementById('admin-users-tbody');
  let html = '';

  users.forEach(u => {
    let rolePillClass = 'solicitante';
    let roleLabel = 'Solicitante';
    if (u.perfil === 'prestador') {
      rolePillClass = 'prestador';
      roleLabel = 'Prestador Expert';
    } else if (u.perfil === 'admin') {
      rolePillClass = 'prestador';
      roleLabel = 'Administrador';
    }

    const canDelete = u.perfil !== 'admin';

    html += `
      <tr>
        <td>
          <div class="admin-user-cell">
            <div class="user-avatar-mini">${getInitials(u.nome)}</div>
            <strong>${u.nome}</strong>
          </div>
        </td>
        <td><code>${u.cpf}</code></td>
        <td><span class="role-pill ${rolePillClass}">${roleLabel}</span></td>
        <td><span class="dept-pill" style="font-size: 0.72rem; padding: 2px 8px;">CPD TI</span></td>
        <td style="text-align: right;">
          ${canDelete ? `
            <button type="button" class="btn-del-user" onclick="deleteUser('${u.cpf}')" title="Excluir usuário">
              🗑️ Excluir
            </button>
          ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">Sistema</span>'}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function handleAdminRoleToggle(role) {
  // CPD TI é unificado para todos os membros
}

function handleAdminCreateUser(event) {
  event.preventDefault();

  const nome = document.getElementById('adm-reg-nome').value.trim();
  const cpf = document.getElementById('adm-reg-cpf').value.trim();
  const senha = document.getElementById('adm-reg-senha').value.trim();
  const setor = 'CPD TI';

  // Obter perfil selecionado
  const radios = document.getElementsByName('admin-reg-role');
  let perfil = 'solicitante';
  for (const r of radios) {
    if (r.checked) perfil = r.value;
  }

  if (cleanDigits(cpf).length < 11) {
    showToast('Informe um CPF válido com 11 dígitos.', 'info');
    return;
  }

  const users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  const exists = users.find(u => cleanDigits(u.cpf) === cleanDigits(cpf));
  if (exists) {
    showToast('Este CPF já está cadastrado no sistema!', 'info');
    return;
  }

  const newUser = {
    id: 'user-' + Date.now(),
    nome,
    cpf,
    setor: 'CPD TI',
    senha,
    perfil
  };

  users.push(newUser);
  setStorage(STORAGE_KEYS.USERS, users);
  saveUserToFirestore(newUser);

  document.getElementById('form-admin-register').reset();
  showToast(`Usuário ${nome} (${perfil.toUpperCase()}) cadastrado no CPD TI com sucesso!`, 'success');
  playSound('sent');

  renderAdminPanel();
  window.dispatchEvent(new Event('storage'));
}

function deleteUser(cpf) {
  if (!confirm(`Deseja realmente remover o usuário com CPF ${cpf}?`)) return;

  let users = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  users = users.filter(u => cleanDigits(u.cpf) !== cleanDigits(cpf));
  setStorage(STORAGE_KEYS.USERS, users);
  deleteUserFromFirestore(cpf);

  showToast('Usuário removido com sucesso.', 'info');
  renderAdminPanel();
  window.dispatchEvent(new Event('storage'));
}

function enterAppFromAdmin() {
  // Permite ao Administrador entrar no chat para auditar os chamados
  const adminPanel = document.getElementById('admin-panel');
  const mainApp = document.getElementById('main-app');

  adminPanel.classList.add('hidden');
  mainApp.classList.remove('hidden');

  renderFilterTabs();
  renderTicketsList();
  renderActiveChat();
}

// Fechar menus se clicar fora
document.addEventListener('click', (e) => {
  const menu = document.getElementById('quick-options-menu');
  const btn = e.target.closest('button[onclick*="toggleQuickSwitchMenu"]');
  if (menu && !menu.classList.contains('hidden') && !btn && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }

  const attachPopup = document.getElementById('attach-popup');
  const attachBtn = e.target.closest('.btn-attach');
  if (attachPopup && !attachPopup.classList.contains('hidden') && !attachBtn && !attachPopup.contains(e.target)) {
    attachPopup.classList.add('hidden');
  }
});

// =============================================================================
// 6. RENDERIZAÇÃO DA INTERFACE PRINCIPAL
// =============================================================================

function renderApp() {
  const authScreen = document.getElementById('auth-screen');
  const mainApp = document.getElementById('main-app');
  const adminPanel = document.getElementById('admin-panel');

  if (!currentUser) {
    authScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    adminPanel.classList.add('hidden');
    return;
  }

  // Se o usuário logado for o Administrador, abrir o Painel ADM
  if (currentUser.perfil === 'admin') {
    authScreen.classList.add('hidden');
    mainApp.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    renderAdminPanel();
    return;
  }

  // Se for Solicitante ou Prestador, abrir o Painel de Chamados & Chat
  authScreen.classList.add('hidden');
  adminPanel.classList.add('hidden');
  mainApp.classList.remove('hidden');

  // Atualizar dados do usuário no topo da barra lateral
  document.getElementById('current-user-name').textContent = currentUser.nome;
  document.getElementById('current-user-avatar').textContent = getInitials(currentUser.nome);
  document.getElementById('current-user-cpf').textContent = `CPF: ${currentUser.cpf}`;

  const roleBadge = document.getElementById('current-user-role-badge');
  roleBadge.textContent = currentUser.perfil === 'prestador' ? 'Prestador' : 'Solicitante';
  roleBadge.className = `role-pill ${currentUser.perfil}`;

  const deptBadge = document.getElementById('current-user-dept');
  if (deptBadge) {
    deptBadge.textContent = 'CPD TI';
  }

  // Botão "Novo Chamado" só aparece para solicitantes
  const btnNewTicket = document.getElementById('btn-open-ticket-modal');
  if (btnNewTicket) {
    if (currentUser.perfil === 'solicitante') {
      btnNewTicket.classList.remove('hidden');
    } else {
      btnNewTicket.classList.add('hidden');
    }
  }

  const solicitanteBar = document.getElementById('solicitante-action-bar');
  if (solicitanteBar) {
    if (currentUser.perfil === 'solicitante') {
      solicitanteBar.classList.remove('hidden');
    } else {
      solicitanteBar.classList.add('hidden');
    }
  }

  // Label no menu de troca rápida
  const lblSwitch = document.getElementById('lbl-switch-role');
  if (lblSwitch) {
    lblSwitch.textContent = currentUser.perfil === 'solicitante' ? 'Prestador' : 'Solicitante';
  }

  // Renderizar as abas de filtro adequadas ao perfil
  renderFilterTabs();

  // Renderizar a lista de chamados
  renderTicketsList();

  // Renderizar a janela de chat se houver chamado ativo
  renderActiveChat();
}

function renderFilterTabs() {
  const container = document.getElementById('ticket-filter-bar');
  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);

  let tabsHtml = '';

  if (currentUser.perfil === 'prestador') {
    // Abas do Técnico
    const countDisponiveis = tickets.filter(t => t.status === 'aberto').length;
    const countMeus = tickets.filter(t => cleanDigits(t.prestadorCpf) === cleanDigits(currentUser.cpf) && t.status === 'em_andamento').length;
    const countEncerrados = tickets.filter(t => t.status === 'encerrado').length;

    tabsHtml = `
      <button type="button" class="filter-tab ${activeFilter === 'disponiveis' ? 'active' : ''}" onclick="setFilter('disponiveis')">
        🔔 Disponíveis
        <span class="filter-badge ${countDisponiveis > 0 ? 'pulse' : ''}">${countDisponiveis}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'meus' ? 'active' : ''}" onclick="setFilter('meus')">
        🛠️ Meus Atendimentos
        <span class="filter-badge">${countMeus}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'concluidos' ? 'active' : ''}" onclick="setFilter('concluidos')">
        ✅ Concluídos
        <span class="filter-badge">${countEncerrados}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'todos' ? 'active' : ''}" onclick="setFilter('todos')">
        Todos
        <span class="filter-badge">${tickets.length}</span>
      </button>
    `;
  } else {
    // Abas do Solicitante
    const myTickets = tickets.filter(t => cleanDigits(t.solicitanteCpf) === cleanDigits(currentUser.cpf));
    const countAbertos = myTickets.filter(t => t.status === 'aberto').length;
    const countAndamento = myTickets.filter(t => t.status === 'em_andamento').length;
    const countEncerrados = myTickets.filter(t => t.status === 'encerrado').length;

    tabsHtml = `
      <button type="button" class="filter-tab ${activeFilter === 'todos' ? 'active' : ''}" onclick="setFilter('todos')">
        Todos Meus
        <span class="filter-badge">${myTickets.length}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'abertos' ? 'active' : ''}" onclick="setFilter('abertos')">
        ⏳ Aguardando
        <span class="filter-badge">${countAbertos}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'andamento' ? 'active' : ''}" onclick="setFilter('andamento')">
        💬 Em Atendimento
        <span class="filter-badge">${countAndamento}</span>
      </button>
      <button type="button" class="filter-tab ${activeFilter === 'encerrados' ? 'active' : ''}" onclick="setFilter('encerrados')">
        ✅ Encerrados
        <span class="filter-badge">${countEncerrados}</span>
      </button>
    `;
  }

  container.innerHTML = tabsHtml;
}

function setFilter(filter) {
  activeFilter = filter;
  renderFilterTabs();
  renderTicketsList();
}

function filterTickets() {
  searchQuery = document.getElementById('search-tickets-input').value.trim().toLowerCase();
  renderTicketsList();
}

function renderTicketsList() {
  const container = document.getElementById('tickets-list-container');
  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);

  // Filtrar conforme o perfil e a aba
  let filtered = tickets.filter(ticket => {
    // Se for solicitante, normalmente vê os seus próprios chamados
    if (currentUser.perfil === 'solicitante') {
      const isMine = cleanDigits(ticket.solicitanteCpf) === cleanDigits(currentUser.cpf);
      if (!isMine) return false;

      if (activeFilter === 'abertos') return ticket.status === 'aberto';
      if (activeFilter === 'andamento') return ticket.status === 'em_andamento';
      if (activeFilter === 'encerrados') return ticket.status === 'encerrado';
      return true;
    } else {
      // Se for prestador
      if (activeFilter === 'disponiveis') return ticket.status === 'aberto';
      if (activeFilter === 'meus') {
        return cleanDigits(ticket.prestadorCpf) === cleanDigits(currentUser.cpf) && ticket.status === 'em_andamento';
      }
      if (activeFilter === 'concluidos') return ticket.status === 'encerrado';
      return true;
    }
  });

  // Busca textual
  if (searchQuery) {
    filtered = filtered.filter(t => 
      t.id.toLowerCase().includes(searchQuery) ||
      t.titulo.toLowerCase().includes(searchQuery) ||
      t.local.toLowerCase().includes(searchQuery) ||
      t.descricao.toLowerCase().includes(searchQuery)
    );
  }

  // Ordenar: mais recentes primeiro
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        <p>Nenhum chamado encontrado nesta aba.</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(ticket => {
    const isActive = ticket.id === activeTicketId;
    const ticketMsgs = messages.filter(m => m.ticketId === ticket.id);
    const lastMsg = ticketMsgs[ticketMsgs.length - 1];

    let statusText = 'Aberto';
    let statusClass = 'aberto';
    if (ticket.status === 'em_andamento') {
      statusText = 'Em Atendimento';
      statusClass = 'em_andamento';
    } else if (ticket.status === 'encerrado') {
      statusText = 'Encerrado';
      statusClass = 'encerrado';
    }

    const lastText = lastMsg ? (lastMsg.senderNome.split(' ')[0] + ': ' + lastMsg.text) : ticket.descricao;
    const lastTime = lastMsg ? formatTime(lastMsg.timestamp) : formatTime(ticket.createdAt);

    html += `
      <article class="ticket-card-item ${isActive ? 'active' : ''}" data-ticket-id="${ticket.id}" onclick="selectTicket('${ticket.id}')">
        <div class="ticket-card-avatar">
          ${ticket.id.replace('EXP-', '#')}
        </div>
        <div class="ticket-card-body">
          <div class="ticket-card-top">
            <h4 class="ticket-card-title">${ticket.titulo}</h4>
            <span class="ticket-card-time">${lastTime}</span>
          </div>

          <div class="ticket-card-location" title="Destino: ${ticket.local}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${ticket.local}</span>
          </div>

          <div class="ticket-card-bottom">
            <p class="ticket-card-last-msg">${lastText}</p>
            <div class="ticket-card-badges">
              <span class="status-tag ${statusClass}">${statusText}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;
}

function selectTicket(ticketId) {
  activeTicketId = ticketId;
  setStorage(STORAGE_KEYS.ACTIVE_TICKET, ticketId);
  renderTicketsList();
  renderActiveChat();

  // Subscrever ao Firebase para mensagens em tempo real se ativo
  subscribeToTicketMessages(ticketId, (firestoreMsgs) => {
    if (firestoreMsgs && firestoreMsgs.length > 0) {
      const localMsgs = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
      let changed = false;
      firestoreMsgs.forEach(fm => {
        if (!localMsgs.some(m => m.id === fm.id)) {
          localMsgs.push(fm);
          changed = true;
        }
      });
      if (changed) {
        setStorage(STORAGE_KEYS.MESSAGES, localMsgs);
        const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
        const ticket = tickets.find(t => t.id === activeTicketId);
        if (ticket) renderMessages(ticket);
      }
    }
  });

  // Em telas móveis, abrir a visão de chat
  const chatViewport = document.getElementById('chat-viewport');
  chatViewport.classList.add('mobile-active');
}

function closeChatOnMobile() {
  const chatViewport = document.getElementById('chat-viewport');
  chatViewport.classList.remove('mobile-active');
}

// =============================================================================
// 7. CHAT DO CHAMADO (ESTILO WHATSAPP)
// =============================================================================

function renderActiveChat() {
  const emptyState = document.getElementById('empty-chat-state');
  const activeContent = document.getElementById('active-chat-content');

  if (!activeTicketId) {
    emptyState.classList.remove('hidden');
    activeContent.classList.add('hidden');
    return;
  }

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const ticket = tickets.find(t => t.id === activeTicketId);

  if (!ticket) {
    activeTicketId = null;
    setStorage(STORAGE_KEYS.ACTIVE_TICKET, null);
    emptyState.classList.remove('hidden');
    activeContent.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  activeContent.classList.remove('hidden');

  // Cabeçalho do Chat
  document.getElementById('chat-header-title').textContent = ticket.titulo;
  document.getElementById('chat-header-code').textContent = ticket.id;
  document.getElementById('chat-header-location-text').textContent = ticket.local;
  document.getElementById('chat-header-avatar').textContent = ticket.id.replace('EXP-', '#');

  const statusBadge = document.getElementById('chat-header-status-badge');
  let statusBadgeText = 'Aberto';
  let statusBadgeClass = 'aberto';
  if (ticket.status === 'em_andamento') {
    statusBadgeText = 'Em Atendimento';
    statusBadgeClass = 'em_andamento';
  } else if (ticket.status === 'encerrado') {
    statusBadgeText = 'Encerrado';
    statusBadgeClass = 'encerrado';
  }
  statusBadge.textContent = statusBadgeText;
  statusBadge.className = `badge-status status-tag ${statusBadgeClass}`;

  // Informação do Técnico / Solicitante no cabeçalho
  const assigneeSpan = document.getElementById('chat-header-assignee');
  if (ticket.prestadorNome) {
    assigneeSpan.textContent = `Técnico: ${ticket.prestadorNome} (CPF: ${ticket.prestadorCpf})`;
  } else {
    assigneeSpan.textContent = `Aguardando Técnico Credenciado`;
  }

  // Faixa de status abaixo do cabeçalho
  const statusStrip = document.getElementById('ticket-status-strip');
  const statusStripText = document.getElementById('ticket-status-strip-text');
  statusStrip.className = `ticket-status-strip ${statusBadgeClass}`;

  if (ticket.status === 'aberto') {
    statusStripText.innerHTML = `⏳ <strong>Chamado Aberto:</strong> Aguardando algum técnico prestador aceitar o atendimento.`;
  } else if (ticket.status === 'em_andamento') {
    statusStripText.innerHTML = `🛠️ <strong>Em Atendimento:</strong> O técnico <strong>${ticket.prestadorNome}</strong> está responsável por este serviço.`;
  } else {
    statusStripText.innerHTML = `✅ <strong>Chamado Encerrado:</strong> Serviço finalizado com sucesso.`;
  }

  // Botões de Ação no Cabeçalho (Aceitar, Encerrar, Detalhes)
  const actionsContainer = document.getElementById('chat-header-actions-container');
  let actionsHtml = `
    <button type="button" class="btn btn-secondary" onclick="openTicketDetailsModal()" title="Ver ficha completa do chamado">
      📋 Detalhes
    </button>
  `;

  // Se o usuário for Prestador e o chamado estiver ABERTO -> Botão "Aceitar Chamado"
  if (currentUser.perfil === 'prestador' && ticket.status === 'aberto') {
    actionsHtml = `
      <button type="button" class="btn btn-primary" onclick="acceptTicket('${ticket.id}')">
        🚀 Aceitar Chamado
      </button>
    ` + actionsHtml;
  }

  // Se o chamado estiver EM ANDAMENTO:
  // Se for o prestador responsável -> Botão "Encerrar Chamado"
  if (currentUser.perfil === 'prestador' && ticket.status === 'em_andamento') {
    actionsHtml = `
      <button type="button" class="btn btn-success" onclick="openFinishTicketModal()">
        🏁 Encerrar Chamado
      </button>
    ` + actionsHtml;
  }

  actionsContainer.innerHTML = actionsHtml;

  // Desativar ou ativar caixa de envio se o chamado já foi encerrado
  const inputBar = document.getElementById('chat-input-bar');
  const msgInput = document.getElementById('message-text-input');
  const btnSend = document.getElementById('btn-send-message');

  if (ticket.status === 'encerrado') {
    msgInput.placeholder = 'Este chamado foi encerrado pelo prestador. Conversa finalizada.';
    msgInput.disabled = true;
    btnSend.disabled = true;
    btnSend.style.opacity = '0.5';
  } else {
    msgInput.placeholder = 'Digite uma mensagem...';
    msgInput.disabled = false;
    btnSend.disabled = false;
    btnSend.style.opacity = '1';
  }

  // Renderizar Mensagens
  renderMessages(ticket);
}

function renderMessages(ticket) {
  const container = document.getElementById('chat-messages-container');
  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  const ticketMsgs = messages.filter(m => m.ticketId === ticket.id);

  let html = '';

  // Card de Resumo Inicial do Chamado (destacando o que está acontecendo e para onde é)
  html += `
    <div class="ticket-summary-card">
      <div class="summary-card-header">
        <strong>${ticket.id} — ${ticket.titulo}</strong>
        <span>Aberto em ${formatDate(ticket.createdAt)}</span>
      </div>

      <div class="summary-card-row">
        <span class="label">📍 PARA ONDE É O CHAMADO (LOCAL/DESTINO):</span>
        <strong style="color: #38bdf8;">${ticket.local}</strong>
      </div>

      <div class="summary-card-row">
        <span class="label">👤 SOLICITANTE:</span>
        <span>${ticket.solicitanteNome} (CPF: ${ticket.solicitanteCpf})</span>
      </div>

      <div class="summary-card-row">
        <span class="label">📝 DESCRIÇÃO DO QUE ESTÁ ACONTECENDO:</span>
        <div class="summary-card-desc">${ticket.descricao}</div>
      </div>
    </div>
  `;

  ticketMsgs.forEach(msg => {
    if (msg.senderRole === 'sistema') {
      let extraClass = '';
      if (msg.text.includes('aceitou')) extraClass = 'highlight-event';
      if (msg.text.includes('encerrado')) extraClass = 'success-event';

      html += `
        <div class="chat-system-event ${extraClass}">
          ${msg.text}
        </div>
      `;
    } else {
      const isOutgoing = cleanDigits(msg.senderCpf) === cleanDigits(currentUser.cpf);
      const directionClass = isOutgoing ? 'outgoing' : 'incoming';

      html += `
        <div class="chat-msg ${directionClass}">
          <div class="chat-bubble">
            <span class="msg-sender-name">${msg.senderNome}</span>
            <div class="msg-text">${escapeHtml(msg.text)}</div>
            <div class="msg-meta">
              <span class="msg-time">${formatTime(msg.timestamp)}</span>
              ${isOutgoing ? '<span class="ticks-read" title="Entregue">✓✓</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;

  // Scroll automático para a última mensagem
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

// =============================================================================
// 8. ENVIO DE MENSAGENS & ANEXOS
// =============================================================================

function handleMessageKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function sendMessage(customText = null) {
  if (!activeTicketId || !currentUser) return;

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const ticket = tickets.find(t => t.id === activeTicketId);
  if (!ticket || ticket.status === 'encerrado') return;

  const input = document.getElementById('message-text-input');
  const text = customText || input.value.trim();

  if (!text) return;

  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  const newMsg = {
    id: 'msg-' + Date.now(),
    ticketId: activeTicketId,
    senderCpf: currentUser.cpf,
    senderNome: currentUser.nome,
    senderRole: currentUser.perfil,
    text: text,
    timestamp: new Date().toISOString()
  };

  messages.push(newMsg);
  setStorage(STORAGE_KEYS.MESSAGES, messages);

  if (!customText) {
    input.value = '';
  }

  playSound('sent');
  renderTicketsList();
  renderMessages(ticket);

  sendMessageToFirestore(newMsg);

  broadcastRealtimeEvent({
    type: 'NEW_MESSAGE',
    message: newMsg,
    ticketId: activeTicketId,
    senderCpf: currentUser.cpf
  });
}

function toggleAttachmentMenu() {
  const popup = document.getElementById('attach-popup');
  popup.classList.toggle('hidden');
}

function sendQuickAction(action) {
  const popup = document.getElementById('attach-popup');
  popup.classList.add('hidden');

  if (action === 'photo') {
    sendMessage('📷 [Foto do Equipamento / Erro em Anexo] - Compartilhado via Expert Chat');
  } else if (action === 'location') {
    const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
    const ticket = tickets.find(t => t.id === activeTicketId);
    const local = ticket ? ticket.local : 'Local do Chamado';
    sendMessage(`📍 Confirmação de Local: "${local}". Técnico pode se dirigir ao ponto.`);
  } else if (action === 'audio') {
    sendMessage('🎤 0:18 [Mensagem de Áudio Gravada] - "Técnico no local testando a impressora e a saída do papel..."');
  }
}

// =============================================================================
// 9. FLUXOS DE NEGÓCIO: ACEITAR E ENCERRAR CHAMADO
// =============================================================================

// Prestador aceita o chamado e fica responsável
function acceptTicket(ticketId) {
  if (!currentUser || currentUser.perfil !== 'prestador') {
    showToast('Apenas técnicos prestadores podem aceitar chamados.', 'info');
    return;
  }

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const ticket = tickets.find(t => t.id === ticketId);

  if (!ticket) return;

  ticket.status = 'em_andamento';
  ticket.prestadorCpf = currentUser.cpf;
  ticket.prestadorNome = currentUser.nome;
  setStorage(STORAGE_KEYS.TICKETS, tickets);

  // Enviar mensagem de sistema no chat
  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  messages.push({
    id: 'msg-' + Date.now(),
    ticketId: ticket.id,
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: `🛠️ O técnico ${currentUser.nome} (CPF: ${currentUser.cpf}) assumiu este chamado e é o responsável pelo atendimento.`,
    timestamp: new Date().toISOString()
  });
  setStorage(STORAGE_KEYS.MESSAGES, messages);

  showToast(`Você assumiu o chamado ${ticket.id}! Você agora pode conversar diretamente com o solicitante.`, 'success');
  playSound('received');

  updateTicketInFirestore(ticket.id, {
    status: 'em_andamento',
    prestadorCpf: currentUser.cpf,
    prestadorNome: currentUser.nome
  });

  renderApp();
  broadcastRealtimeEvent({
    type: 'TICKET_ACCEPTED',
    ticket: ticket,
    prestadorNome: currentUser.nome
  });
}

// Modais
function openNewTicketModal() {
  document.getElementById('modal-new-ticket').classList.remove('hidden');
}

function openFinishTicketModal() {
  document.getElementById('modal-close-ticket').classList.remove('hidden');
}

function openTicketDetailsModal() {
  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const ticket = tickets.find(t => t.id === activeTicketId);
  if (!ticket) return;

  document.getElementById('details-modal-title').textContent = ticket.titulo;
  document.getElementById('details-modal-code').textContent = ticket.id;

  const body = document.getElementById('details-modal-body');
  body.innerHTML = `
    <div class="details-grid">
      <div class="details-item">
        <span>Código do Chamado</span>
        <strong>${ticket.id}</strong>
      </div>
      <div class="details-item">
        <span>Status Atual</span>
        <strong>${ticket.status.toUpperCase()}</strong>
      </div>
      <div class="details-item">
        <span>Para onde é o Chamado (Local)</span>
        <strong style="color: #38bdf8;">${ticket.local}</strong>
      </div>
      <div class="details-item">
        <span>Categoria & Prioridade</span>
        <strong>${ticket.categoria} (${ticket.prioridade.toUpperCase()})</strong>
      </div>
      <div class="details-item">
        <span>Solicitante</span>
        <strong>${ticket.solicitanteNome}<br><small style="color: var(--text-muted)">CPF: ${ticket.solicitanteCpf}</small></strong>
      </div>
      <div class="details-item">
        <span>Prestador Responsável</span>
        <strong>${ticket.prestadorNome ? `${ticket.prestadorNome}<br><small style="color: var(--text-muted)">CPF: ${ticket.prestadorCpf}</small>` : 'Aguardando Técnico'}</strong>
      </div>
      <div class="details-item">
        <span>Aberto em</span>
        <strong>${formatDate(ticket.createdAt)}</strong>
      </div>
      <div class="details-item">
        <span>Finalizado em</span>
        <strong>${ticket.finishedAt ? formatDate(ticket.finishedAt) : 'Ainda em aberto'}</strong>
      </div>
    </div>

    <div class="details-desc-box">
      <span>O que está acontecendo (Descrição do Solicitante):</span>
      <p>${escapeHtml(ticket.descricao)}</p>
    </div>

    ${ticket.solucao ? `
      <div class="details-desc-box" style="border-left: 3px solid #10b981;">
        <span style="color: #34d399;">Solução Aplicada pelo Técnico:</span>
        <p>${escapeHtml(ticket.solucao)}</p>
      </div>
    ` : ''}
  `;

  document.getElementById('modal-ticket-details').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Criação de Chamado pelo Solicitante
function handleCreateTicketSubmit(event) {
  event.preventDefault();

  const titulo = document.getElementById('ticket-title').value.trim();
  const local = document.getElementById('ticket-location').value.trim();
  const prioridade = document.getElementById('ticket-priority').value;
  const categoria = document.getElementById('ticket-category').value;
  const descricao = document.getElementById('ticket-description').value.trim();

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const nextNumber = tickets.length + 101;
  const newTicketId = 'EXP-' + nextNumber;

  const newTicket = {
    id: newTicketId,
    titulo,
    local,
    categoria,
    prioridade,
    status: 'aberto',
    descricao,
    solicitanteCpf: currentUser.cpf,
    solicitanteNome: currentUser.nome,
    prestadorCpf: null,
    prestadorNome: null,
    solucao: null,
    createdAt: new Date().toISOString(),
    finishedAt: null
  };

  tickets.unshift(newTicket);
  setStorage(STORAGE_KEYS.TICKETS, tickets);

  // Mensagem inicial de sistema no chat
  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  messages.push({
    id: 'msg-' + Date.now(),
    ticketId: newTicketId,
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: `📢 Chamado aberto por ${currentUser.nome}. Local: ${local}. Aguardando técnico credenciado da Expert Suporte.`,
    timestamp: new Date().toISOString()
  });
  setStorage(STORAGE_KEYS.MESSAGES, messages);

  // Limpar formulário e fechar modal
  document.getElementById('form-new-ticket').reset();
  closeModal('modal-new-ticket');

  showToast(`Chamado ${newTicketId} criado com sucesso!`, 'success');
  playSound('sent');

  // Selecionar o novo chamado imediatamente
  selectTicket(newTicketId);

  saveTicketToFirestore(newTicket);

  broadcastRealtimeEvent({
    type: 'NEW_TICKET',
    ticket: newTicket,
    creatorNome: currentUser.nome
  });
}

// Encerramento de Chamado pelo Prestador
function handleFinishTicketSubmit(event) {
  event.preventDefault();

  const solucao = document.getElementById('finish-solution').value.trim();
  const estadoFinal = document.getElementById('finish-satisfaction').value;

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  const ticket = tickets.find(t => t.id === activeTicketId);

  if (!ticket) return;

  ticket.status = 'encerrado';
  ticket.solucao = `${solucao} (${estadoFinal})`;
  ticket.finishedAt = new Date().toISOString();
  setStorage(STORAGE_KEYS.TICKETS, tickets);

  // Mensagem de sistema no chat
  const messages = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  messages.push({
    id: 'msg-' + Date.now(),
    ticketId: ticket.id,
    senderCpf: 'SISTEMA',
    senderNome: 'Sistema Expert',
    senderRole: 'sistema',
    text: `✅ Chamado encerrado pelo técnico ${currentUser.nome} (CPF: ${currentUser.cpf}).\nSolução registrada: ${ticket.solucao}`,
    timestamp: new Date().toISOString()
  });
  setStorage(STORAGE_KEYS.MESSAGES, messages);

  document.getElementById('form-close-ticket').reset();
  closeModal('modal-close-ticket');

  showToast(`Chamado ${ticket.id} finalizado e concluído com sucesso!`, 'success');
  playSound('success');

  updateTicketInFirestore(ticket.id, {
    status: 'encerrado',
    solucao: ticket.solucao,
    finishedAt: ticket.finishedAt
  });

  renderApp();
  broadcastRealtimeEvent({
    type: 'TICKET_FINISHED',
    ticket: ticket,
    prestadorNome: currentUser.nome
  });
}

// =============================================================================
// 10. SINCRONIZAÇÃO EM TEMPO REAL INSTANTÂNEA (BROADCASTCHANNEL + STORAGE)
// =============================================================================

// Canal nativo do navegador para comunicação instantânea (0ms de latência) entre abas e janelas
const realtimeChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('expert_suporte_realtime_sync') : null;

function broadcastRealtimeEvent(payload) {
  if (realtimeChannel) {
    try {
      realtimeChannel.postMessage(payload);
    } catch (e) {
      console.warn('Erro ao emitir BroadcastChannel', e);
    }
  }

  // Acionar evento de sincronização entre outras abas/janelas do navegador
  try {
    localStorage.setItem('expert_sync_pulse', JSON.stringify({
      timestamp: Date.now(),
      ...payload
    }));
  } catch (e) {}
}

function handleIncomingRealtimeEvent(payload) {
  if (!payload || !payload.type) return;

  // Se o evento foi emitido por mim mesmo, não reprocessar
  if (payload.senderCpf && currentUser && cleanDigits(payload.senderCpf) === cleanDigits(currentUser.cpf)) {
    return;
  }

  if (payload.type === 'NEW_TICKET') {
    const ticket = payload.ticket;
    renderFilterTabs();
    renderTicketsList();

    // SE O USUÁRIO FOR PRESTADOR: O CHAMADO CAI NA HORA COM ALERTA E SOM!
    if (currentUser && currentUser.perfil === 'prestador') {
      playSound('alert');
      showToast(
        `🚨 <strong>NOVO CHAMADO NO HGP!</strong><br>${escapeHtml(ticket.id)}: ${escapeHtml(ticket.titulo)}<br><small style="opacity: 0.85;">📍 ${escapeHtml(ticket.local)}</small>`,
        'warning',
        9000,
        () => {
          setFilter('disponiveis');
          selectTicket(ticket.id);
        }
      );

      // Piscar / destacar o chamado na lista para o prestador ver imediatamente
      setTimeout(() => {
        const item = document.querySelector(`[data-ticket-id="${ticket.id}"]`);
        if (item) {
          item.classList.add('just-arrived');
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  } else if (payload.type === 'NEW_MESSAGE') {
    renderTicketsList();
    if (activeTicketId && activeTicketId === payload.ticketId) {
      const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
      const ticket = tickets.find(t => t.id === activeTicketId);
      if (ticket) {
        renderMessages(ticket);
        playSound('received');
      }
    }
  } else if (payload.type === 'TICKET_ACCEPTED') {
    renderFilterTabs();
    renderTicketsList();
    if (activeTicketId && activeTicketId === payload.ticket.id) {
      renderActiveChat();
      if (currentUser && currentUser.perfil === 'solicitante') {
        showToast(`🛠️ O técnico ${payload.prestadorNome} aceitou seu chamado!`, 'success');
        playSound('received');
      }
    }
  } else if (payload.type === 'TICKET_FINISHED') {
    renderFilterTabs();
    renderTicketsList();
    if (activeTicketId && activeTicketId === payload.ticket.id) {
      renderActiveChat();
      if (currentUser && currentUser.perfil === 'solicitante') {
        showToast(`✅ Seu chamado ${payload.ticket.id} foi concluído pelo técnico!`, 'success');
        playSound('success');
      }
    }
  }
}

// Receptor via BroadcastChannel (outras abas)
if (realtimeChannel) {
  realtimeChannel.onmessage = (event) => {
    handleIncomingRealtimeEvent(event.data);
  };
}

// Receptor via evento de storage (multi-janela / cross-tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'expert_sync_pulse' && e.newValue) {
    try {
      const payload = JSON.parse(e.newValue);
      handleIncomingRealtimeEvent(payload);
    } catch (err) {}
  }
});

// =============================================================================
// 11. GRÁFICOS VISUAIS & DASHBOARDS (CHART.JS)
// =============================================================================

let chartSetoresInstance = null;
let chartCategoriasInstance = null;
let chartStatusInstance = null;
let modalChartSetoresInstance = null;
let modalChartCategoriasInstance = null;

function renderAdminCharts(tickets) {
  const setorMap = {};
  const categoriaMap = {};
  let countAbertos = 0;
  let countAndamento = 0;
  let countEncerrados = 0;

  tickets.forEach(t => {
    let setor = t.local ? t.local.replace(/^HGP\s*-\s*/i, '').trim() : 'Outros';
    if (setor.length > 25) setor = setor.substring(0, 25) + '...';
    setorMap[setor] = (setorMap[setor] || 0) + 1;

    const cat = t.categoria || 'Geral';
    categoriaMap[cat] = (categoriaMap[cat] || 0) + 1;

    if (t.status === 'aberto') countAbertos++;
    else if (t.status === 'em_andamento') countAndamento++;
    else if (t.status === 'encerrado') countEncerrados++;
  });

  const chartTheme = {
    color: '#a1a1aa',
    borderColor: '#27272a'
  };

  // 1. Gráfico de Setores (Barras Horizontais)
  const ctxSetores = document.getElementById('chart-setores');
  if (ctxSetores) {
    if (chartSetoresInstance) chartSetoresInstance.destroy();
    chartSetoresInstance = new Chart(ctxSetores, {
      type: 'bar',
      data: {
        labels: Object.keys(setorMap).length ? Object.keys(setorMap) : ['Triagem', 'Pronto-Socorro', 'Farmácia'],
        datasets: [{
          label: 'Chamados',
          data: Object.values(setorMap).length ? Object.values(setorMap) : [1, 1, 1],
          backgroundColor: '#ff6600',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: chartTheme.color }, grid: { color: chartTheme.borderColor } },
          y: { ticks: { color: chartTheme.color }, grid: { display: false } }
        }
      }
    });
  }

  // 2. Gráfico de Defeitos Mecânicos (Doughnut)
  const ctxCategorias = document.getElementById('chart-categorias');
  if (ctxCategorias) {
    if (chartCategoriasInstance) chartCategoriasInstance.destroy();
    chartCategoriasInstance = new Chart(ctxCategorias, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoriaMap).length ? Object.keys(categoriaMap) : ['Pulseiras / Etiquetas', 'Atolamento de Papel', 'Guilhotina / Roletes'],
        datasets: [{
          data: Object.values(categoriaMap).length ? Object.values(categoriaMap) : [1, 1, 1],
          backgroundColor: ['#ff8533', '#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#ec4899'],
          borderWidth: 2,
          borderColor: '#111114'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: chartTheme.color, boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }

  // 3. Gráfico de Status (Pie)
  const ctxStatus = document.getElementById('chart-status');
  if (ctxStatus) {
    if (chartStatusInstance) chartStatusInstance.destroy();
    chartStatusInstance = new Chart(ctxStatus, {
      type: 'pie',
      data: {
        labels: ['Aguardando (Aberto)', 'Em Atendimento', 'Encerrado'],
        datasets: [{
          data: [countAbertos, countAndamento, countEncerrados],
          backgroundColor: ['#f59e0b', '#38bdf8', '#10b981'],
          borderWidth: 2,
          borderColor: '#111114'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: chartTheme.color, boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }
}

function renderModalCharts(tickets) {
  const setorMap = {};
  const categoriaMap = {};

  tickets.forEach(t => {
    let setor = t.local ? t.local.replace(/^HGP\s*-\s*/i, '').trim() : 'Outros';
    if (setor.length > 25) setor = setor.substring(0, 25) + '...';
    setorMap[setor] = (setorMap[setor] || 0) + 1;

    const cat = t.categoria || 'Geral';
    categoriaMap[cat] = (categoriaMap[cat] || 0) + 1;
  });

  const chartTheme = {
    color: '#a1a1aa',
    borderColor: '#27272a'
  };

  const ctxSetores = document.getElementById('modal-chart-setores');
  if (ctxSetores) {
    if (modalChartSetoresInstance) modalChartSetoresInstance.destroy();
    modalChartSetoresInstance = new Chart(ctxSetores, {
      type: 'bar',
      data: {
        labels: Object.keys(setorMap).length ? Object.keys(setorMap) : ['Triagem', 'Pronto-Socorro', 'Farmácia'],
        datasets: [{
          label: 'Chamados',
          data: Object.values(setorMap).length ? Object.values(setorMap) : [1, 1, 1],
          backgroundColor: '#ff6600',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: chartTheme.color }, grid: { color: chartTheme.borderColor } },
          y: { ticks: { color: chartTheme.color }, grid: { display: false } }
        }
      }
    });
  }

  const ctxCategorias = document.getElementById('modal-chart-categorias');
  if (ctxCategorias) {
    if (modalChartCategoriasInstance) modalChartCategoriasInstance.destroy();
    modalChartCategoriasInstance = new Chart(ctxCategorias, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoriaMap).length ? Object.keys(categoriaMap) : ['Pulseiras', 'Atolamento', 'Guilhotina'],
        datasets: [{
          data: Object.values(categoriaMap).length ? Object.values(categoriaMap) : [1, 1, 1],
          backgroundColor: ['#ff8533', '#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#ec4899'],
          borderWidth: 2,
          borderColor: '#111114'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: chartTheme.color, boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }
}

// Modal de Analytics / Contagem Geral
function openAnalyticsModal() {
  const modal = document.getElementById('modal-analytics');
  if (!modal) return;
  modal.classList.remove('hidden');

  const tickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
  getGlobalMetrics(tickets).then(metrics => {
    const el = document.getElementById('modal-metric-total-abertos');
    if (el) el.textContent = metrics.lifetimeCount;
  });

  document.getElementById('modal-metric-pendentes').textContent = tickets.filter(t => t.status === 'aberto').length;
  document.getElementById('modal-metric-andamento').textContent = tickets.filter(t => t.status === 'em_andamento').length;
  document.getElementById('modal-metric-concluidos').textContent = tickets.filter(t => t.status === 'encerrado').length;

  setTimeout(() => {
    renderModalCharts(tickets);
  }, 100);
}

// Disparar limpeza manual de 3 semanas (21 dias)
async function triggerManualCleanup() {
  showToast('🧹 Executando limpeza de chamados (> 21 dias)...', 'info');
  const res = await cleanupOldHistory(
    21,
    () => getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS),
    (t) => setStorage(STORAGE_KEYS.TICKETS, t),
    () => getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES),
    (m) => setStorage(STORAGE_KEYS.MESSAGES, m)
  );

  showToast(`✅ Limpeza concluída! ${res.purgedCount} chamado(s) antigo(s) arquivado(s). Banco 100% leve.`, 'success');
  renderApp();
  if (currentUser && currentUser.perfil === 'admin') {
    renderAdminPanel();
  }
}

// Modal de Configuração do Firebase
function openFirebaseConfigModal() {
  const modal = document.getElementById('modal-firebase-config');
  if (!modal) return;
  modal.classList.remove('hidden');

  const config = getActiveFirebaseConfig();
  document.getElementById('fb-api-key').value = config.apiKey.includes('EXEMPLO') ? '' : config.apiKey;
  document.getElementById('fb-project-id').value = config.projectId.includes('exemplo') ? '' : config.projectId;
  document.getElementById('fb-auth-domain').value = config.authDomain.includes('exemplo') ? '' : config.authDomain;
  document.getElementById('fb-storage-bucket').value = config.storageBucket.includes('exemplo') ? '' : config.storageBucket;
  document.getElementById('fb-app-id').value = config.appId.includes('exemplo') ? '' : config.appId;
}

function handleSaveFirebaseConfig(event) {
  event.preventDefault();
  const apiKey = document.getElementById('fb-api-key').value.trim();
  const projectId = document.getElementById('fb-project-id').value.trim();
  const authDomain = document.getElementById('fb-auth-domain').value.trim();
  const storageBucket = document.getElementById('fb-storage-bucket').value.trim();
  const appId = document.getElementById('fb-app-id').value.trim();

  if (!apiKey || !projectId) {
    showToast('Preencha pelo menos a API Key e o Project ID do Firebase.', 'info');
    return;
  }

  const newConfig = {
    apiKey,
    projectId,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    appId: appId || `1:${Date.now()}:web:app`
  };

  localStorage.setItem('expert_custom_firebase_config', JSON.stringify(newConfig));
  closeModal('modal-firebase-config');
  showToast('🔥 Conectando ao Firebase Firestore...', 'success');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

function handleClearFirebaseConfig() {
  localStorage.removeItem('expert_custom_firebase_config');
  closeModal('modal-firebase-config');
  showToast('💾 Restaurado para o Modo Local Otimizado.', 'info');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

// Botão de Atualizar Página
function handleRefreshPage() {
  const btns = document.querySelectorAll('.btn-refresh-page');
  btns.forEach(b => b.classList.add('spinning'));
  showToast('🔄 Atualizando página...', 'info', 800);
  setTimeout(() => {
    window.location.reload();
  }, 200);
}

// Desbloquear áudio após primeira interação do usuário (política de navegadores)
window.addEventListener('pointerdown', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: true });

// Expor funções globais para manipuladores inline no HTML
Object.assign(window, {
  switchToAdminLogin,
  switchToUserLogin,
  maskCPF,
  maskPhone,
  togglePasswordVisibility,
  fillDemo,
  fillAdminDemo,
  handleLoginSubmit,
  handleAdminLoginSubmit,
  handleAdminRoleToggle,
  handleAdminCreateUser,
  deleteUser,
  enterAppFromAdmin,
  openNewTicketModal,
  toggleQuickSwitchMenu,
  quickSwitchRole,
  handleLogout,
  filterTickets,
  setFilter,
  selectTicket,
  closeChatOnMobile,
  acceptTicket,
  openFinishTicketModal,
  openTicketDetailsModal,
  closeModal,
  toggleAttachmentMenu,
  sendQuickAction,
  handleMessageKeyDown,
  sendMessage,
  handleCreateTicketSubmit,
  handleFinishTicketSubmit,
  handleRefreshPage,
  openAnalyticsModal,
  openFirebaseConfigModal,
  handleSaveFirebaseConfig,
  handleClearFirebaseConfig,
  triggerManualCleanup
});

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar serviço Firebase / Fallback Local
  initFirebaseService();

  // 2. Executar limpeza automática de 3 semanas se necessário (respeitando cota do Firebase)
  if (shouldRunAutoCleanup()) {
    cleanupOldHistory(
      21,
      () => getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS),
      (t) => setStorage(STORAGE_KEYS.TICKETS, t),
      () => getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES),
      (m) => setStorage(STORAGE_KEYS.MESSAGES, m)
    );
  }

  // 3. Renderizar aplicativo
  renderApp();

  // 4. Sincronização assíncrona em segundo plano com Firebase se ativo
  if (isUsingFirebase()) {
    try {
      const localUsers = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
      const syncedUsers = await syncUsersWithFirebase(localUsers);
      setStorage(STORAGE_KEYS.USERS, syncedUsers);

      const localTickets = getStorage(STORAGE_KEYS.TICKETS, INITIAL_TICKETS);
      const syncedTickets = await syncTicketsWithFirebase(localTickets);
      setStorage(STORAGE_KEYS.TICKETS, syncedTickets);

      renderApp();
    } catch (e) {
      console.warn('Erro na sincronização de fundo com Firebase', e);
    }
  }
});




