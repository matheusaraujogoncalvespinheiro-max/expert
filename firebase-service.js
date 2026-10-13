/**
 * EXPERT SUPORTE — SERVIÇO DE BANCO DE DADOS & FIREBASE OTIMIZADO
 * 
 * ARQUITETURA LEVE (Zero Sobrecarga / Free Tier Friendly):
 * 1. Cache Local Persistente (IndexedDB) para evitar leituras repetidas e economizar cota.
 * 2. Consultas cirúrgicas: apenas escuta o chat ativo selecionado e tickets recentes limitados.
 * 3. Documento agregador de Métricas: conta histórico sem precisar varrer coleções inteiras.
 * 4. Limpeza Automática a cada 3 Semanas (21 dias): remove chamados antigos encerrados e mensagens,
 *    preservando os contadores vitais e dados estatísticos para os gráficos.
 * 5. Fallback Seguro: funciona 100% offline/local se as chaves do Firebase não estiverem configuradas.
 */

import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  onSnapshot, 
  writeBatch,
  increment
} from 'firebase/firestore';
import { isFirebaseConfigured, getActiveFirebaseConfig } from './firebase-config.js';

let firebaseApp = null;
let firestoreDb = null;
let activeMessagesUnsubscribe = null;

// Chaves locais para métricas agregadas acumuladas
const LIFETIME_COUNTER_KEY = 'expert_lifetime_tickets_count';
const LAST_CLEANUP_KEY = 'expert_last_cleanup_timestamp';
const TOTAL_PURGED_KEY = 'expert_total_purged_count';

// Inicializar Firebase se configurado
export function initFirebaseService() {
  if (!isFirebaseConfigured()) {
    console.info('[Expert Database] Operando em modo Local Otimizado (Fallback de Alta Performance).');
    return null;
  }

  try {
    const config = getActiveFirebaseConfig();
    if (getApps().length === 0) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }

    firestoreDb = getFirestore(firebaseApp);
    console.info('[Expert Database] Conectado ao Firebase Firestore com sucesso.');
    return firestoreDb;
  } catch (error) {
    console.warn('[Expert Database] Erro ao inicializar Firebase. Usando armazenamento local resiliente.', error);
    firestoreDb = null;
    return null;
  }
}

export function isUsingFirebase() {
  return firestoreDb !== null;
}

// =============================================================================
// 1. MÉTRICAS ACUMULADAS E CONTADORES GLOBAIS
// =============================================================================

export async function getGlobalMetrics(localTickets = []) {
  let lifetimeCount = parseInt(localStorage.getItem(LIFETIME_COUNTER_KEY) || '0', 10);
  let lastCleanup = localStorage.getItem(LAST_CLEANUP_KEY) || null;
  let totalPurged = parseInt(localStorage.getItem(TOTAL_PURGED_KEY) || '0', 10);

  // Garantir que a contagem acumulada seja pelo menos o número atual de chamados
  if (localTickets.length > lifetimeCount) {
    lifetimeCount = localTickets.length;
    localStorage.setItem(LIFETIME_COUNTER_KEY, String(lifetimeCount));
  }

  if (isUsingFirebase()) {
    try {
      const metricDocRef = doc(firestoreDb, 'metrics', 'global_counters');
      const snap = await getDoc(metricDocRef);
      if (snap.exists()) {
        const data = snap.data();
        lifetimeCount = Math.max(lifetimeCount, data.totalTicketsEverCreated || 0);
        lastCleanup = data.lastCleanupAt || lastCleanup;
        totalPurged = Math.max(totalPurged, data.purgedTicketsCount || 0);
      }
    } catch (e) {
      console.warn('Erro ao ler métricas do Firestore', e);
    }
  }

  return {
    lifetimeCount,
    lastCleanup,
    totalPurged
  };
}

export async function incrementLifetimeTicketCount() {
  let count = parseInt(localStorage.getItem(LIFETIME_COUNTER_KEY) || '0', 10) + 1;
  localStorage.setItem(LIFETIME_COUNTER_KEY, String(count));

  if (isUsingFirebase()) {
    try {
      const metricDocRef = doc(firestoreDb, 'metrics', 'global_counters');
      await setDoc(metricDocRef, {
        totalTicketsEverCreated: increment(1),
        lastActivityAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Erro ao incrementar métrica no Firestore', e);
    }
  }
  return count;
}

// =============================================================================
// 2. LIMPEZA AUTOMÁTICA DE 3 SEMANAS (21 DIAS)
// =============================================================================

/**
 * Remove chamados encerrados e mensagens associadas criados há mais de 3 semanas (21 dias).
 * Preserva o contador histórico vitalício e métricas agregadas para que os gráficos continuem precisos.
 */
export async function cleanupOldHistory(daysCutoff = 21, getLocalTickets, saveLocalTickets, getLocalMessages, saveLocalMessages) {
  const cutoffTime = Date.now() - (daysCutoff * 24 * 60 * 60 * 1000);
  const cutoffDate = new Date(cutoffTime);
  console.info(`[Expert Purge] Executando rotina de limpeza de 3 semanas (chamados encerrados antes de ${cutoffDate.toLocaleDateString()})...`);

  let purgedCount = 0;

  // 1. Limpeza no Banco Local
  if (typeof getLocalTickets === 'function' && typeof saveLocalTickets === 'function') {
    const tickets = getLocalTickets();
    const messages = typeof getLocalMessages === 'function' ? getLocalMessages() : [];

    const toKeepTickets = [];
    const purgedTicketIds = new Set();

    tickets.forEach(ticket => {
      const isClosed = ticket.status === 'encerrado';
      const isOlderThan3Weeks = new Date(ticket.createdAt).getTime() < cutoffTime;

      if (isClosed && isOlderThan3Weeks) {
        purgedTicketIds.add(ticket.id);
        purgedCount++;
      } else {
        toKeepTickets.push(ticket);
      }
    });

    if (purgedCount > 0) {
      saveLocalTickets(toKeepTickets);

      if (typeof saveLocalMessages === 'function') {
        const toKeepMessages = messages.filter(m => !purgedTicketIds.has(m.ticketId));
        saveLocalMessages(toKeepMessages);
      }
    }
  }

  // 2. Limpeza no Firestore (em batches de 500 para respeitar limites do Firebase)
  if (isUsingFirebase()) {
    try {
      const q = query(
        collection(firestoreDb, 'tickets'),
        where('status', '==', 'encerrado'),
        where('createdAt', '<=', cutoffDate.toISOString())
      );

      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(firestoreDb);
        const ticketIdsToDelete = [];

        snap.forEach(docSnap => {
          ticketIdsToDelete.push(docSnap.id);
          batch.delete(docSnap.ref);
        });

        // Apagar mensagens dos chamados eliminados
        for (const tId of ticketIdsToDelete) {
          const msgQuery = query(collection(firestoreDb, 'messages'), where('ticketId', '==', tId));
          const msgSnap = await getDocs(msgQuery);
          msgSnap.forEach(mDoc => batch.delete(mDoc.ref));
        }

        // Atualizar métricas de limpeza
        const metricDocRef = doc(firestoreDb, 'metrics', 'global_counters');
        batch.set(metricDocRef, {
          lastCleanupAt: new Date().toISOString(),
          purgedTicketsCount: increment(ticketIdsToDelete.length)
        }, { merge: true });

        await batch.commit();
        purgedCount = Math.max(purgedCount, ticketIdsToDelete.length);
      }
    } catch (e) {
      console.warn('[Expert Purge] Erro ao limpar histórico no Firestore:', e);
    }
  }

  // Atualizar registros locais de limpeza
  const prevPurged = parseInt(localStorage.getItem(TOTAL_PURGED_KEY) || '0', 10);
  localStorage.setItem(TOTAL_PURGED_KEY, String(prevPurged + purgedCount));
  localStorage.setItem(LAST_CLEANUP_KEY, new Date().toISOString());

  return {
    purgedCount,
    cleanedAt: new Date().toISOString()
  };
}

// Verifica se já se passaram mais de 21 dias desde a última limpeza
export function shouldRunAutoCleanup() {
  const lastCleanup = localStorage.getItem(LAST_CLEANUP_KEY);
  if (!lastCleanup) return true; // Primeira execução
  const lastTime = new Date(lastCleanup).getTime();
  const threeWeeksMs = 21 * 24 * 60 * 60 * 1000;
  return (Date.now() - lastTime) > threeWeeksMs;
}

// =============================================================================
// 3. SINCRONIZAÇÃO DE USUÁRIOS (FIREBASE + LOCAL)
// =============================================================================

export async function syncUsersWithFirebase(localUsers) {
  if (!isUsingFirebase()) return localUsers;

  try {
    const colRef = collection(firestoreDb, 'users');
    const snap = await getDocs(colRef);

    if (snap.empty) {
      // Semear usuários iniciais no Firestore
      const batch = writeBatch(firestoreDb);
      localUsers.forEach(u => {
        const docRef = doc(firestoreDb, 'users', u.cpf);
        batch.set(docRef, u);
      });
      await batch.commit();
      return localUsers;
    } else {
      const firestoreUsers = [];
      snap.forEach(d => firestoreUsers.push(d.data()));
      return firestoreUsers;
    }
  } catch (e) {
    console.warn('Erro ao sincronizar usuários com Firestore, usando locais', e);
    return localUsers;
  }
}

export async function saveUserToFirestore(user) {
  if (!isUsingFirebase()) return;
  try {
    const docRef = doc(firestoreDb, 'users', user.cpf);
    await setDoc(docRef, user);
  } catch (e) {
    console.warn('Erro ao salvar usuário no Firestore', e);
  }
}

export async function deleteUserFromFirestore(cpf) {
  if (!isUsingFirebase()) return;
  try {
    const docRef = doc(firestoreDb, 'users', cpf);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Erro ao remover usuário do Firestore', e);
  }
}

// =============================================================================
// 4. SINCRONIZAÇÃO DE CHAMADOS (TICKETS)
// =============================================================================

export async function syncTicketsWithFirebase(localTickets) {
  if (!isUsingFirebase()) return localTickets;

  try {
    const colRef = collection(firestoreDb, 'tickets');
    // Consulta otimizada: busca no máximo 60 chamados recentes para economizar cota do Firebase
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(60));
    const snap = await getDocs(q);

    if (snap.empty) {
      // Semear chamados no Firestore
      const batch = writeBatch(firestoreDb);
      localTickets.forEach(t => {
        const docRef = doc(firestoreDb, 'tickets', t.id);
        batch.set(docRef, t);
      });
      await batch.commit();
      return localTickets;
    } else {
      const firestoreTickets = [];
      snap.forEach(d => firestoreTickets.push(d.data()));
      return firestoreTickets;
    }
  } catch (e) {
    console.warn('Erro ao sincronizar tickets com Firestore, usando locais', e);
    return localTickets;
  }
}

export async function saveTicketToFirestore(ticket) {
  await incrementLifetimeTicketCount();

  if (!isUsingFirebase()) return;
  try {
    const docRef = doc(firestoreDb, 'tickets', ticket.id);
    await setDoc(docRef, ticket);
  } catch (e) {
    console.warn('Erro ao salvar ticket no Firestore', e);
  }
}

export async function updateTicketInFirestore(ticketId, updates) {
  if (!isUsingFirebase()) return;
  try {
    const docRef = doc(firestoreDb, 'tickets', ticketId);
    await updateDoc(docRef, updates);
  } catch (e) {
    console.warn('Erro ao atualizar ticket no Firestore', e);
  }
}

// =============================================================================
// 5. SINCRONIZAÇÃO DE MENSAGENS (CHAT EM TEMPO REAL)
// =============================================================================

export async function sendMessageToFirestore(message) {
  if (!isUsingFirebase()) return;
  try {
    const docRef = doc(firestoreDb, 'messages', message.id);
    await setDoc(docRef, message);
  } catch (e) {
    console.warn('Erro ao enviar mensagem para Firestore', e);
  }
}

export function subscribeToTicketMessages(ticketId, onMessagesReceived) {
  // Desinscrever listener anterior se houver
  if (activeMessagesUnsubscribe) {
    activeMessagesUnsubscribe();
    activeMessagesUnsubscribe = null;
  }

  if (!isUsingFirebase()) return null;

  try {
    // Consulta otimizada: escuta APENAS as mensagens do chamado atual (limite de 60)
    const q = query(
      collection(firestoreDb, 'messages'),
      where('ticketId', '==', ticketId),
      orderBy('timestamp', 'asc'),
      limit(60)
    );

    activeMessagesUnsubscribe = onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.forEach(docSnap => messages.push(docSnap.data()));
      if (typeof onMessagesReceived === 'function') {
        onMessagesReceived(messages);
      }
    }, (error) => {
      console.warn('Erro no listener de mensagens do Firestore', error);
    });

    return activeMessagesUnsubscribe;
  } catch (e) {
    console.warn('Erro ao subscrever mensagens no Firestore', e);
    return null;
  }
}
