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
  Stepper,
  Table,
  Text,
  Title,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconCheck } from '@tabler/icons-react';

import { listProposals, createProposal, createProposalItem, finalizeProposal } from './proposalService';
import { listCustomers } from '../customers/customerService';
import { listProducts } from '../inventory/slabService';
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

export default function Proposals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [opened, setOpened] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [formCustomer, setFormCustomer] = useState(null);
  const [formDate, setFormDate] = useState(new Date());
  const [formCurrency, setFormCurrency] = useState('TRY');
  const [formNote, setFormNote] = useState('');

  const [cartItems, setCartItems] = useState([]);

  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [finalizeTargetId, setFinalizeTargetId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [installmentCount, setInstallmentCount] = useState(4);
  const [firstDueDate, setFirstDueDate] = useState(new Date());

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailProposal, setDetailProposal] = useState(null);

  const emptyItem = { product: '', width: 0, length: 0, quantity: 1, unit_price: 0, fire_rate: 10, labor_cost: 0 };
  const [currentItem, setCurrentItem] = useState(emptyItem);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pData, cData, prodData, contractData] = await Promise.all([
        listProposals(),
        listCustomers(),
        listProducts(),
        listContracts(),
      ]);
      setProposals(pData);
      setCustomers(cData);
      setProducts(prodData);
      setContracts(Array.isArray(contractData) ? contractData : []);
    } catch (e) {
      notifications.show({ title: 'Hata', message: 'Veriler yüklenemedi', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const customerOptions = useMemo(() => customers.map((c) => ({ value: String(c.id), label: c.name })), [customers]);
  const productOptions = useMemo(() => products.map((p) => ({ value: String(p.id), label: p.name })), [products]);

  const calculateItemTotal = (item) => {
    const area = (item.width * item.length * item.quantity) / 10000;
    const wasteMult = 1 + (item.fire_rate / 100);
    const matCost = area * item.unit_price * wasteMult;
    return matCost + item.labor_cost;
  };

  const cartTotal = useMemo(() => cartItems.reduce((acc, item) => acc + calculateItemTotal(item), 0), [cartItems]);

  const formatCurrency = (value, currency) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return value;
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
  };

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

  const openDetail = (proposal) => {
    setDetailProposal(proposal);
    setDetailModalOpen(true);
  };

  const closeDetail = () => {
    setDetailModalOpen(false);
    setDetailProposal(null);
  };

  const addItemToCart = () => {
    if (!currentItem.product || currentItem.width <= 0 || currentItem.length <= 0) {
      notifications.show({ message: 'Lütfen geçerli ölçü ve ürün seçin.', color: 'yellow' });
      return;
    }
    const prodName = products.find((p) => String(p.id) === currentItem.product)?.name;
    setCartItems([...cartItems, { ...currentItem, tempId: Date.now(), productName: prodName }]);
    setCurrentItem(emptyItem);
  };

  const removeItemFromCart = (tempId) => {
    setCartItems(cartItems.filter((i) => i.tempId !== tempId));
  };

  const handleSaveProposal = async () => {
    if (!formCustomer) return;
    if (!formDate) {
      notifications.show({ message: 'Geçerlilik tarihi seçin.', color: 'yellow' });
      return;
    }
    setSaving(true);
    try {
      const proposalData = {
        customer: Number(formCustomer),
        valid_until: formDate.toISOString().split('T')[0],
        currency: formCurrency,
        description: formNote,
      };
      const newProposal = await createProposal(proposalData);

      const itemPromises = cartItems.map((item) => {
        return createProposalItem({
          proposal: newProposal.id,
          product: Number(item.product),
          width: item.width,
          length: item.length,
          quantity: item.quantity,
          unit_price: item.unit_price,
          fire_rate: item.fire_rate,
          labor_cost: item.labor_cost,
          description: 'Standart Üretim',
        });
      });

      await Promise.all(itemPromises);

      notifications.show({ title: 'Başarılı', message: 'Teklif oluşturuldu.', color: 'green' });
      setOpened(false);
      await loadData();
      setFormCustomer(null);
      setCartItems([]);
      setActiveStep(0);
      setFormCurrency('TRY');
      setFormNote('');
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
        <Button onClick={() => setOpened(true)} leftSection={<IconPlus size={18} />}>Yeni Teklif</Button>
      </Group>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <SimpleGrid cols={1}>
          {proposals.map((p) => {
            const contract = contractMap.get(p.id);
            const contractLabel = contract ? (CONTRACT_STATUS_LABELS[contract.status] || contract.status) : null;
            return (
              <Card key={p.id} withBorder shadow="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="lg" fw={600}>{p.customer_name}</Text>
                    <Text size="sm" c="dimmed">
                      {p.proposal_number} • {STATUS_LABELS[p.status] || p.status}
                    </Text>
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

      <Modal opened={opened} onClose={() => setOpened(false)} title="Yeni Teklif Oluştur" size="lg" centered>
        <Stepper active={activeStep} onStepClick={setActiveStep}>
          <Stepper.Step label="Müşteri & Genel" description="Kime teklif veriyoruz?">
            <SimpleGrid cols={1} mt="md">
              <Select
                label="Müşteri Seç"
                data={customerOptions}
                value={formCustomer}
                onChange={setFormCustomer}
                searchable
                required
              />
              <Group grow>
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
              </Group>
              <Textarea
                label="Notlar"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
              />
            </SimpleGrid>
            <Group justify="flex-end" mt="xl">
              <Button onClick={() => setActiveStep(1)} disabled={!formCustomer}>İleri</Button>
            </Group>
          </Stepper.Step>

          <Stepper.Step label="Ürünler" description="Taş ve ölçü girişi">
            <Card withBorder p="sm" mt="sm" radius="md">
              <Text size="sm" fw={600} mb="xs">Yeni Kalem Ekle</Text>
              <SimpleGrid cols={2} breakpoints={[{ maxWidth: 'sm', cols: 1 }]}> 
                <Select
                  label="Taş cinsi"
                  placeholder="Taş Seçiniz"
                  data={productOptions}
                  searchable
                  value={currentItem.product}
                  onChange={(v) => setCurrentItem({ ...currentItem, product: v })}
                />
                <Group grow>
                  <NumberInput
                    label="En (cm)"
                    placeholder="0"
                    value={currentItem.width}
                    onChange={(v) => setCurrentItem({ ...currentItem, width: Number(v) })}
                    min={0}
                    precision={2}
                  />
                  <NumberInput
                    label="Boy (cm)"
                    placeholder="0"
                    value={currentItem.length}
                    onChange={(v) => setCurrentItem({ ...currentItem, length: Number(v) })}
                    min={0}
                    precision={2}
                  />
                </Group>
                <Group grow>
                  <NumberInput
                    label="Adet"
                    placeholder="1"
                    value={currentItem.quantity}
                    onChange={(v) => setCurrentItem({ ...currentItem, quantity: Number(v) })}
                    min={1}
                  />
                  <NumberInput
                    label="Birim Fiyat (₺)"
                    placeholder="0"
                    value={currentItem.unit_price}
                    onChange={(v) => setCurrentItem({ ...currentItem, unit_price: Number(v) })}
                    min={0}
                    precision={2}
                  />
                </Group>
                <Group grow>
                  <NumberInput
                    label="Fire (%)"
                    placeholder="0"
                    value={currentItem.fire_rate}
                    onChange={(v) => setCurrentItem({ ...currentItem, fire_rate: Number(v) })}
                    min={0}
                    max={100}
                  />
                  <NumberInput
                    label="İşçilik (₺)"
                    placeholder="0"
                    value={currentItem.labor_cost}
                    onChange={(v) => setCurrentItem({ ...currentItem, labor_cost: Number(v) })}
                    min={0}
                    precision={2}
                  />
                </Group>
              </SimpleGrid>
              <Button fullWidth mt="sm" variant="outline" onClick={addItemToCart}>Listeye Ekle</Button>
            </Card>

            <Table mt="md" striped highlightOnHover>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Ölçü</th>
                  <th>Adet</th>
                  <th>Tutar (Tahmini)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cartItems.map((item) => (
                  <tr key={item.tempId}>
                    <td>{item.productName}</td>
                    <td>{item.width}x{item.length}</td>
                    <td>{item.quantity}</td>
                    <td>{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: formCurrency }).format(calculateItemTotal(item))}</td>
                    <td>
                      <ActionIcon color="red" onClick={() => removeItemFromCart(item.tempId)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <Group justify="space-between" mt="xl">
              <Text size="lg" fw={700}>
                Toplam: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: formCurrency }).format(cartTotal)}
              </Text>
              <Group>
                <Button variant="default" onClick={() => setActiveStep(0)}>Geri</Button>
                <Button onClick={handleSaveProposal} loading={saving} disabled={cartItems.length === 0}>Teklifi Kaydet</Button>
              </Group>
            </Group>
          </Stepper.Step>

          <Stepper.Step label="Tamamlandı" description="Özet" />
        </Stepper>
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
                  <th>Ürün</th>
                  <th>Ölçü</th>
                  <th>Adet</th>
                  <th>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {(detailProposal.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name || item.description || '-'}</td>
                    <td>{item.width}x{item.length}</td>
                    <td>{item.quantity}</td>
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
