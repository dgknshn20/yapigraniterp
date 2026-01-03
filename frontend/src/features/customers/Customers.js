import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEye, IconFilter, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

import { createCustomer, deleteCustomer, getCustomerDetail, listCustomers, updateCustomer } from './customerService';
import CustomerDetailDrawer from './CustomerDetailDrawer';

const CUSTOMER_TYPES = [
  { value: 'INDIVIDUAL', label: 'Bireysel' },
  { value: 'COMPANY', label: 'Kurumsal' },
];

const STATUS_OPTIONS = [
  { value: 'LEAD', label: 'Potansiyel / Ön Kayıt' },
  { value: 'NEGOTIATION', label: 'Görüşülüyor' },
  { value: 'ACTIVE', label: 'Aktif / Çalışılıyor' },
  { value: 'PAYMENT_DUE', label: 'Ödeme Bekleniyor' },
  { value: 'PASSIVE', label: 'Pasif' },
  { value: 'BLACKLIST', label: 'İptal / Kara Liste' },
];

const STATUS_COLOR_OPTIONS = [
  { value: 'BLACK', label: 'Siyah' },
  { value: 'RED', label: 'Kırmızı' },
  { value: 'YELLOW', label: 'Sarı' },
  { value: 'GREEN', label: 'Yeşil' },
];

const STATUS_COLOR_LABELS = STATUS_COLOR_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const SEGMENT_OPTIONS = [
  { value: 'STANDARD', label: 'Standart' },
  { value: 'VIP', label: 'VIP' },
  { value: 'RISKY', label: 'Riskli' },
];

const STATUS_COLOR_MAP = {
  BLACK: 'dark',
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
};

const getStatusColor = (statusColor) => {
  const map = {
    ...STATUS_COLOR_MAP,
  };
  return map[statusColor] || 'gray';
};

export default function Customers() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState('');
  const [statusColorFilter, setStatusColorFilter] = useState('');

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(null);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState({ loading: false, contractsCount: 0 });

  const [form, setForm] = useState({
    customer_type: 'INDIVIDUAL',
    status: 'LEAD',
    status_color: 'GREEN',
    segment: 'STANDARD',
    name: '',
    phone: '',
    email: '',
    tax_number: '',
    tax_office: '',
    address: '',
    location_url: '',
    internal_notes: '',
  });

  const filteredCustomers = useMemo(() => {
    return (customers || []).filter((c) => {
      const name = (c.name || '').toLowerCase();
      const phone = String(c.phone || '');
      const number = String(c.customer_number || '');
      const term = search.toLowerCase();
      const matchSearch = name.includes(term) || phone.includes(search) || number.includes(search);
      const matchStatus = statusColorFilter ? c.status_color === statusColorFilter : true;
      return matchSearch && matchStatus;
    });
  }, [customers, search, statusColorFilter]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setCustomers(await listCustomers());
    } catch (e) {
      notifications.show({ title: 'Hata', message: 'Müşteriler yüklenemedi', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      customer_type: 'INDIVIDUAL',
      status: 'LEAD',
      status_color: 'GREEN',
      segment: 'STANDARD',
      name: '',
      phone: '',
      email: '',
      tax_number: '',
      tax_office: '',
      address: '',
      location_url: '',
      internal_notes: '',
      status_color: 'GREEN',
    });
    setOpened(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      customer_type: c.customer_type || 'INDIVIDUAL',
      status: c.status || 'LEAD',
      status_color: c.status_color || 'GREEN',
      segment: c.segment || 'STANDARD',
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      tax_number: c.tax_number || '',
      tax_office: c.tax_office || '',
      address: c.address || '',
      location_url: c.location_url || '',
      internal_notes: c.internal_notes || '',
      status_color: c.status_color || 'GREEN',
    });
    setOpened(true);
  };

  const openDrawer = (customerId) => {
    setSelectedCustomerId(customerId);
    setDrawerOpened(true);
  };

  const closeDrawer = () => {
    setDrawerOpened(false);
    setSelectedCustomerId(null);
  };

  const openDelete = async (customer) => {
    setDeleteTarget(customer);
    setDeleteModalOpen(true);
    setDeleteCheck({ loading: true, contractsCount: 0 });
    try {
      const detail = await getCustomerDetail(customer.id);
      const contractsCount = Array.isArray(detail?.contracts) ? detail.contracts.length : 0;
      setDeleteCheck({ loading: false, contractsCount });
    } catch (e) {
      setDeleteCheck({ loading: false, contractsCount: 0 });
      notifications.show({
        title: 'Uyarı',
        message: 'Sözleşme kontrolü yapılamadı.',
        color: 'yellow',
      });
    }
  };

  const closeDelete = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteCheck({ loading: false, contractsCount: 0 });
  };

  const getErrorMessage = (data) => {
    if (!data) return 'Kaydedilemedi';
    if (typeof data === 'string') return data;
    if (data.phone) return data.phone;
    if (data.tax_number) return data.tax_number;
    const firstKey = Object.keys(data)[0];
    const value = firstKey ? data[firstKey] : null;
    if (Array.isArray(value)) return value.join(' ');
    if (value) return String(value);
    return 'Kaydedilemedi';
  };

  const save = async () => {
    if (!form.name || !form.phone) {
      notifications.show({ message: 'Ad ve telefon zorunlu.', color: 'yellow' });
      return;
    }

    try {
      setSaving(true);
      if (editing) {
        await updateCustomer(editing.id, form);
        notifications.show({ message: 'Müşteri güncellendi', color: 'green' });
      } else {
        await createCustomer(form);
        notifications.show({ message: 'Müşteri oluşturuldu', color: 'green' });
      }
      setOpened(false);
      await load();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: getErrorMessage(e?.response?.data),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteCustomer(deleteTarget.id);
      notifications.show({ message: 'Müşteri silindi', color: 'green' });
      closeDelete();
      await load();
    } catch (e) {
      notifications.show({
        title: 'Hata',
        message: getErrorMessage(e?.response?.data),
        color: 'red',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Müşteriler</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>Yeni Müşteri</Button>
      </Group>

      <Card withBorder mb="md" p="sm" radius="md">
        <Group>
          <TextInput
            placeholder="İsim veya Telefon Ara..."
            leftSection={<IconFilter size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Statü Filtrele"
            data={[{ value: '', label: 'Tümü' }, ...STATUS_COLOR_OPTIONS]}
            value={statusColorFilter}
            onChange={(value) => setStatusColorFilter(value || '')}
            style={{ width: 220 }}
          />
        </Group>
      </Card>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>No</Table.Th>
              <Table.Th>Ad / Firma</Table.Th>
              <Table.Th>Telefon</Table.Th>
              <Table.Th>Bakiye</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredCustomers.map((c) => (
              <Table.Tr key={c.id} onClick={() => openDrawer(c.id)} style={{ cursor: 'pointer' }}>
                <Table.Td>{c.customer_number || '-'}</Table.Td>
                <Table.Td fw={500}>{c.name}</Table.Td>
                <Table.Td>{c.phone}</Table.Td>
                <Table.Td>0.00 ₺</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Group gap="xs" justify="flex-end">
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDrawer(c.id);
                      }}
                    >
                      <IconEye size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(c);
                      }}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDelete(c);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={deleteModalOpen}
        onClose={closeDelete}
        title="Müşteri Sil"
        centered
      >
        <Textarea
          readOnly
          label="Silinecek müşteri"
          value={deleteTarget ? `${deleteTarget.name} (${deleteTarget.phone || '-'})` : ''}
        />
        {deleteCheck.loading ? (
          <Text size="sm" c="dimmed" mt="sm">Sözleşme kontrolü yapılıyor...</Text>
        ) : deleteCheck.contractsCount > 0 ? (
          <Text size="sm" c="red" mt="sm">
            Bu müşteriye bağlı {deleteCheck.contractsCount} sözleşme var. Silme işlemi engellenebilir.
          </Text>
        ) : (
          <Text size="sm" c="dimmed" mt="sm">Bağlı sözleşme bulunmadı.</Text>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeDelete}>Vazgeç</Button>
          <Button color="red" onClick={handleDelete} loading={deleting}>
            Sil
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? 'Müşteri Düzenle' : 'Yeni Müşteri'}
        centered
        size="lg"
      >
        <SimpleGrid cols={2}>
          <TextInput
            label="Ad / Firma"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <Select
            label="Durum"
            data={STATUS_OPTIONS}
            value={form.status}
            onChange={(value) => setForm((p) => ({ ...p, status: value }))}
          />
          <Select
            label="Statü"
            data={STATUS_COLOR_OPTIONS}
            value={form.status_color}
            onChange={(value) => setForm((p) => ({ ...p, status_color: value || 'GREEN' }))}
          />
          <Select
            label="Müşteri Tipi"
            data={CUSTOMER_TYPES}
            value={form.customer_type}
            onChange={(value) => setForm((p) => ({ ...p, customer_type: value }))}
          />
          <Select
            label="Segment"
            data={SEGMENT_OPTIONS}
            value={form.segment}
            onChange={(value) => setForm((p) => ({ ...p, segment: value }))}
          />
          <TextInput
            label="Telefon"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            required
          />
          <TextInput
            label="E-posta"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          <TextInput
            label="Vergi/TC No"
            value={form.tax_number}
            onChange={(e) => setForm((p) => ({ ...p, tax_number: e.target.value }))}
          />
          <TextInput
            label="Vergi Dairesi"
            value={form.tax_office}
            onChange={(e) => setForm((p) => ({ ...p, tax_office: e.target.value }))}
          />
        </SimpleGrid>
        <Textarea
          mt="md"
          label="Adres"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
        />
        <TextInput
          mt="md"
          label="Google Maps URL"
          value={form.location_url}
          onChange={(e) => setForm((p) => ({ ...p, location_url: e.target.value }))}
        />
        <Textarea
          mt="md"
          label="Şirket İçi Notlar"
          value={form.internal_notes}
          onChange={(e) => setForm((p) => ({ ...p, internal_notes: e.target.value }))}
        />

        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setOpened(false)}>Vazgeç</Button>
          <Button onClick={save} loading={saving}>Kaydet</Button>
        </Group>
      </Modal>

      <CustomerDetailDrawer
        customerId={selectedCustomerId}
        opened={drawerOpened}
        onClose={closeDrawer}
      />
    </Container>
  );
}
