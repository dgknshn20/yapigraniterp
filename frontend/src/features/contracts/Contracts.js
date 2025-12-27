import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Select,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBuildingBank, IconUsers } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { listContracts } from './contractService';
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
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
                <tr key={c.id}>
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
                        onClick={() => navigate(`/customers/${c.customer_id}`)}
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
                          onClick={() => canSeeFinance && navigate('/finance')}
                          disabled={!canSeeFinance}
                        >
                          <IconBuildingBank size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Müşteri">
                        <ActionIcon
                          variant="light"
                          onClick={() => c.customer_id && canSeeCustomers && navigate(`/customers/${c.customer_id}`)}
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
    </Container>
  );
}
