import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconCheck } from '@tabler/icons-react';

import { listProposals, createProposal, createProposalItem, finalizeProposal } from './proposalService';
import { listCustomers } from '../customers/customerService';
import { listContracts } from '../contracts/contractService';

const STATUS_LABELS = {
  DRAFT: 'Taslak',
  SENT: 'Gönderildi',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  CONVERTED: 'Sözleşmeye Dönüştü',
};

const CONTRACT_STATUS_LABELS = {
  IMZA_BEKLIYOR: 'İmza Bekliyor',
  IMZALANDI: 'Onaylandı',
  ACTIVE: 'Aktif',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};

const CONTRACT_STATUS_COLORS = {
  IMZA_BEKLIYOR: 'orange',
  IMZALANDI: 'blue',
  ACTIVE: 'teal',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

const DELIVERY_OPTIONS = [
  { value: 'APPLICATION_INCLUDED', label: 'Uygulama Dahil' },
  { value: 'FACTORY_DELIVERY', label: 'Fabrika Teslim' },
];

const UNIT_OPTIONS = [
  { value: 'MTUL', label: 'Mtül' },
  { value: 'M2', label: 'm²' },
  { value: 'ADET', label: 'Adet' },
  { value: 'TAKIM', label: 'Takım' },
];

const VAT_MULTIPLIER = 1.2;

const SERVICE_DEFINITIONS = [
  {
    id: 'atelier_labor',
    name: 'Atölye Eleman Maliyeti',
    unit: 'Kişi',
    timeUnit: 'Gün',
    price: 3800,
    totalFixed: false,
    durationFixed: false,
  },
  {
    id: 'atelier_overhead',
    name: 'Atölye İşletme Maliyeti',
    unit: 'Grup',
    timeUnit: 'Gün',
    price: 6350,
    totalFixed: true,
    totalValue: 1,
    durationFixed: false,
  },
  {
    id: 'consumables',
    name: 'Sarf Malzeme Gideri',
    unit: 'Grup',
    timeUnit: 'Grup',
    price: 0,
    totalFixed: true,
    totalValue: 1,
    durationFixed: true,
  },
  {
    id: 'site_labor',
    name: 'Eleman Şantiye Montaj',
    unit: 'Kişi',
    timeUnit: 'Gün',
    price: 3800,
    totalFixed: false,
    durationFixed: false,
  },
  {
    id: 'transport',
    name: 'Nakliye',
    unit: 'Kez',
    timeUnit: 'KM',
    price: 15,
    totalFixed: false,
    durationFixed: false,
  },
];

const EXTERNAL_SERVICE_OPTIONS = [
  { value: 'OPTION_1', label: 'Seçenek 1' },
  { value: 'OPTION_2', label: 'Seçenek 2' },
  { value: 'OTHER', label: 'Diğer' },
];

const EXTERNAL_SERVICE_PRICES = {
  OPTION_1: 0,
  OPTION_2: 0,
  OTHER: 0,
};

const EXTERNAL_UNIT_OPTIONS = [
  { value: 'MTUL', label: 'Mtül' },
  { value: 'M2', label: 'm²' },
  { value: 'ADET', label: 'Adet' },
];

const createServiceInputs = () => ({
  atelier_labor: { total: 0, duration: 0 },
  atelier_overhead: { total: 1, duration: 0 },
  consumables: { total: 1, duration: 1 },
  site_labor: { total: 0, duration: 0 },
  transport: { total: 0, duration: 0 },
});

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export default function Proposals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [opened, setOpened] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [saving, setSaving] = useState(false);

  const [formCustomer, setFormCustomer] = useState(null);
  const [formDate, setFormDate] = useState(new Date());
  const [formCurrency, setFormCurrency] = useState('TRY');
  const [formNote, setFormNote] = useState('');
  const [formWorkSummary, setFormWorkSummary] = useState('');
  const [formStoneSummary, setFormStoneSummary] = useState('');
  const [formDelivery, setFormDelivery] = useState('FACTORY_DELIVERY');

  const [lineItems, setLineItems] = useState([]);
  const [costTab, setCostTab] = useState('products');
  const [productLines, setProductLines] = useState([]);
  const [serviceInputs, setServiceInputs] = useState(() => createServiceInputs());
  const [externalServices, setExternalServices] = useState([]);
  const [profitMultiplier, setProfitMultiplier] = useState(1.6);

  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [finalizeTargetId, setFinalizeTargetId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [installmentCount, setInstallmentCount] = useState(4);
  const [firstDueDate, setFirstDueDate] = useState(new Date());

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailProposal, setDetailProposal] = useState(null);

  const createEmptyItem = () => ({
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work: '',
    stone: '',
    size: '',
    total: 0,
    unit: 'M2',
    quantity: 1,
    unit_price: 0,
  });

  const createEmptyProductLine = () => ({
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: '',
    brand: '',
    color: '',
    totalMeasure: 0,
    unitMeasure: 0,
    plateCount: 0,
    stoneFee: 0,
  });

  const createEmptyExternalService = () => ({
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    service: null,
    quantity: 1,
    unit: 'M2',
    unitPrice: 0,
    duration: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pData, cData, contractData] = await Promise.all([
        listProposals(),
        listCustomers(),
        listContracts(),
      ]);
      setProposals(pData);
      setCustomers(cData);
      setContracts(Array.isArray(contractData) ? contractData : []);
    } catch (e) {
      notifications.show({ title: 'Hata', message: 'Veriler yüklenemedi', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      value: String(c.id),
      label: `${c.customer_number ? `#${c.customer_number} - ` : ''}${c.name}`,
    })),
    [customers]
  );

  const nextProposalNo = useMemo(() => {
    const nums = (proposals || [])
      .map((p) => Number(p.proposal_number))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return 1;
    return Math.max(...nums) + 1;
  }, [proposals]);

  const calculateItemTotal = (item) => {
    const total = Number(item.total || 0);
    const qty = Number(item.quantity || 0);
    const price = Number(item.unit_price || 0);
    return total * qty * price;
  };

  const cartTotal = useMemo(
    () => lineItems.reduce((acc, item) => acc + calculateItemTotal(item), 0),
    [lineItems]
  );

  const formatCurrency = (value, currency) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return value;
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
  };

  const costCurrency = formCurrency || 'TRY';

  const calculateProductActual = (line) => toNumber(line.stoneFee) * toNumber(line.plateCount);
  const calculateProductVat = (line) => calculateProductActual(line) * VAT_MULTIPLIER;

  const productTotals = useMemo(
    () => productLines.reduce(
      (acc, line) => {
        const actual = calculateProductActual(line);
        acc.actual += actual;
        acc.vat += actual * VAT_MULTIPLIER;
        return acc;
      },
      { actual: 0, vat: 0 }
    ),
    [productLines]
  );

  const serviceCosts = useMemo(() => {
    const getInput = (id) => serviceInputs[id] || { total: 0, duration: 0 };

    const calcCost = (id, price, totalOverride = null) => {
      const input = getInput(id);
      const total = totalOverride !== null ? totalOverride : toNumber(input.total);
      const duration = toNumber(input.duration);
      return price * total * duration;
    };

    const laborActual = calcCost('atelier_labor', 3800);
    const overheadActual = calcCost('atelier_overhead', 6350, 1);
    const siteActual = calcCost('site_labor', 3800);
    const transportActual = calcCost('transport', 15);
    const sarfActual = (laborActual + overheadActual + siteActual + transportActual) * 0.05;

    const transportVat = transportActual * VAT_MULTIPLIER;
    const sarfVat = sarfActual * VAT_MULTIPLIER;

    const rows = {
      atelier_labor: { actual: laborActual, vat: laborActual, unitPrice: 3800 },
      atelier_overhead: { actual: overheadActual, vat: overheadActual, unitPrice: 6350 },
      site_labor: { actual: siteActual, vat: siteActual, unitPrice: 3800 },
      transport: { actual: transportActual, vat: transportVat, unitPrice: 15 },
      consumables: { actual: sarfActual, vat: sarfVat, unitPrice: sarfActual },
    };

    const baseActualTotal = laborActual + overheadActual + siteActual + transportActual;
    const baseVatTotal = laborActual + overheadActual + siteActual + transportVat;

    return {
      rows,
      baseActualTotal,
      baseVatTotal,
      sarfActual,
      sarfVat,
      actualTotal: baseActualTotal + sarfActual,
      vatTotal: baseVatTotal + sarfVat,
    };
  }, [serviceInputs]);

  const calculateExternalActual = (line) => {
    const qty = toNumber(line.quantity);
    const unitPrice = toNumber(line.unitPrice);
    const duration = toNumber(line.duration);
    const multiplier = duration > 0 ? duration : 1;
    return qty * unitPrice * multiplier;
  };

  const externalTotals = useMemo(
    () => externalServices.reduce(
      (acc, line) => {
        const actual = calculateExternalActual(line);
        acc.actual += actual;
        acc.vat += actual * VAT_MULTIPLIER;
        return acc;
      },
      { actual: 0, vat: 0 }
    ),
    [externalServices]
  );

  const summaryTotals = useMemo(() => {
    const generalCost = productTotals.actual
      + serviceCosts.baseActualTotal
      + serviceCosts.sarfActual
      + externalTotals.actual;
    const vatCost = productTotals.vat
      + serviceCosts.baseVatTotal
      + serviceCosts.sarfVat
      + externalTotals.vat;
    const profitFactor = toNumber(profitMultiplier);
    const profitTotal = generalCost * profitFactor;
    const finalTotal = profitTotal * VAT_MULTIPLIER;

    return {
      generalCost,
      vatCost,
      profitFactor,
      profitTotal,
      finalTotal,
    };
  }, [externalTotals, productTotals, profitMultiplier, serviceCosts]);

  const contractMap = useMemo(() => {
    const map = new Map();
    (contracts || []).forEach((contract) => {
      if (contract.proposal) {
        map.set(contract.proposal, contract);
      }
    });
    return map;
  }, [contracts]);

  const detailContract = detailProposal ? contractMap.get(detailProposal.id) : null;
  const detailContractStatusLabel = detailContract
    ? (CONTRACT_STATUS_LABELS[detailContract.status] || detailContract.status)
    : null;
  const detailContractStatusColor = detailContract
    ? (CONTRACT_STATUS_COLORS[detailContract.status] || 'gray')
    : 'gray';
  const detailDeliveryLabel = detailProposal
    ? (DELIVERY_OPTIONS.find((opt) => opt.value === detailProposal.delivery_type)?.label || null)
    : null;

  const openDetail = (proposal) => {
    setDetailProposal(proposal);
    setDetailModalOpen(true);
  };

  const closeDetail = () => {
    setDetailModalOpen(false);
    setDetailProposal(null);
  };

  const openCreate = () => {
    setFormCustomer(null);
    setFormDate(new Date());
    setFormCurrency('TRY');
    setFormNote('');
    setFormWorkSummary('');
    setFormStoneSummary('');
    setFormDelivery('FACTORY_DELIVERY');
    setLineItems([createEmptyItem()]);
    setProductLines([createEmptyProductLine()]);
    setServiceInputs(createServiceInputs());
    setExternalServices([createEmptyExternalService()]);
    setProfitMultiplier(1.6);
    setCostTab('products');
    setActiveTab('summary');
    setOpened(true);
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, createEmptyItem()]);
  };

  const updateLineItem = (tempId, patch) => {
    setLineItems((prev) => prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)));
  };

  const removeLineItem = (tempId) => {
    setLineItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const addProductLine = () => {
    setProductLines((prev) => [...prev, createEmptyProductLine()]);
  };

  const updateProductLine = (tempId, patch) => {
    setProductLines((prev) => prev.map((line) => (line.tempId === tempId ? { ...line, ...patch } : line)));
  };

  const removeProductLine = (tempId) => {
    setProductLines((prev) => prev.filter((line) => line.tempId !== tempId));
  };

  const updateServiceInput = (id, patch) => {
    setServiceInputs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { total: 0, duration: 0 }), ...patch },
    }));
  };

  const addExternalService = () => {
    setExternalServices((prev) => [...prev, createEmptyExternalService()]);
  };

  const updateExternalService = (tempId, patch) => {
    setExternalServices((prev) => prev.map((line) => (line.tempId === tempId ? { ...line, ...patch } : line)));
  };

  const updateExternalServiceName = (tempId, service) => {
    const unitPrice = service ? (EXTERNAL_SERVICE_PRICES[service] ?? 0) : 0;
    updateExternalService(tempId, { service, unitPrice });
  };

  const removeExternalService = (tempId) => {
    setExternalServices((prev) => prev.filter((line) => line.tempId !== tempId));
  };

  const handleSaveProposal = async () => {
    if (!formCustomer) return;
    if (!formDate) {
      notifications.show({ message: 'Geçerlilik tarihi seçin.', color: 'yellow' });
      return;
    }
    if (lineItems.length === 0) {
      notifications.show({ message: 'En az bir iş kalemi ekleyin.', color: 'yellow' });
      return;
    }
    const invalidItem = lineItems.find((item) => (
      !item.work.trim()
      || !item.stone.trim()
      || !item.unit
      || Number(item.total || 0) <= 0
      || Number(item.quantity || 0) <= 0
      || Number(item.unit_price || 0) <= 0
    ));
    if (invalidItem) {
      notifications.show({ message: 'Lütfen tüm kalemlerde gerekli alanları doldurun.', color: 'yellow' });
      return;
    }
    setSaving(true);
    try {
      const proposalData = {
        customer: Number(formCustomer),
        valid_until: formDate.toISOString().split('T')[0],
        currency: formCurrency,
        description: formNote,
        work_summary: formWorkSummary,
        stone_summary: formStoneSummary,
        delivery_type: formDelivery,
      };
      const newProposal = await createProposal(proposalData);

      const itemPromises = lineItems.map((item) => {
        return createProposalItem({
          proposal: newProposal.id,
          description: item.work,
          stone_type: item.stone,
          size_text: item.size,
          total_measure: Number(item.total || 0),
          total_unit: item.unit,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
        });
      });

      await Promise.all(itemPromises);

      notifications.show({ title: 'Başarılı', message: 'Teklif oluşturuldu.', color: 'green' });
      setOpened(false);
      await loadData();
      setFormCustomer(null);
      setLineItems([createEmptyItem()]);
      setProductLines([createEmptyProductLine()]);
      setServiceInputs(createServiceInputs());
      setExternalServices([createEmptyExternalService()]);
      setProfitMultiplier(1.6);
      setCostTab('products');
      setActiveTab('summary');
      setFormCurrency('TRY');
      setFormNote('');
      setFormWorkSummary('');
      setFormStoneSummary('');
      setFormDelivery('FACTORY_DELIVERY');
    } catch (e) {
      notifications.show({ title: 'Hata', message: 'Teklif kaydedilemedi.', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (id) => {
    setFinalizeTargetId(id);
    setPaymentMethod('CASH');
    setInstallmentCount(4);
    setFirstDueDate(new Date());
    setFinalizeModalOpen(true);
  };

  const confirmFinalize = async () => {
    if (!finalizeTargetId) return;
    try {
      const payload = {
        payment_method: paymentMethod,
      };
      if (paymentMethod === 'INSTALLMENT') {
        payload.installment_count = Number(installmentCount || 4);
        if (firstDueDate instanceof Date) {
          payload.first_due_date = firstDueDate.toISOString().split('T')[0];
        }
      }
      await finalizeProposal(finalizeTargetId, payload);
      notifications.show({ message: 'Sözleşme oluşturuldu!', color: 'green' });
      setFinalizeModalOpen(false);
      await loadData();
    } catch (e) {
      notifications.show({ message: e?.response?.data?.error || 'İşlem başarısız.', color: 'red' });
    }
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Teklif Yönetimi</Title>
        <Button onClick={openCreate} leftSection={<IconPlus size={18} />}>Yeni Teklif</Button>
      </Group>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <SimpleGrid cols={1}>
          {proposals.map((p) => {
            const contract = contractMap.get(p.id);
            const contractLabel = contract ? (CONTRACT_STATUS_LABELS[contract.status] || contract.status) : null;
            const deliveryLabel = DELIVERY_OPTIONS.find((opt) => opt.value === p.delivery_type)?.label;
            return (
              <Card key={p.id} withBorder shadow="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="lg" fw={600}>{p.customer_name}</Text>
                    <Text size="sm" c="dimmed">
                      {p.proposal_number} • {STATUS_LABELS[p.status] || p.status}
                    </Text>
                    {(p.work_summary || p.stone_summary || deliveryLabel) && (
                      <Text size="sm" c="dimmed">
                        {[p.work_summary, p.stone_summary, deliveryLabel].filter(Boolean).join(' • ')}
                      </Text>
                    )}
                    <Group gap="xs" mt="xs">
                      <Badge variant="light">{p.currency}</Badge>
                      {p.valid_until && <Badge variant="light" color="gray">{p.valid_until}</Badge>}
                      {contract && (
                        <Badge
                          variant="light"
                          color={CONTRACT_STATUS_COLORS[contract.status] || 'gray'}
                        >
                          Sözleşme: {contractLabel}
                        </Badge>
                      )}
                    </Group>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="xl" fw={700} c="blue">
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: p.currency }).format(p.total_amount || 0)}
                    </Text>
                    {p.status === 'DRAFT' && (
                      <Button
                        size="xs"
                        color="green"
                        mt="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleFinalize(p.id);
                        }}
                        leftSection={<IconCheck size={14} />}
                      >
                        Onayla & Sözleşme Yap
                      </Button>
                    )}
                  </div>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Yeni Teklif Oluştur"
        size="90%"
        padding="lg"
        radius="md"
        centered
      >
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v || 'summary')}>
          <Tabs.List mb="md">
            <Tabs.Tab value="summary">Özet</Tabs.Tab>
            <Tabs.Tab value="detail" disabled={!formCustomer}>Detay</Tabs.Tab>
            <Tabs.Tab value="cost" disabled={!formCustomer}>Maliyet</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="summary" pt="md">
            <SimpleGrid cols={2} spacing="lg" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
              <TextInput
                label="Teklif No"
                value={nextProposalNo ? String(nextProposalNo) : ''}
                readOnly
              />
              <Select
                label="Müşteri Seç"
                data={customerOptions}
                value={formCustomer}
                onChange={setFormCustomer}
                searchable
                required
              />
              <TextInput
                label="Yapılacak İş"
                value={formWorkSummary}
                onChange={(e) => setFormWorkSummary(e.target.value)}
              />
              <TextInput
                label="Taş Cinsi"
                value={formStoneSummary}
                onChange={(e) => setFormStoneSummary(e.target.value)}
              />
              <Select
                label="Teslimat"
                data={DELIVERY_OPTIONS}
                value={formDelivery}
                onChange={(v) => setFormDelivery(v || 'FACTORY_DELIVERY')}
              />
              <Select
                label="Para Birimi"
                data={['TRY', 'USD', 'EUR']}
                value={formCurrency}
                onChange={setFormCurrency}
              />
              <DateInput
                label="Geçerlilik Tarihi"
                value={formDate}
                onChange={setFormDate}
              />
            </SimpleGrid>
            <Textarea
              mt="lg"
              label="Notlar"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
            />
            <Group justify="flex-end" mt="xl">
              <Button onClick={() => setActiveTab('detail')} disabled={!formCustomer}>
                Detaya Geç
              </Button>
            </Group>
          </Tabs.Panel>

          <Tabs.Panel value="detail" pt="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>Teklif Kalemleri</Text>
              <Button variant="outline" onClick={addLineItem} leftSection={<IconPlus size={16} />}>
                Yeni Kalem
              </Button>
            </Group>

            <Table striped highlightOnHover withTableBorder verticalSpacing="md" horizontalSpacing="md">
              <thead>
                <tr>
                  <th>Yapılacak İş</th>
                  <th>Taş Cinsi</th>
                  <th>Ebat</th>
                  <th>Toplam</th>
                  <th>Birim</th>
                  <th>Miktar</th>
                  <th>Birim</th>
                  <th>Fiyat</th>
                  <th>Tutar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <Text size="sm" c="dimmed">Henüz kalem eklenmedi.</Text>
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item) => (
                    <tr key={item.tempId}>
                      <td>
                        <TextInput
                          value={item.work}
                          onChange={(e) => updateLineItem(item.tempId, { work: e.target.value })}
                          placeholder="Yapılacak iş"
                        />
                      </td>
                      <td>
                        <TextInput
                          value={item.stone}
                          onChange={(e) => updateLineItem(item.tempId, { stone: e.target.value })}
                          placeholder="Taş cinsi"
                        />
                      </td>
                      <td>
                        <TextInput
                          value={item.size}
                          onChange={(e) => updateLineItem(item.tempId, { size: e.target.value })}
                          placeholder="Ebat"
                        />
                      </td>
                      <td>
                        <NumberInput
                          value={item.total}
                          onChange={(v) => updateLineItem(item.tempId, { total: typeof v === 'number' ? v : 0 })}
                          min={0}
                          precision={2}
                        />
                      </td>
                      <td>
                        <Select
                          data={UNIT_OPTIONS}
                          value={item.unit}
                          onChange={(v) => updateLineItem(item.tempId, { unit: v || '' })}
                          placeholder="Birim"
                        />
                      </td>
                      <td>
                        <NumberInput
                          value={item.quantity}
                          onChange={(v) => updateLineItem(item.tempId, { quantity: typeof v === 'number' ? v : 0 })}
                          min={0}
                        />
                      </td>
                      <td>
                        <Text size="sm">Adet</Text>
                      </td>
                      <td>
                        <NumberInput
                          value={item.unit_price}
                          onChange={(v) => updateLineItem(item.tempId, { unit_price: typeof v === 'number' ? v : 0 })}
                          min={0}
                          precision={2}
                        />
                      </td>
                      <td>
                        <Text size="sm">
                          {formatCurrency(calculateItemTotal(item), formCurrency)}
                        </Text>
                      </td>
                      <td>
                        <ActionIcon color="red" onClick={() => removeLineItem(item.tempId)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>

            <Group justify="space-between" mt="xl">
              <Text size="lg" fw={700}>
                Toplam: {formatCurrency(cartTotal, formCurrency)}
              </Text>
              <Group>
                <Button variant="default" onClick={() => setActiveTab('summary')}>Geri</Button>
                <Button onClick={handleSaveProposal} loading={saving} disabled={lineItems.length === 0}>
                  Teklifi Kaydet
                </Button>
              </Group>
            </Group>
          </Tabs.Panel>

          <Tabs.Panel value="cost" pt="md">
            <Tabs value={costTab} onChange={(v) => setCostTab(v || 'products')}>
              <Tabs.List mb="md">
                <Tabs.Tab value="products">Ürün</Tabs.Tab>
                <Tabs.Tab value="services">Hizmet</Tabs.Tab>
                <Tabs.Tab value="external">Dış Hizmet</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="products" pt="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>Ürün Kalemleri</Text>
                  <Button variant="outline" onClick={addProductLine} leftSection={<IconPlus size={16} />}>
                    Ürün Ekle
                  </Button>
                </Group>

                <Table striped highlightOnHover withTableBorder verticalSpacing="md" horizontalSpacing="md">
                  <thead>
                    <tr>
                      <th>Kategori</th>
                      <th>Marka</th>
                      <th>Renk</th>
                      <th>Toplam Ölçü (m²)</th>
                      <th>Birim (m²)</th>
                      <th>Plaka Adet</th>
                      <th>Taş Ücreti</th>
                      <th>Gerçek Maliyet</th>
                      <th>KDV&apos;li</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productLines.length === 0 ? (
                      <tr>
                        <td colSpan={10}>
                          <Text size="sm" c="dimmed">Henüz ürün eklenmedi.</Text>
                        </td>
                      </tr>
                    ) : (
                      productLines.map((line) => {
                        const actual = calculateProductActual(line);
                        const vat = calculateProductVat(line);
                        return (
                          <tr key={line.tempId}>
                            <td>
                              <TextInput
                                value={line.category}
                                onChange={(e) => updateProductLine(line.tempId, { category: e.target.value })}
                                placeholder="Kategori"
                              />
                            </td>
                            <td>
                              <TextInput
                                value={line.brand}
                                onChange={(e) => updateProductLine(line.tempId, { brand: e.target.value })}
                                placeholder="Marka"
                              />
                            </td>
                            <td>
                              <TextInput
                                value={line.color}
                                onChange={(e) => updateProductLine(line.tempId, { color: e.target.value })}
                                placeholder="Renk"
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.totalMeasure}
                                onChange={(v) => updateProductLine(line.tempId, { totalMeasure: typeof v === 'number' ? v : 0 })}
                                min={0}
                                precision={2}
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.unitMeasure}
                                onChange={(v) => updateProductLine(line.tempId, { unitMeasure: typeof v === 'number' ? v : 0 })}
                                min={0}
                                precision={2}
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.plateCount}
                                onChange={(v) => updateProductLine(line.tempId, { plateCount: typeof v === 'number' ? v : 0 })}
                                min={0}
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.stoneFee}
                                onChange={(v) => updateProductLine(line.tempId, { stoneFee: typeof v === 'number' ? v : 0 })}
                                min={0}
                                precision={2}
                              />
                            </td>
                            <td>
                              <Text size="sm">{formatCurrency(actual, costCurrency)}</Text>
                            </td>
                            <td>
                              <Text size="sm">{formatCurrency(vat, costCurrency)}</Text>
                            </td>
                            <td>
                              <ActionIcon color="red" onClick={() => removeProductLine(line.tempId)}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>

                <Group justify="space-between" mt="md">
                  <Text size="sm" fw={600}>
                    Ürün Toplam Gerçek Maliyet: {formatCurrency(productTotals.actual, costCurrency)}
                  </Text>
                  <Text size="sm" fw={600}>
                    Ürün Toplam KDV&apos;li: {formatCurrency(productTotals.vat, costCurrency)}
                  </Text>
                </Group>
              </Tabs.Panel>

              <Tabs.Panel value="services" pt="md">
                <Text size="sm" fw={600} mb="xs">Hizmetler</Text>
                <Table striped highlightOnHover withTableBorder verticalSpacing="md" horizontalSpacing="md">
                  <thead>
                    <tr>
                      <th>Hizmet Adı</th>
                      <th>Toplam Ölçü</th>
                      <th>Birim</th>
                      <th>Süre</th>
                      <th>Süre Birimi</th>
                      <th>Alış Fiyatı</th>
                      <th>Gerçek Maliyet</th>
                      <th>KDV&apos;li</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SERVICE_DEFINITIONS.map((service) => {
                      const input = serviceInputs[service.id] || { total: 0, duration: 0 };
                      const totalValue = service.totalFixed ? service.totalValue : toNumber(input.total);
                      const durationValue = service.durationFixed ? 1 : toNumber(input.duration);
                      const row = serviceCosts.rows[service.id] || { actual: 0, vat: 0, unitPrice: service.price || 0 };
                      return (
                        <tr key={service.id}>
                          <td>
                            <Text size="sm">{service.name}</Text>
                          </td>
                          <td>
                            <NumberInput
                              value={totalValue}
                              onChange={(v) => updateServiceInput(service.id, { total: typeof v === 'number' ? v : 0 })}
                              min={0}
                              precision={2}
                              disabled={service.totalFixed}
                            />
                          </td>
                          <td>
                            <Text size="sm">{service.unit}</Text>
                          </td>
                          <td>
                            <NumberInput
                              value={durationValue}
                              onChange={(v) => updateServiceInput(service.id, { duration: typeof v === 'number' ? v : 0 })}
                              min={0}
                              precision={2}
                              disabled={service.durationFixed}
                            />
                          </td>
                          <td>
                            <Text size="sm">{service.timeUnit}</Text>
                          </td>
                          <td>
                            <Text size="sm">{formatCurrency(row.unitPrice, costCurrency)}</Text>
                          </td>
                          <td>
                            <Text size="sm">{formatCurrency(row.actual, costCurrency)}</Text>
                          </td>
                          <td>
                            <Text size="sm">{formatCurrency(row.vat, costCurrency)}</Text>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>

                <Group justify="space-between" mt="md">
                  <Text size="sm" fw={600}>
                    Hizmet Toplam Gerçek Maliyet: {formatCurrency(serviceCosts.actualTotal, costCurrency)}
                  </Text>
                  <Text size="sm" fw={600}>
                    Hizmet Toplam KDV&apos;li: {formatCurrency(serviceCosts.vatTotal, costCurrency)}
                  </Text>
                </Group>
              </Tabs.Panel>

              <Tabs.Panel value="external" pt="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>Dış Hizmetler</Text>
                  <Button variant="outline" onClick={addExternalService} leftSection={<IconPlus size={16} />}>
                    Dış Hizmet Ekle
                  </Button>
                </Group>

                <Table striped highlightOnHover withTableBorder verticalSpacing="md" horizontalSpacing="md">
                  <thead>
                    <tr>
                      <th>Hizmet Adı</th>
                      <th>Miktar</th>
                      <th>Birim</th>
                      <th>Birim Fiyat</th>
                      <th>Süre</th>
                      <th>Gerçek Maliyet</th>
                      <th>KDV&apos;li</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalServices.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <Text size="sm" c="dimmed">Henüz dış hizmet eklenmedi.</Text>
                        </td>
                      </tr>
                    ) : (
                      externalServices.map((line) => {
                        const actual = calculateExternalActual(line);
                        return (
                          <tr key={line.tempId}>
                            <td>
                              <Select
                                data={EXTERNAL_SERVICE_OPTIONS}
                                value={line.service}
                                onChange={(v) => updateExternalServiceName(line.tempId, v)}
                                placeholder="Seçin"
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.quantity}
                                onChange={(v) => updateExternalService(line.tempId, { quantity: typeof v === 'number' ? v : 0 })}
                                min={0}
                              />
                            </td>
                            <td>
                              <Select
                                data={EXTERNAL_UNIT_OPTIONS}
                                value={line.unit}
                                onChange={(v) => updateExternalService(line.tempId, { unit: v || 'M2' })}
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.unitPrice}
                                onChange={(v) => updateExternalService(line.tempId, { unitPrice: typeof v === 'number' ? v : 0 })}
                                min={0}
                                precision={2}
                              />
                            </td>
                            <td>
                              <NumberInput
                                value={line.duration}
                                onChange={(v) => updateExternalService(line.tempId, { duration: typeof v === 'number' ? v : 0 })}
                                min={0}
                                precision={2}
                              />
                            </td>
                            <td>
                              <Text size="sm">{formatCurrency(actual, costCurrency)}</Text>
                            </td>
                            <td>
                              <Text size="sm">{formatCurrency(actual * VAT_MULTIPLIER, costCurrency)}</Text>
                            </td>
                            <td>
                              <ActionIcon color="red" onClick={() => removeExternalService(line.tempId)}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>

                <Group justify="space-between" mt="md">
                  <Text size="sm" fw={600}>
                    Dış Hizmet Toplam Gerçek Maliyet: {formatCurrency(externalTotals.actual, costCurrency)}
                  </Text>
                  <Text size="sm" fw={600}>
                    Dış Hizmet Toplam KDV&apos;li: {formatCurrency(externalTotals.vat, costCurrency)}
                  </Text>
                </Group>
              </Tabs.Panel>
            </Tabs>

            <Card withBorder padding="md" radius="md" mt="lg">
              <Text size="sm" fw={600} mb="xs">Özet</Text>
              <SimpleGrid cols={2} spacing="xs" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
                <Text size="sm" c="dimmed">Genel Maliyet (KDV&apos;siz)</Text>
                <Text size="sm" fw={600}>{formatCurrency(summaryTotals.generalCost, costCurrency)}</Text>

                <Text size="sm" c="dimmed">KDV&apos;li Maliyet</Text>
                <Text size="sm" fw={600}>{formatCurrency(summaryTotals.vatCost, costCurrency)}</Text>

                <Text size="sm" c="dimmed">Kar Katsayısı</Text>
                <NumberInput
                  value={profitMultiplier}
                  onChange={(v) => setProfitMultiplier(typeof v === 'number' ? v : 1.6)}
                  min={0}
                  precision={2}
                />

                <Text size="sm" c="dimmed">Karlı Toplam (KDV&apos;siz)</Text>
                <Text size="sm" fw={600}>{formatCurrency(summaryTotals.profitTotal, costCurrency)}</Text>

                <Text size="sm" c="dimmed">KDV&apos;li Toplam (Nihai Satış)</Text>
                <Text size="sm" fw={600}>{formatCurrency(summaryTotals.finalTotal, costCurrency)}</Text>
              </SimpleGrid>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Modal>

      <Modal
        opened={finalizeModalOpen}
        onClose={() => setFinalizeModalOpen(false)}
        title="Teklifi Onayla"
        centered
      >
        <SimpleGrid cols={1}>
          <Select
            label="Ödeme Yöntemi"
            data={[
              { value: 'CASH', label: 'Peşin' },
              { value: 'INSTALLMENT', label: 'Vadeli (Taksit)' },
            ]}
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v || 'CASH')}
          />

          {paymentMethod === 'INSTALLMENT' && (
            <>
              <NumberInput
                label="Taksit Sayısı"
                min={1}
                value={installmentCount}
                onChange={(v) => setInstallmentCount(typeof v === 'number' ? v : 4)}
              />
              <DateInput
                label="İlk Vade Tarihi"
                value={firstDueDate}
                onChange={(v) => setFirstDueDate(v || new Date())}
              />
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={() => setFinalizeModalOpen(false)}>Vazgeç</Button>
            <Button color="green" onClick={confirmFinalize}>Onayla</Button>
          </Group>
        </SimpleGrid>
      </Modal>

      <Modal
        opened={detailModalOpen}
        onClose={closeDetail}
        title="Teklif Detayı"
        centered
        size="md"
      >
        {detailProposal && (
          <>
            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={600}>{detailProposal.customer_name}</Text>
                <Text size="sm" c="dimmed">
                  {detailProposal.proposal_number} • {STATUS_LABELS[detailProposal.status] || detailProposal.status}
                </Text>
              </div>
              <Badge variant="light">{detailProposal.currency}</Badge>
            </Group>

            <SimpleGrid cols={2} spacing="xs" mb="md">
              <Text size="sm" c="dimmed">Yapılacak İş</Text>
              <Text size="sm">{detailProposal.work_summary || '-'}</Text>
              <Text size="sm" c="dimmed">Taş Cinsi</Text>
              <Text size="sm">{detailProposal.stone_summary || '-'}</Text>
              <Text size="sm" c="dimmed">Teslimat</Text>
              <Text size="sm">{detailDeliveryLabel || '-'}</Text>
              <Text size="sm" c="dimmed">Geçerlilik</Text>
              <Text size="sm">{detailProposal.valid_until || '-'}</Text>
              <Text size="sm" c="dimmed">Ara Toplam</Text>
              <Text size="sm">{formatCurrency(detailProposal.subtotal_amount || detailProposal.total_amount, detailProposal.currency)}</Text>
              <Text size="sm" c="dimmed">KDV</Text>
              <Text size="sm">{formatCurrency(detailProposal.tax_amount || 0, detailProposal.currency)}</Text>
              <Text size="sm" c="dimmed">Genel Toplam</Text>
              <Text size="sm" fw={600}>{formatCurrency(detailProposal.grand_total || detailProposal.total_amount, detailProposal.currency)}</Text>
            </SimpleGrid>

            {detailProposal.notes && (
              <Card withBorder padding="sm" radius="md" mb="md">
                <Text size="sm" fw={600}>Notlar</Text>
                <Text size="sm" c="dimmed">{detailProposal.notes}</Text>
              </Card>
            )}

            <Card withBorder padding="sm" radius="md" mb="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>Sözleşme Süreci</Text>
                <Badge variant="light" color={detailContractStatusColor}>
                  {detailContractStatusLabel || 'Sözleşme yok'}
                </Badge>
              </Group>
              {detailContract ? (
                <>
                  <SimpleGrid cols={2} spacing="xs">
                    <Text size="sm" c="dimmed">Sözleşme No</Text>
                    <Text size="sm">{detailContract.contract_no || `#${detailContract.id}`}</Text>
                    <Text size="sm" c="dimmed">Proje</Text>
                    <Text size="sm">{detailContract.project_name || '-'}</Text>
                    <Text size="sm" c="dimmed">Tutar</Text>
                    <Text size="sm">{formatCurrency(detailContract.total_amount, detailContract.currency)}</Text>
                  </SimpleGrid>
                  <Group gap="xs" mt="sm">
                    {detailProposal.customer && (
                      <Button size="xs" variant="light" onClick={() => navigate(`/customers/${detailProposal.customer}`)}>
                        Müşteri
                      </Button>
                    )}
                    <Button size="xs" variant="light" onClick={() => navigate('/finance')}>
                      Kasa/Finans
                    </Button>
                    {detailContract.contract_file_url && (
                      <Button
                        size="xs"
                        variant="light"
                        color="green"
                        component="a"
                        href={detailContract.contract_file_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        İmzalı
                      </Button>
                    )}
                  </Group>
                </>
              ) : (
                <Text size="sm" c="dimmed">Bu teklif için henüz sözleşme oluşturulmadı.</Text>
              )}
            </Card>

            <Text size="sm" fw={600} mb="xs">Teklif Kalemleri</Text>
            <Table striped highlightOnHover>
              <thead>
                <tr>
                  <th>Yapılacak İş</th>
                  <th>Taş Cinsi</th>
                  <th>Ebat</th>
                  <th>Toplam</th>
                  <th>Miktar</th>
                  <th>Fiyat</th>
                  <th>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {(detailProposal.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.description || '-'}</td>
                    <td>{item.stone_type || '-'}</td>
                    <td>{item.size_text || '-'}</td>
                    <td>
                      {item.total_measure ?? '-'} {item.total_unit
                        ? UNIT_OPTIONS.find((opt) => opt.value === item.total_unit)?.label || item.total_unit
                        : ''}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unit_price, detailProposal.currency)}</td>
                    <td>{formatCurrency(item.total_price, detailProposal.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Modal>
    </Container>
  );
}
