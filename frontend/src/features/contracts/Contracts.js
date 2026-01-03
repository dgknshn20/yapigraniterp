import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconBuildingBank, IconUsers } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { listContracts, updateContract } from './contractService';
import financeService from '../finance/financeService';
import { useSelector } from 'react-redux';

const STATUS_LABELS = {
  IMZA_BEKLIYOR: 'İmza Bekliyor',
  IMZALANDI: 'Onaylandı',
  ACTIVE: 'Aktif',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};

const STATUS_COLORS = {
  IMZA_BEKLIYOR: 'orange',
  IMZALANDI: 'blue',
  ACTIVE: 'teal',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'IMZA_BEKLIYOR', label: 'İmza Bekliyor' },
  { value: 'IMZALANDI', label: 'Onaylandı' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'COMPLETED', label: 'Tamamlandı' },
  { value: 'CANCELLED', label: 'İptal' },
];
const EDIT_STATUS_OPTIONS = STATUS_OPTIONS.filter((item) => item.value);

const formatCurrency = (value, currency) => {
  if (value === null || value === undefined) return '-';
  if (!currency) return '-';
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
};

export default function Contracts() {
  const navigate = useNavigate();
  const role = useSelector((state) => state.auth.user?.role);
  const canSeeFinancials = role ? role !== 'PRODUCTION' : false;
  const canSeeCustomers = ['ADMIN', 'SALES'].includes(role);
  const canSeeFinance = ['ADMIN', 'FINANCE'].includes(role);
  const canEditStatus = ['ADMIN', 'SALES'].includes(role);
  const canSyncCash = ['ADMIN', 'FINANCE'].includes(role);
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [activeContract, setActiveContract] = useState(null);
  const [statusValue, setStatusValue] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [syncCash, setSyncCash] = useState(false);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [cashAccountsLoading, setCashAccountsLoading] = useState(false);
  const [cashAccountId, setCashAccountId] = useState('');
  const [cashAmount, setCashAmount] = useState(0);
  const [cashDate, setCashDate] = useState(new Date());
  const [cashDescription, setCashDescription] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await listContracts();
        if (mounted) setContracts(Array.isArray(data) ? data : []);
      } catch (e) {
        notifications.show({
          title: 'Hata',
          message: e?.response?.data?.detail || e.message || 'Sözleşmeler yüklenemedi',
          color: 'red',
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contracts || []).filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!term) return true;
      const hay = [
        c.contract_no,
        c.project_name,
        c.customer_name,
        c.proposal_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [contracts, search, statusFilter]);

  const cashAccountOptions = useMemo(() => {
    const currency = activeContract?.currency;
    return (cashAccounts || [])
      .filter((acc) => ['CASH', 'BANK', 'POS'].includes(acc.account_type))
      .filter((acc) => !currency || acc.currency === currency)
      .map((acc) => ({ value: String(acc.id), label: `${acc.name} (${acc.currency})` }));
  }, [cashAccounts, activeContract]);

  useEffect(() => {
    if (!statusModalOpen || !canSyncCash || cashAccounts.length > 0) return;
    let mounted = true;
    const loadAccounts = async () => {
      try {
        setCashAccountsLoading(true);
        const data = await financeService.getAccounts();
        if (mounted) setCashAccounts(Array.isArray(data) ? data : []);
      } catch (e) {
        notifications.show({
          title: 'Kasa hesapları alınamadı',
          message: e?.response?.data?.detail || e.message || 'Bilinmeyen hata',
          color: 'red',
        });
      } finally {
        if (mounted) setCashAccountsLoading(false);
      }
    };
    loadAccounts();
    return () => {
      mounted = false;
    };
  }, [statusModalOpen, canSyncCash, cashAccounts.length]);

  useEffect(() => {
    if (!syncCash || cashAccountId || cashAccountOptions.length === 0) return;
    setCashAccountId(cashAccountOptions[0].value);
  }, [syncCash, cashAccountId, cashAccountOptions]);

  const openStatusModal = (contract) => {
    setActiveContract(contract);
    setStatusValue(contract?.status || '');
    setStatusModalOpen(true);
    setSyncCash(false);
    setCashAccountId('');
    setCashAmount(Number(contract?.total_amount || 0));
    setCashDate(new Date());
    setCashDescription(`Sözleşme tahsilatı: ${contract?.contract_no || `#${contract?.id}`}`);
  };

  const closeStatusModal = () => {
    setStatusModalOpen(false);
    setActiveContract(null);
  };

  const handleStatusSave = async () => {
    if (!activeContract || !statusValue) return;
    if (!canEditStatus) return;
    if (statusValue === activeContract.status) {
      setStatusModalOpen(false);
      return;
    }
    try {
      setStatusSaving(true);
      const previousStatus = activeContract.status;
      const updated = await updateContract(activeContract.id, { status: statusValue });

      if (syncCash) {
        if (!canSyncCash) {
          throw new Error('Kasa işlemi için yetkiniz yok.');
        }
        const amount = Number(cashAmount || 0);
        const targetAccount = Number(cashAccountId);
        if (!targetAccount) {
          throw new Error('Kasa hesabı seçin.');
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Tutar 0’dan büyük olmalı.');
        }
        const dateValue = cashDate instanceof Date ? cashDate : new Date();
        const description = (cashDescription || '').trim()
          || `Sözleşme tahsilatı: ${updated.contract_no || `#${updated.id}`}`;
        try {
          await financeService.createTransaction({
            transaction_type: 'INCOME',
            amount,
            description,
            date: dateValue.toISOString().split('T')[0],
            target_account: targetAccount,
            related_customer: updated.customer_id || null,
            related_contract: updated.id,
          });
        } catch (cashError) {
          try {
            await updateContract(activeContract.id, { status: previousStatus });
          } catch {
            notifications.show({
              title: 'Uyarı',
              message: 'Kasa işlemi başarısız oldu ve durum geri alınamadı. Lütfen kontrol edin.',
              color: 'yellow',
            });
          }
          throw cashError;
        }
      }

      setContracts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      notifications.show({
        title: syncCash ? 'Durum ve kasa güncellendi' : 'Durum güncellendi',
        color: 'green',
      });
      setStatusModalOpen(false);
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: e?.response?.data?.detail || e?.response?.data?.error || e.message || 'Durum güncellenemedi',
        color: 'red',
      });
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Sözleşmeler</Title>
        <Group gap="sm">
          <TextInput
            placeholder="Sözleşme no, müşteri, teklif no..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Select
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v || '')}
            placeholder="Durum"
            w={180}
          />
        </Group>
      </Group>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>Sözleşme</th>
              <th>Müşteri</th>
              <th>Teklif</th>
              <th>Durum</th>
              <th>Tutar</th>
              <th>Dosya</th>
              <th>Bağlantılar</th>
            </tr>
          </thead>
          <tbody>
            {filteredContracts.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Text size="sm" c="dimmed">Sözleşme bulunamadı.</Text>
                </td>
              </tr>
            ) : (
              filteredContracts.map((c) => (
                <tr key={c.id} onClick={() => openStatusModal(c)} style={{ cursor: 'pointer' }}>
                  <td>
                    <Text fw={600}>{c.contract_no || `#${c.id}`}</Text>
                    {c.project_name && (
                      <Text size="xs" c="dimmed">{c.project_name}</Text>
                    )}
                  </td>
                  <td>
                    <Text>{c.customer_name || '-'}</Text>
                    {c.customer_id && canSeeCustomers && (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/customers/${c.customer_id}`);
                        }}
                      >
                        Müşteri Detayı
                      </Button>
                    )}
                  </td>
                  <td>{c.proposal_number || '-'}</td>
                  <td>
                    <Badge color={STATUS_COLORS[c.status] || 'gray'} variant="light">
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </td>
                  <td>{canSeeFinancials ? formatCurrency(c.total_amount, c.currency) : 'Gizli'}</td>
                  <td>
                    <Group gap="xs">
                      {canSeeFinancials && c.contract_file_url && (
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          component="a"
                          href={c.contract_file_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          İmzalı
                        </Button>
                      )}
                    </Group>
                  </td>
                  <td>
                    <Group gap="xs">
                      <Tooltip label="Finans">
                        <ActionIcon
                          variant="light"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (canSeeFinance) navigate('/finance');
                          }}
                          disabled={!canSeeFinance}
                        >
                          <IconBuildingBank size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Müşteri">
                        <ActionIcon
                          variant="light"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (c.customer_id && canSeeCustomers) navigate(`/customers/${c.customer_id}`);
                          }}
                          disabled={!c.customer_id || !canSeeCustomers}
                        >
                          <IconUsers size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}

      <Modal
        opened={statusModalOpen}
        onClose={closeStatusModal}
        title="Sözleşme Durumu"
        centered
      >
        {activeContract && (
          <>
            <Text fw={600}>{activeContract.contract_no || `#${activeContract.id}`}</Text>
            <Text size="sm" c="dimmed" mb="md">
              {activeContract.customer_name || '-'}
            </Text>
            <Select
              label="Yeni Durum"
              data={EDIT_STATUS_OPTIONS}
              value={statusValue}
              onChange={(v) => setStatusValue(v || '')}
              disabled={!canEditStatus}
            />
            <Checkbox
              mt="md"
              label="Kasaya işlem oluştur (tahsilat)"
              checked={syncCash}
              onChange={(e) => setSyncCash(e.currentTarget.checked)}
              disabled={!canSyncCash}
            />
            {!canSyncCash && (
              <Text size="xs" c="dimmed" mt="xs">
                Kasa işlemi için finans yetkisi gerekir.
              </Text>
            )}
            {syncCash && (
              <>
                <Select
                  mt="md"
                  label="Kasa / Banka Hesabı"
                  data={cashAccountOptions}
                  value={cashAccountId}
                  onChange={(v) => setCashAccountId(v || '')}
                  disabled={!canSyncCash || cashAccountsLoading}
                  placeholder={cashAccountsLoading ? 'Yükleniyor...' : 'Hesap seçin'}
                />
                <Group grow mt="md">
                  <NumberInput
                    label="Tutar"
                    value={cashAmount}
                    onChange={(v) => setCashAmount(typeof v === 'number' ? v : 0)}
                    min={0}
                    precision={2}
                    disabled={!canSyncCash}
                  />
                  <DateInput
                    label="Tarih"
                    value={cashDate}
                    onChange={(v) => setCashDate(v || new Date())}
                    disabled={!canSyncCash}
                  />
                </Group>
                <TextInput
                  mt="md"
                  label="Açıklama"
                  value={cashDescription}
                  onChange={(e) => setCashDescription(e.currentTarget.value)}
                  disabled={!canSyncCash}
                />
              </>
            )}
            {!canEditStatus && (
              <Text size="xs" c="dimmed" mt="xs">
                Bu işlem için yetkiniz yok.
              </Text>
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeStatusModal}>Vazgeç</Button>
              <Button
                onClick={handleStatusSave}
                loading={statusSaving}
                disabled={
                  !canEditStatus
                  || !statusValue
                  || statusValue === activeContract.status
                  || (syncCash && (!canSyncCash || !cashAccountId || Number(cashAmount || 0) <= 0))
                }
              >
                Kaydet
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </Container>
  );
}
