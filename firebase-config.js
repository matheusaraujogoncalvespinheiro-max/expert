/**
 * EXPERT SUPORTE — CONFIGURAÇÃO DO FIREBASE
 * 
 * Se você possui um projeto no Firebase (Console -> Configurações do Projeto -> Seus Aplicativos):
 * Preencha as credenciais abaixo ou configure diretamente pelo Painel do Administrador na tela.
 * 
 * Se os campos ficarem com as strings padrão ou vazias, o sistema opera automaticamente
 * no modo 'Local Fallback' com persistência completa sem gerar nenhum erro!
 */

export const firebaseConfig = {
  apiKey: "AIzaSy_EXEMPLO_COLOQUE_SUA_API_KEY_AQUI",
  authDomain: "expert-suporte-hgp.firebaseapp.com",
  projectId: "expert-suporte-hgp",
  storageBucket: "expert-suporte-hgp.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// Verifica se as chaves reais foram fornecidas pelo usuário
export function isFirebaseConfigured() {
  const custom = localStorage.getItem('expert_custom_firebase_config');
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      if (parsed.apiKey && !parsed.apiKey.includes('EXEMPLO') && parsed.projectId && !parsed.projectId.includes('exemplo')) {
        return true;
      }
    } catch (e) {}
  }
  return Boolean(
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes('EXEMPLO') &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes('exemplo')
  );
}

export function getActiveFirebaseConfig() {
  const custom = localStorage.getItem('expert_custom_firebase_config');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {}
  }
  return firebaseConfig;
}
