import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useSelector } from 'react-redux';
import {
  IconArrowDownLeft,
  IconArrowRight,
  IconArrowUpRight,
  IconFileSpreadsheet,
  IconPlus,
} from '@tabler/icons-react';
import financeService from './financeService';
import { listCustomers } from '../customers/customerService';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'CASH', label: 'Nakit Kasa' },
  { value: 'BANK', label: 'Banka Hesabı' },
  { value: 'POS', label: 'POS / Kredi Kartı' },
  { value: 'EMPLOYEE', label: 'Personel Cari' },
  { value: 'PARTNER', label: 'Ortak Cari' },
];

const CURRENCY_OPTIONS = [
  { value: 'TRY', label: 'TRY' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

export default function Finance() {
  const theme = useMantineTheme();
  const role = useSelector((state) => state.auth.user?.role);
  const canAccess = ['ADMIN', 'FINANCE'].includes(role);
  const canSeeProfitability = role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: '',
    account_type: 'CASH',
    currency: 'TRY',
    initial_balance: 0,
  });

  const [chequeActionModalOpen, setChequeActionModalOpen] = useState(false);
  const [chequeAction, setChequeAction] = useState({
    type: '', // ENDORSE | COLLECT
    chequeId: null,
    target_account_id: '',
    description: '',
  });

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [txnForm, setTxnForm] = useState({
    type: 'INCOME',
    amount: 0,
    description: '',
    date: new Date(),
    source_account: '',
    target_account: '',
    related_customer: '',
    related_contract: '',
  });

  const [exportDateAfter, setExportDateAfter] = useState(null);
  const [exportDateBefore, setExportDateBefore] = useState(null);
  const [exportTransactionType, setExportTransactionType] = useState('');

  const [installmentPayModalOpen, setInstallmentPayModalOpen] = useState(false);
  const [installmentPay, setInstallmentPay] = useState({
    planId: null,
    installmentId: null,
    target_account_id: '',
    description: '',
  });

  const [onlyPendingInstallments, setOnlyPendingInstallments] = useState(true);

  const [forecastDays, setForecastDays] = useState('30');
  const [forecastData, setForecastData] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [fixedExpenseModalOpen, setFixedExpenseModalOpen] = useState(false);
  const [fixedExpenseSaving, setFixedExpenseSaving] = useState(false);
  const [fixedExpenseForm, setFixedExpenseForm] = useState({
    name: '',
    amount: 0,
    currency: 'TRY',
    due_day: 1,
    start_date: new Date(),
    end_date: null,
    notes: '',
    is_active: true,
  });
  const [profitability, setProfitability] = useState([]);
  const [financeAlerts, setFinanceAlerts] = useState(null);
  const [contracts, setContracts] = useState([]);

  const reloadAll = async () => {
    const profitabilityPromise = role === 'ADMIN'
      ? financeService.getProjectProfitability()
      : Promise.resolve({ items: [] });
    const [
      sumData,
      accData,
      txnData,
      chqData,
      planData,
      custData,
      contractData,
      fixedExpenseData,
      forecastResponse,
      profitabilityResponse,
      alertResponse,
    ] = await Promise.all([
      financeService.getDailySummary(),
      financeService.getAccounts(),
      financeService.getTransactions(),
      financeService.getCheques(),
      financeService.getPaymentPlans(),
      listCustomers(),
      financeService.getContracts(),
      financeService.getFixedExpenses(),
      financeService.getCashflowForecast(),
      profitabilityPromise,
      financeService.getFinanceAlerts(),
    ]);
    setSummary(sumData);
    setAccounts(accData);
    setTransactions(txnData);
    setCheques(chqData);
    setPaymentPlans(Array.isArray(planData) ? planData : []);
    setCustomers(custData);
    setContracts(Array.isArray(contractData) ? contractData : []);
    setFixedExpenses(Array.isArray(fixedExpenseData) ? fixedExpenseData : []);
    setForecastData(Array.isArray(forecastResponse?.forecasts) ? forecastResponse.forecasts : []);
    setProfitability(Array.isArray(profitabilityResponse?.items) ? profitabilityResponse.items : []);
    setFinanceAlerts(alertResponse || null);
  };

  useEffect(() => {
    if (!canAccess) return;
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        await reloadAll();
      } catch (e) {
        notifications.show({
          title: 'Veri yüklenemedi',
          message: e?.response?.data?.detail || e.message || 'Bilinmeyen hata',
          color: 'red',
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, [canAccess]);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: String(a.id), label: `${a.name} (${a.currency})` })),
    [accounts]
  );

  const collectAccountOptions = useMemo(
    () => accounts
      .filter((a) => ['CASH', 'BANK', 'POS'].includes(a.account_type))
      .map((a) => ({ value: String(a.id), label: `${a.name} (${a.currency})` })),
    [accounts]
  );

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      value: String(c.id),
      label: `${c.customer_number ? `#${c.customer_number} - ` : ''}${c.name}`,
    })),
    [customers]
  );

  const contractOptions = useMemo(
    () => contracts.map((c) => {
      const projectLabel = c.project_name || c.proposal_number || `Sözleşme #${c.id}`;
      const customerLabel = c.customer_name ? ` • ${c.customer_name}` : '';
      return { value: String(c.id), label: `#${c.id} - ${projectLabel}${customerLabel}` };
    }),
    [contracts]
  );

  const hasCollectAccounts = collectAccountOptions.length > 0;

  const selectedForecast = useMemo(
    () => forecastData.find((item) => String(item.days) === String(forecastDays)) || null,
    [forecastData, forecastDays]
  );

  const formatDate = (value) => (
    value instanceof Date ? value.toISOString().split('T')[0] : null
  );

  const handleExport = async () => {
    try {
      const params = {};
      if (exportDateAfter instanceof Date) {
        params.date_after = exportDateAfter.toISOString().split('T')[0];
      }
      if (exportDateBefore instanceof Date) {
        params.date_before = exportDateBefore.toISOString().split('T')[0];
      }
      if (exportTransactionType) {
        params.transaction_type = exportTransactionType;
      }

      const data = await financeService.exportTransactions(params);
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Kasa_Hareketleri.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ title: 'Export Hatası', message: e.message, color: 'red' });
    }
  };

  const handleSaveTransaction = async () => {
    try {
      const dateValue = txnForm.date instanceof Date ? txnForm.date : new Date();
      const payload = {
        transaction_type: txnForm.type,
        amount: Number(txnForm.amount || 0),
        description: txnForm.description,
        date: dateValue.toISOString().split('T')[0],
      };

      if (txnForm.type === 'INCOME') {
        payload.target_account = Number(txnForm.target_account);
        payload.related_customer = txnForm.related_customer ? Number(txnForm.related_customer) : null;
        payload.related_contract = txnForm.related_contract ? Number(txnForm.related_contract) : null;
      } else if (txnForm.type === 'EXPENSE') {
        payload.source_account = Number(txnForm.source_account);
        payload.related_contract = txnForm.related_contract ? Number(txnForm.related_contract) : null;
      } else if (txnForm.type === 'TRANSFER') {
        payload.source_account = Number(txnForm.source_account);
        payload.target_account = Number(txnForm.target_account);
      }

      await financeService.createTransaction(payload);
      notifications.show({ title: 'İşlem Başarılı', color: 'green' });
      setTxnModalOpen(false);

      setLoading(true);
      await reloadAll();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: JSON.stringify(e?.response?.data || e.message),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!accountForm.name.trim()) {
      notifications.show({ title: 'Eksik bilgi', message: 'Hesap adı zorunludur.', color: 'red' });
      return;
    }

    try {
      setAccountSaving(true);
      const payload = {
        name: accountForm.name.trim(),
        account_type: accountForm.account_type,
        currency: accountForm.currency,
        initial_balance: Number(accountForm.initial_balance || 0),
      };
      const created = await financeService.createAccount(payload);
      notifications.show({ title: 'Başarılı', message: 'Hesap oluşturuldu.', color: 'green' });
      setAccountModalOpen(false);
      setAccountForm({
        name: '',
        account_type: 'CASH',
        currency: 'TRY',
        initial_balance: 0,
      });

      if (created?.id && !installmentPay.target_account_id) {
        setInstallmentPay((prev) => ({ ...prev, target_account_id: String(created.id) }));
      }

      await reloadAll();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setAccountSaving(false);
    }
  };

  const handleCreateFixedExpense = async () => {
    if (!fixedExpenseForm.name.trim()) {
      notifications.show({ title: 'Eksik bilgi', message: 'Gider adı zorunludur.', color: 'red' });
      return;
    }
    if (!fixedExpenseForm.amount || fixedExpenseForm.amount <= 0) {
      notifications.show({ title: 'Eksik bilgi', message: 'Tutar 0’dan büyük olmalıdır.', color: 'red' });
      return;
    }

    try {
      setFixedExpenseSaving(true);
      const payload = {
        name: fixedExpenseForm.name.trim(),
        amount: Number(fixedExpenseForm.amount || 0),
        currency: fixedExpenseForm.currency,
        due_day: Number(fixedExpenseForm.due_day || 1),
        start_date: formatDate(fixedExpenseForm.start_date),
        end_date: formatDate(fixedExpenseForm.end_date),
        notes: fixedExpenseForm.notes || '',
        is_active: Boolean(fixedExpenseForm.is_active),
      };
      await financeService.createFixedExpense(payload);
      notifications.show({ title: 'Başarılı', message: 'Sabit gider eklendi.', color: 'green' });
      setFixedExpenseModalOpen(false);
      setFixedExpenseForm({
        name: '',
        amount: 0,
        currency: 'TRY',
        due_day: 1,
        start_date: new Date(),
        end_date: null,
        notes: '',
        is_active: true,
      });
      await reloadAll();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setFixedExpenseSaving(false);
    }
  };

  const handleDeleteFixedExpense = async (id) => {
    try {
      await financeService.deleteFixedExpense(id);
      notifications.show({ title: 'Başarılı', message: 'Sabit gider silindi.', color: 'green' });
      await reloadAll();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    }
  };

  const openChequeAction = (type, chq) => {
    setChequeAction({
      type,
      chequeId: chq.id,
      target_account_id: '',
      description: '',
    });
    setChequeActionModalOpen(true);
  };

  const handleConfirmChequeAction = async () => {
    try {
      if (!chequeAction.chequeId) return;
      if (!chequeAction.target_account_id) {
        notifications.show({ title: 'Eksik bilgi', message: 'Lütfen hedef hesabı seçin.', color: 'red' });
        return;
      }

      const payload = {
        target_account_id: Number(chequeAction.target_account_id),
        description: chequeAction.description || '',
      };

      setLoading(true);

      if (chequeAction.type === 'ENDORSE') {
        await financeService.endorseCheque(chequeAction.chequeId, payload);
        notifications.show({ title: 'Başarılı', message: 'Çek ciro edildi.', color: 'green' });
      } else if (chequeAction.type === 'COLLECT') {
        await financeService.collectCheque(chequeAction.chequeId, payload);
        notifications.show({ title: 'Başarılı', message: 'Çek tahsil edildi.', color: 'green' });
      }

      await reloadAll();

      setChequeActionModalOpen(false);
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const openPayInstallment = (plan, inst) => {
    setInstallmentPay({
      planId: plan.id,
      installmentId: inst.id,
      target_account_id: '',
      description: '',
    });
    setInstallmentPayModalOpen(true);
  };

  const handleConfirmPayInstallment = async () => {
    try {
      if (!installmentPay.planId || !installmentPay.installmentId) return;
      if (!installmentPay.target_account_id) {
        notifications.show({ title: 'Eksik bilgi', message: 'Lütfen kasa/banka seçin.', color: 'red' });
        return;
      }

      setLoading(true);
      await financeService.payInstallment(installmentPay.planId, {
        installment_id: Number(installmentPay.installmentId),
        target_account_id: Number(installmentPay.target_account_id),
        description: installmentPay.description || '',
      });

      notifications.show({ title: 'Başarılı', message: 'Taksit tahsil edildi.', color: 'green' });
      setInstallmentPayModalOpen(false);
      await reloadAll();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const installmentRows = useMemo(() => {
    const rows = [];
    for (const plan of paymentPlans) {
      if ((plan.method || '').toUpperCase() === 'CASH') continue;
      const installments = Array.isArray(plan.installments) ? plan.installments : [];
      for (const inst of installments) {
        if (onlyPendingInstallments && inst.status !== 'PENDING') continue;
        rows.push({ plan, inst });
      }
    }
    rows.sort((a, b) => String(a.inst.due_date || '').localeCompare(String(b.inst.due_date || '')));
    return rows;
  }, [paymentPlans, onlyPendingInstallments]);

  if (!canAccess) {
    return (
      <Container size="xl" py="md">
        <Title order={2}>Finans</Title>
        <Text mt="md">Bu sayfaya erişiminiz yok.</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Finans Yönetimi</Title>
        <Group>
          <DateInput
            placeholder="Başlangıç"
            value={exportDateAfter}
            onChange={setExportDateAfter}
            clearable
          />
          <DateInput
            placeholder="Bitiş"
            value={exportDateBefore}
            onChange={setExportDateBefore}
            clearable
          />
          <Select
            placeholder="İşlem tipi"
            value={exportTransactionType}
            onChange={(v) => setExportTransactionType(v || '')}
            data={[
              { value: '', label: 'Tümü' },
              { value: 'INCOME', label: 'Tahsilat / Giriş' },
              { value: 'EXPENSE', label: 'Ödeme / Çıkış' },
              { value: 'TRANSFER', label: 'Virman / Transfer' },
            ]}
          />
          <Button
            variant="outline"
            leftSection={<IconFileSpreadsheet size={18} />}
            onClick={handleExport}
          >
            Excel İndir
          </Button>
          <Button variant="outline" onClick={() => setAccountModalOpen(true)}>
            Yeni Hesap
          </Button>
          <Button leftSection={<IconPlus size={18} />} onClick={() => setTxnModalOpen(true)}>
            Yeni İşlem
          </Button>
        </Group>
      </Group>

      {loading && <Loader size="sm" mb="md" />}

      {summary && (
        <SimpleGrid cols={3} mb="xl" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                GÜNLÜK TAHSİLAT
              </Text>
              <IconArrowDownLeft color={theme.colors.green[6]} size={24} />
            </Group>
            <Text fw={700} size="xl" mt="sm">
              {summary.total_income} ₺
            </Text>
          </Card>
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                GÜNLÜK ÖDEME
              </Text>
              <IconArrowUpRight color={theme.colors.red[6]} size={24} />
            </Group>
            <Text fw={700} size="xl" mt="sm">
              {summary.total_expense} ₺
            </Text>
          </Card>
          <Card
            withBorder
            padding="lg"
            radius="md"
            bg={summary.net_flow >= 0 ? 'green.0' : 'red.0'}
          >
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                NET NAKİT AKIŞI
              </Text>
            </Group>
            <Text fw={700} size="xl" mt="sm" c={summary.net_flow >= 0 ? 'green' : 'red'}>
              {summary.net_flow} ₺
            </Text>
          </Card>
        </SimpleGrid>
      )}

      <Tabs value={activeTab} onChange={(v) => setActiveTab(v || 'summary')} radius="md">
        <Tabs.List>
          <Tabs.Tab value="summary">Kasa Hareketleri</Tabs.Tab>
          <Tabs.Tab value="accounts">Hesap Bakiyeleri</Tabs.Tab>
          <Tabs.Tab value="cheques">Çek/Senet</Tabs.Tab>
          <Tabs.Tab value="installments">Taksitler</Tabs.Tab>
          <Tabs.Tab value="forecast">Nakit Akış Tahmini</Tabs.Tab>
          {canSeeProfitability && (
            <Tabs.Tab value="profitability">Proje Kârlılığı</Tabs.Tab>
          )}
          <Tabs.Tab value="alerts">Finans Uyarıları</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="summary" pt="xs">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tarih</Table.Th>
                <Table.Th>Tip</Table.Th>
                <Table.Th>Açıklama</Table.Th>
                <Table.Th>Tutar</Table.Th>
                <Table.Th>Kaynak/Hedef</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {transactions.map((txn) => (
                <Table.Tr key={txn.id}>
                  <Table.Td>{txn.date}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        txn.transaction_type === 'INCOME'
                          ? 'green'
                          : txn.transaction_type === 'EXPENSE'
                            ? 'red'
                            : 'blue'
                      }
                    >
                      {txn.transaction_type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{txn.description}</Table.Td>
                  <Table.Td style={{ fontWeight: 600 }}>{txn.amount}</Table.Td>
                  <Table.Td>
                    {txn.transaction_type === 'INCOME' && `-> ${txn.target_account_name}`}
                    {txn.transaction_type === 'EXPENSE' && `${txn.source_account_name} ->`}
                    {txn.transaction_type === 'TRANSFER' && `${txn.source_account_name} -> ${txn.target_account_name}`}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="accounts" pt="xs">
          <SimpleGrid cols={3} breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
            {accounts.map((acc) => (
              <Card key={acc.id} withBorder>
                <Text fw={600}>{acc.name}</Text>
                <Text size="sm" c="dimmed">
                  {acc.account_type}
                </Text>
                <Text size="sm" mt="xs" c="dimmed">
                  {acc.currency}
                </Text>
                <Text size="xl" mt="md" ta="right">
                  {acc.current_balance ?? acc.cached_balance ?? acc.initial_balance}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="cheques" pt="xs">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vade</Table.Th>
                <Table.Th>Seri No</Table.Th>
                <Table.Th>Keşideci</Table.Th>
                <Table.Th>Tutar</Table.Th>
                <Table.Th>Durum</Table.Th>
                <Table.Th>Konum</Table.Th>
                <Table.Th>Aksiyon</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cheques.map((chq) => (
                <Table.Tr key={chq.id}>
                  <Table.Td>{chq.due_date}</Table.Td>
                  <Table.Td>{chq.serial_number}</Table.Td>
                  <Table.Td>{chq.drawer}</Table.Td>
                  <Table.Td>
                    {chq.amount} {chq.currency}
                  </Table.Td>
                  <Table.Td>
                    <Badge>{chq.status_display}</Badge>
                  </Table.Td>
                  <Table.Td>{chq.current_location}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={chq.status !== 'PORTFOLIO'}
                        onClick={() => openChequeAction('ENDORSE', chq)}
                      >
                        Ciro Et
                      </Button>
                      <Button
                        size="xs"
                        disabled={chq.status !== 'PORTFOLIO'}
                        onClick={() => openChequeAction('COLLECT', chq)}
                      >
                        Tahsil Et
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="installments" pt="xs">
          <Group justify="space-between" mb="sm">
            <Checkbox
              label="Sadece bekleyen taksitler"
              checked={onlyPendingInstallments}
              onChange={(e) => setOnlyPendingInstallments(e.currentTarget.checked)}
            />
            <Badge variant="light">{installmentRows.length} kayıt</Badge>
          </Group>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vade</Table.Th>
                <Table.Th>Sözleşme</Table.Th>
                <Table.Th>Müşteri</Table.Th>
                <Table.Th>Yöntem</Table.Th>
                <Table.Th>Taksit</Table.Th>
                <Table.Th>Tutar</Table.Th>
                <Table.Th>Durum</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {installmentRows.map(({ plan, inst }) => (
                <Table.Tr key={`inst-${inst.id}`}
                  style={inst.status === 'PENDING' ? { fontWeight: 600 } : undefined}
                >
                  <Table.Td>{inst.due_date}</Table.Td>
                  <Table.Td>#{plan.contract}</Table.Td>
                  <Table.Td>{plan?.customer_name || '-'}</Table.Td>
                  <Table.Td>{plan.method === 'CASH' ? 'Peşin' : 'Vadeli'}</Table.Td>
                  <Table.Td>{inst.installment_no}/{plan.installment_count}</Table.Td>
                  <Table.Td>{inst.amount} {inst.currency}</Table.Td>
                  <Table.Td>
                    <Badge color={inst.status === 'PAID' ? 'green' : inst.status === 'PENDING' ? 'yellow' : 'gray'}>
                      {inst.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      disabled={inst.status !== 'PENDING'}
                      onClick={() => openPayInstallment(plan, inst)}
                    >
                      Tahsil Et
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="forecast" pt="xs">
          <Group justify="space-between" mb="md">
            <Text fw={600}>Nakit Akış Tahmini</Text>
            <SegmentedControl
              value={forecastDays}
              onChange={setForecastDays}
              data={[
                { value: '30', label: '30 Gün' },
                { value: '60', label: '60 Gün' },
                { value: '90', label: '90 Gün' },
              ]}
            />
          </Group>

          {!selectedForecast ? (
            <Text size="sm" c="dimmed">Tahmin verisi bulunamadı.</Text>
          ) : (
            <>
              <SimpleGrid cols={3} mb="md" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
                {selectedForecast.summary.map((row) => (
                  <Card key={`forecast-${row.currency}`} withBorder padding="lg" radius="md">
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                      Kasada ne olacak? ({row.currency})
                    </Text>
                    <Text fw={700} size="xl" mt="sm">
                      {row.projected_cash} {row.currency}
                    </Text>
                    <Text size="sm" c="dimmed" mt="xs">
                      Başlangıç: {row.starting_cash} • Tahsilat: {row.expected_collections} • Çek: {row.cheque_due} • Sabit gider: {row.fixed_expenses}
                    </Text>
                  </Card>
                ))}
              </SimpleGrid>

              <SimpleGrid cols={3} breakpoints={[{ maxWidth: 'lg', cols: 1 }]}>
                <Card withBorder padding="lg" radius="md">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>Beklenen Tahsilatlar</Text>
                    <Badge variant="light">{selectedForecast.expected_collections.length}</Badge>
                  </Group>
                  {selectedForecast.expected_collections.length === 0 ? (
                    <Text size="sm" c="dimmed">Tahsilat beklenmiyor.</Text>
                  ) : (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Vade</Table.Th>
                          <Table.Th>Müşteri</Table.Th>
                          <Table.Th>Sözleşme</Table.Th>
                          <Table.Th>Tutar</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedForecast.expected_collections.map((item) => (
                          <Table.Tr key={`exp-${item.id}`}>
                            <Table.Td>{item.due_date}</Table.Td>
                            <Table.Td>{item.customer_name || '-'}</Table.Td>
                            <Table.Td>#{item.contract_id || '-'}</Table.Td>
                            <Table.Td>{item.amount} {item.currency}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Card>

                <Card withBorder padding="lg" radius="md">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>Çek Vadeleri</Text>
                    <Badge variant="light">{selectedForecast.cheques_due.length}</Badge>
                  </Group>
                  {selectedForecast.cheques_due.length === 0 ? (
                    <Text size="sm" c="dimmed">Vadesi yaklaşan çek yok.</Text>
                  ) : (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Vade</Table.Th>
                          <Table.Th>Seri No</Table.Th>
                          <Table.Th>Tutar</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedForecast.cheques_due.map((item) => (
                          <Table.Tr key={`chq-forecast-${item.id}`}>
                            <Table.Td>{item.due_date}</Table.Td>
                            <Table.Td>{item.serial_number}</Table.Td>
                            <Table.Td>{item.amount} {item.currency}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Card>

                <Card withBorder padding="lg" radius="md">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>Sabit Giderler</Text>
                    <Group gap="xs">
                      <Badge variant="light">{selectedForecast.fixed_expenses.length}</Badge>
                      <Button size="xs" variant="light" onClick={() => setFixedExpenseModalOpen(true)}>
                        Gider Ekle
                      </Button>
                    </Group>
                  </Group>
                  {selectedForecast.fixed_expenses.length === 0 ? (
                    <Text size="sm" c="dimmed">Sabit gider bulunmuyor.</Text>
                  ) : (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Vade</Table.Th>
                          <Table.Th>Gider</Table.Th>
                          <Table.Th>Tutar</Table.Th>
                          <Table.Th></Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedForecast.fixed_expenses.map((item, index) => (
                          <Table.Tr key={`fx-${item.id}-${index}`}>
                            <Table.Td>{item.due_date}</Table.Td>
                            <Table.Td>{item.name}</Table.Td>
                            <Table.Td>{item.amount} {item.currency}</Table.Td>
                            <Table.Td>
                              <Button size="xs" variant="subtle" color="red" onClick={() => handleDeleteFixedExpense(item.id)}>
                                Sil
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                  <Text size="xs" c="dimmed" mt="xs">
                    Tanım sayısı: {fixedExpenses.length}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Silme işlemi gider tanımını kalıcı olarak kaldırır.
                  </Text>
                </Card>
              </SimpleGrid>
            </>
          )}
        </Tabs.Panel>

        {canSeeProfitability && (
          <Tabs.Panel value="profitability" pt="xs">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Proje Bazlı Kârlılık</Text>
              <Badge variant="light">{profitability.length} kayıt</Badge>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sözleşme</Table.Th>
                  <Table.Th>Proje / Müşteri</Table.Th>
                  <Table.Th>Planlanan Gelir</Table.Th>
                  <Table.Th>Gerçek Maliyet</Table.Th>
                  <Table.Th>Net Kâr</Table.Th>
                  <Table.Th>Sapma</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {profitability.map((row) => (
                  <Table.Tr key={`profit-${row.contract_id}`}>
                    <Table.Td>#{row.contract_id}</Table.Td>
                    <Table.Td>
                      <Text fw={600}>{row.project_name || row.proposal_number || '-'}</Text>
                      <Text size="xs" c="dimmed">{row.customer_name || '-'}</Text>
                    </Table.Td>
                    <Table.Td>{row.expected_revenue} {row.currency || ''}</Table.Td>
                    <Table.Td>{row.actual_cost} {row.currency || ''}</Table.Td>
                    <Table.Td>
                      <Badge color={row.net_profit >= 0 ? 'green' : 'red'}>
                        {row.net_profit} {row.currency || ''}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={row.variance >= 0 ? 'green' : 'yellow'}>
                        {row.variance} {row.currency || ''}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>
        )}

        <Tabs.Panel value="alerts" pt="xs">
          <SimpleGrid cols={3} mb="md" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
            <Card withBorder padding="lg" radius="md">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Geciken Tahsilat</Text>
              <Text fw={700} size="xl" mt="sm">{financeAlerts?.summary?.overdue_collections || 0}</Text>
            </Card>
            <Card withBorder padding="lg" radius="md">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Vadesi Yaklaşan Çek</Text>
              <Text fw={700} size="xl" mt="sm">{financeAlerts?.summary?.upcoming_cheques || 0}</Text>
            </Card>
            <Card withBorder padding="lg" radius="md">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Negatif Bakiye Riski</Text>
              <Text fw={700} size="xl" mt="sm">{financeAlerts?.summary?.negative_balance_risk || 0}</Text>
            </Card>
          </SimpleGrid>

          <Card withBorder padding="lg" radius="md" mb="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Geciken Tahsilatlar</Text>
              <Badge variant="light">{financeAlerts?.overdue_collections?.length || 0}</Badge>
            </Group>
            {(financeAlerts?.overdue_collections || []).length === 0 ? (
              <Text size="sm" c="dimmed">Geciken tahsilat yok.</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Vade</Table.Th>
                    <Table.Th>Müşteri</Table.Th>
                    <Table.Th>Gün</Table.Th>
                    <Table.Th>Tutar</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {financeAlerts.overdue_collections.map((item) => (
                    <Table.Tr key={`overdue-${item.id}`}>
                      <Table.Td>{item.due_date}</Table.Td>
                      <Table.Td>{item.customer_name || '-'}</Table.Td>
                      <Table.Td>{item.days_overdue}</Table.Td>
                      <Table.Td>{item.amount} {item.currency}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          <Card withBorder padding="lg" radius="md" mb="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Vadesi Yaklaşan Çekler</Text>
              <Badge variant="light">{financeAlerts?.upcoming_cheques?.length || 0}</Badge>
            </Group>
            {(financeAlerts?.upcoming_cheques || []).length === 0 ? (
              <Text size="sm" c="dimmed">Yaklaşan çek yok.</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Vade</Table.Th>
                    <Table.Th>Seri No</Table.Th>
                    <Table.Th>Gün</Table.Th>
                    <Table.Th>Tutar</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {financeAlerts.upcoming_cheques.map((item) => (
                    <Table.Tr key={`alert-chq-${item.id}`}>
                      <Table.Td>{item.due_date}</Table.Td>
                      <Table.Td>{item.serial_number}</Table.Td>
                      <Table.Td>{item.days_to_due}</Table.Td>
                      <Table.Td>{item.amount} {item.currency}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Negatif Bakiye Riski</Text>
              <Badge variant="light">{financeAlerts?.negative_balance_risk?.length || 0}</Badge>
            </Group>
            {(financeAlerts?.negative_balance_risk || []).length === 0 ? (
              <Text size="sm" c="dimmed">Negatif bakiye riski görünmüyor.</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Para Birimi</Table.Th>
                    <Table.Th>Gün</Table.Th>
                    <Table.Th>Tahmini Bakiye</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {financeAlerts.negative_balance_risk.map((item, index) => (
                    <Table.Tr key={`neg-${item.currency}-${index}`}>
                      <Table.Td>{item.currency}</Table.Td>
                      <Table.Td>{item.days}</Table.Td>
                      <Table.Td>{item.projected_cash} {item.currency}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={chequeActionModalOpen}
        onClose={() => setChequeActionModalOpen(false)}
        title={chequeAction.type === 'ENDORSE' ? 'Çek Ciro Et' : 'Çek Tahsil Et'}
        centered
      >
        <SimpleGrid cols={1}>
          <Select
            label={chequeAction.type === 'ENDORSE' ? 'Kime veriyorsun? (Hesap)' : 'Hangi bankaya/kasaya yattı?'}
            data={chequeAction.type === 'ENDORSE' ? accountOptions : collectAccountOptions}
            value={chequeAction.target_account_id}
            onChange={(v) => setChequeAction({ ...chequeAction, target_account_id: v || '' })}
            searchable
          />
          <TextInput
            label="Açıklama (opsiyonel)"
            value={chequeAction.description}
            onChange={(e) => setChequeAction({ ...chequeAction, description: e.target.value })}
          />
          <Button fullWidth mt="md" onClick={handleConfirmChequeAction}>
            Onayla
          </Button>
        </SimpleGrid>
      </Modal>

      <Modal
        opened={installmentPayModalOpen}
        onClose={() => setInstallmentPayModalOpen(false)}
        title="Taksit Tahsil Et"
        centered
      >
        <SimpleGrid cols={1}>
          <Select
            label="Hangi bankaya/kasaya girdi?"
            data={collectAccountOptions}
            value={installmentPay.target_account_id}
            onChange={(v) => setInstallmentPay({ ...installmentPay, target_account_id: v || '' })}
            searchable
            disabled={!hasCollectAccounts}
          />
          {!hasCollectAccounts && (
            <Group justify="space-between" mt="xs">
              <Text size="sm" c="dimmed">Kasa/banka hesabı yok. Önce hesap ekleyin.</Text>
              <Button size="xs" variant="light" onClick={() => setAccountModalOpen(true)}>
                Hesap Ekle
              </Button>
            </Group>
          )}
          <TextInput
            label="Açıklama (opsiyonel)"
            value={installmentPay.description}
            onChange={(e) => setInstallmentPay({ ...installmentPay, description: e.target.value })}
          />
          <Button fullWidth mt="md" onClick={handleConfirmPayInstallment}>
            Onayla
          </Button>
        </SimpleGrid>
      </Modal>

      <Modal
        opened={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title="Yeni Hesap"
        centered
      >
        <SimpleGrid cols={1}>
          <TextInput
            label="Hesap Adı"
            value={accountForm.name}
            onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
            required
          />
          <Select
            label="Hesap Tipi"
            data={ACCOUNT_TYPE_OPTIONS}
            value={accountForm.account_type}
            onChange={(v) => setAccountForm({ ...accountForm, account_type: v || 'CASH' })}
          />
          <Select
            label="Para Birimi"
            data={CURRENCY_OPTIONS}
            value={accountForm.currency}
            onChange={(v) => setAccountForm({ ...accountForm, currency: v || 'TRY' })}
          />
          <NumberInput
            label="Açılış Bakiyesi"
            value={accountForm.initial_balance}
            min={0}
            onChange={(v) =>
              setAccountForm({ ...accountForm, initial_balance: typeof v === 'number' ? v : 0 })
            }
          />
          <Button fullWidth mt="md" onClick={handleCreateAccount} loading={accountSaving}>
            Hesabı Kaydet
          </Button>
        </SimpleGrid>
      </Modal>

      <Modal
        opened={fixedExpenseModalOpen}
        onClose={() => setFixedExpenseModalOpen(false)}
        title="Sabit Gider Ekle"
        centered
      >
        <SimpleGrid cols={1}>
          <TextInput
            label="Gider Adı"
            value={fixedExpenseForm.name}
            onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, name: e.target.value })}
            required
          />
          <NumberInput
            label="Tutar"
            value={fixedExpenseForm.amount}
            min={0}
            onChange={(v) => setFixedExpenseForm({ ...fixedExpenseForm, amount: typeof v === 'number' ? v : 0 })}
          />
          <Select
            label="Para Birimi"
            data={CURRENCY_OPTIONS}
            value={fixedExpenseForm.currency}
            onChange={(v) => setFixedExpenseForm({ ...fixedExpenseForm, currency: v || 'TRY' })}
          />
          <NumberInput
            label="Ayın Kaçıncı Günü"
            value={fixedExpenseForm.due_day}
            min={1}
            max={31}
            onChange={(v) => setFixedExpenseForm({ ...fixedExpenseForm, due_day: typeof v === 'number' ? v : 1 })}
          />
          <DateInput
            label="Başlangıç Tarihi"
            value={fixedExpenseForm.start_date}
            onChange={(v) => setFixedExpenseForm({ ...fixedExpenseForm, start_date: v || new Date() })}
          />
          <DateInput
            label="Bitiş Tarihi (opsiyonel)"
            value={fixedExpenseForm.end_date}
            onChange={(v) => setFixedExpenseForm({ ...fixedExpenseForm, end_date: v || null })}
            clearable
          />
          <TextInput
            label="Not"
            value={fixedExpenseForm.notes}
            onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, notes: e.target.value })}
          />
          <Checkbox
            label="Aktif"
            checked={fixedExpenseForm.is_active}
            onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, is_active: e.currentTarget.checked })}
          />
          <Button fullWidth mt="md" onClick={handleCreateFixedExpense} loading={fixedExpenseSaving}>
            Sabit Gideri Kaydet
          </Button>
        </SimpleGrid>
      </Modal>

      <Modal
        opened={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
        title="Yeni Finansal İşlem"
        centered
      >
        <SimpleGrid cols={1}>
          <Select
            label="İşlem Tipi"
            data={[
              { value: 'INCOME', label: 'Tahsilat / Para Girişi' },
              { value: 'EXPENSE', label: 'Ödeme / Para Çıkışı' },
              { value: 'TRANSFER', label: 'Virman / Transfer' },
            ]}
            value={txnForm.type}
            onChange={(v) =>
              setTxnForm({
                ...txnForm,
                type: v || 'INCOME',
                source_account: '',
                target_account: '',
              })
            }
          />

          <NumberInput
            label="Tutar"
            value={txnForm.amount}
            min={0}
            onChange={(v) => setTxnForm({ ...txnForm, amount: typeof v === 'number' ? v : 0 })}
          />
          <DateInput
            label="Tarih"
            value={txnForm.date}
            onChange={(v) => setTxnForm({ ...txnForm, date: v || new Date() })}
          />
          <TextInput
            label="Açıklama"
            value={txnForm.description}
            onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })}
          />

          {txnForm.type === 'INCOME' && (
            <>
              <Select
                label="Hedef Kasa/Banka (Giren)"
                data={accountOptions}
                value={txnForm.target_account}
                onChange={(v) => setTxnForm({ ...txnForm, target_account: v || '' })}
                searchable
              />
              <Select
                label="İlgili Müşteri"
                data={customerOptions}
                value={txnForm.related_customer}
                onChange={(v) => setTxnForm({ ...txnForm, related_customer: v || '' })}
                searchable
                clearable
              />
              <Select
                label="İlgili Sözleşme/Proje"
                data={contractOptions}
                value={txnForm.related_contract}
                onChange={(v) => setTxnForm({ ...txnForm, related_contract: v || '' })}
                searchable
                clearable
              />
            </>
          )}

          {txnForm.type === 'EXPENSE' && (
            <>
              <Select
                label="Kaynak Kasa/Banka (Çıkan)"
                data={accountOptions}
                value={txnForm.source_account}
                onChange={(v) => setTxnForm({ ...txnForm, source_account: v || '' })}
                searchable
              />
              <Select
                label="İlgili Sözleşme/Proje"
                data={contractOptions}
                value={txnForm.related_contract}
                onChange={(v) => setTxnForm({ ...txnForm, related_contract: v || '' })}
                searchable
                clearable
              />
            </>
          )}

          {txnForm.type === 'TRANSFER' && (
            <>
              <Select
                label="Kaynak Hesap (Çıkan)"
                data={accountOptions}
                value={txnForm.source_account}
                onChange={(v) => setTxnForm({ ...txnForm, source_account: v || '' })}
                searchable
              />
              <Group justify="center">
                <IconArrowRight />
              </Group>
              <Select
                label="Hedef Hesap (Giren)"
                data={accountOptions}
                value={txnForm.target_account}
                onChange={(v) => setTxnForm({ ...txnForm, target_account: v || '' })}
                searchable
              />
            </>
          )}

          <Button fullWidth mt="md" onClick={handleSaveTransaction}>
            İşlemi Kaydet
          </Button>
        </SimpleGrid>
      </Modal>
    </Container>
  );
}
