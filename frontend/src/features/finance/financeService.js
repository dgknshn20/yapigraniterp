import axios from 'axios';

// API URL Yönetimi
// Eğer .env yoksa localhost:8000/api/ varsayılır.
const BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');

// Helper: URL sonundaki slash çakışmalarını önlemek için
const getUrl = (endpoint) => `${BASE_URL}/${endpoint}/`.replace(/([^:]\/)\/+/g, "$1");

// --- HESAP VE İŞLEM FONKSİYONLARI ---

const getAccounts = async () => {
  const response = await axios.get(getUrl('accounts'));
  return response.data;
};

const createAccount = async (data) => {
  const response = await axios.post(getUrl('accounts'), data);
  return response.data;
};

const getTransactions = async () => {
  const response = await axios.get(getUrl('transactions'));
  return response.data;
};

const createTransaction = async (transactionData) => {
  const response = await axios.post(getUrl('transactions'), transactionData);
  return response.data;
};

const getDailySummary = async () => {
  const response = await axios.get(getUrl('transactions') + 'daily_summary/');
  return response.data;
};

// --- YENİ EKLENEN: EXCEL EXPORT ---
const exportTransactions = async (params) => {
  const response = await axios.get(getUrl('transactions') + 'export_excel/', {
    params,
    responseType: 'blob',
  });
  return response.data;
};

// --- ÇEK (CHEQUE) FONKSİYONLARI ---

const getCheques = async () => {
  const response = await axios.get(getUrl('cheques'));
  return response.data;
};

const endorseCheque = async (id, data) => {
  // data: { target_account_id, description }
  const response = await axios.post(getUrl('cheques') + `${id}/endorse/`, data);
  return response.data;
};

const collectCheque = async (id, data) => {
  // data: { target_account_id }
  const response = await axios.post(getUrl('cheques') + `${id}/collect/`, data);
  return response.data;
};

// --- VADELİ SATIŞ / TAKSİTLER ---

const getPaymentPlans = async () => {
  const response = await axios.get(getUrl('payment-plans'));
  return response.data;
};

const payInstallment = async (planId, data) => {
  // data: { installment_id, target_account_id, description }
  const response = await axios.post(getUrl('payment-plans') + `${planId}/pay-installment/`, data);
  return response.data;
};

// --- SABİT GİDERLER ---

const getFixedExpenses = async () => {
  const response = await axios.get(getUrl('fixed-expenses'));
  return response.data;
};

const createFixedExpense = async (data) => {
  const response = await axios.post(getUrl('fixed-expenses'), data);
  return response.data;
};

const deleteFixedExpense = async (id) => {
  const response = await axios.delete(getUrl('fixed-expenses') + `${id}/`);
  return response.data;
};

// --- NAKİT AKIŞ / KÂRLILIK / UYARILAR ---

const getCashflowForecast = async (days) => {
  const params = {};
  if (days) {
    params.days = Array.isArray(days) ? days.join(',') : days;
  }
  const response = await axios.get(getUrl('finance') + 'cashflow-forecast/', { params });
  return response.data;
};

const getProjectProfitability = async () => {
  const response = await axios.get(getUrl('finance') + 'project-profitability/');
  return response.data;
};

const getFinanceAlerts = async (params) => {
  const response = await axios.get(getUrl('finance') + 'alerts/', { params });
  return response.data;
};

const getContracts = async () => {
  const response = await axios.get(getUrl('contracts'));
  return response.data;
};

const financeService = {
  getAccounts,
  createAccount,
  getTransactions,
  createTransaction,
  getDailySummary,
  exportTransactions,
  getCheques,
  endorseCheque,
  collectCheque,
  getPaymentPlans,
  payInstallment,
  getFixedExpenses,
  createFixedExpense,
  deleteFixedExpense,
  getCashflowForecast,
  getProjectProfitability,
  getFinanceAlerts,
  getContracts,
};

export default financeService;
