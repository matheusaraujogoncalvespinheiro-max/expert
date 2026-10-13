# Expert Suporte — Manutenção de Impressoras (HGP)

Sistema oficial de abertura, gestão e atendimento de chamados para manutenção técnica de impressoras no **Hospital Geral de Palmas (HGP)**.

---

## 🏥 Escopo de Atendimento Exclusivo

- **Cliente Exclusivo:** Hospital Geral (HGP).
- **Serviço Realizado:** **Exclusivamente manutenção técnica e mecânica de impressoras** (não realizamos troca ou reposição de toner/cartuchos/suprimentos).
- **Tipos de Chamados Atendidos:**
  - 🏷️ Impressoras térmicas de pulseiras de identificação e etiquetas de pacientes.
  - 📄 Atolamento e enrosco de papel em impressoras de prescrições e prontuários.
  - ⚙️ Reparo mecânico de guilhotina, tracionadores e roletes (pickup rollers).
  - 🔴 Impressoras travadas com luz de erro, barulho mecânico ou falha de inicialização.
  - 🛠️ Manutenção preventiva e lubrificação mecânica interna.

---

## 🔒 Fluxo de Acesso & Perfis

### 1. Login Geral (CPF e Senha)
- O usuário informa apenas o seu **CPF** e **Senha**.
- O sistema reconhece automaticamente:
  - **Solicitante do HGP**: colaboradores do hospital (Recepção, Triagem, Farmácia, UTI, Postos de Enfermagem).
  - **Prestador Expert**: técnicos especializados em manutenção de impressoras no HGP.

### 2. Acesso do Administrador (ADM)
- Acesso exclusivo pelo link no rodapé do login:
  - **Usuário / CPF:** `admin` *(ou `000.000.000-00`)*
  - **Senha:** `admin123`
- Painel para **Cadastrar Novos Usuários** (Solicitantes do HGP e Técnicos Prestadores), listar todos os cadastros e acompanhar métricas de chamados.

---

## 👥 Credenciais de Teste

| Perfil | Nome / Setor | CPF | Senha |
|---|---|---|---|
| **Administrador** | Administrador Expert | `admin` *(ou `000.000.000-00`)* | `admin123` |
| **Solicitante** | Mariana Costa (Recepção HGP) | `111.222.333-44` | `123` |
| **Prestador** | Lucas Mendes (Técnico Expert) | `999.888.777-66` | `123` |

---

## 🚀 Como Executar Localmente

```bash
npm run dev
```

Acesse no navegador: **`http://localhost:5173`**
