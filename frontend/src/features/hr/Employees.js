import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';

import { createEmployee, listEmployees, updateEmployee } from './employeeService';

const ROLE_OPTIONS = [
  { value: 'WORKER', label: 'Usta / Üretim Personeli' },
  { value: 'SALES', label: 'Satış Temsilcisi' },
  { value: 'OFFICE', label: 'Ofis / Yönetim' },
  { value: 'DRIVER', label: 'Şoför / Lojistik' },
];

export default function Employees() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    role: 'WORKER',
    phone: '',
    tc_number: '',
    base_salary: 0,
    iban: '',
    hire_date: null,
    remaining_leave_days: 0,
    assigned_assets_text: '',
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await listEmployees();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      notifications.show({ title: 'Hata', message: e.message || 'Personel alınamadı', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      first_name: '',
      last_name: '',
      role: 'WORKER',
      phone: '',
      tc_number: '',
      base_salary: 0,
      iban: '',
      hire_date: null,
      remaining_leave_days: 0,
      assigned_assets_text: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditingId(e.id);
    setForm({
      first_name: e.first_name || '',
      last_name: e.last_name || '',
      role: e.role || 'WORKER',
      phone: e.phone || '',
      tc_number: e.tc_number || '',
      base_salary: Number(e.base_salary || 0),
      iban: e.iban || '',
      hire_date: e.hire_date ? new Date(e.hire_date) : null,
      remaining_leave_days: Number(e.remaining_leave_days || 0),
      assigned_assets_text: Array.isArray(e.assigned_assets) ? e.assigned_assets.join('\n') : '',
      is_active: !!e.is_active,
    });
    setModalOpen(true);
  };

  const save = async () => {
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        phone: form.phone,
        tc_number: form.tc_number,
        base_salary: Number(form.base_salary || 0),
        iban: form.iban,
        hire_date: form.hire_date instanceof Date ? form.hire_date.toISOString().split('T')[0] : null,
        remaining_leave_days: Number(form.remaining_leave_days || 0),
        assigned_assets: String(form.assigned_assets_text || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        is_active: !!form.is_active,
      };

      if (editingId) await updateEmployee(editingId, payload);
      else await createEmployee(payload);

      notifications.show({ title: 'Başarılı', message: 'Personel kaydedildi.', color: 'green' });
      setModalOpen(false);
      await load();
    } catch (e) {
      notifications.show({ title: 'Hata', message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Kaydedilemedi'), color: 'red' });
    }
  };

  const deactivate = async (e) => {
    try {
      await updateEmployee(e.id, { is_active: false });
      notifications.show({ message: 'Personel pasife alındı.', color: 'green' });
      await load();
    } catch (err) {
      notifications.show({ title: 'Hata', message: err.message || 'Güncellenemedi', color: 'red' });
    }
  };

  const activeCount = useMemo(() => items.filter((i) => i.is_active).length, [items]);

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <Title order={2}>Personel</Title>
          <Badge variant="light">Aktif: {activeCount}</Badge>
        </Group>
        <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>Yeni Personel</Button>
      </Group>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ad Soyad</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>İşe Giriş</Table.Th>
              <Table.Th>İzin</Table.Th>
              <Table.Th>Zimmet</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td>
                  <Text fw={600}>{e.full_name || `${e.first_name} ${e.last_name}`}</Text>
                  <Text size="xs" c="dimmed">{e.phone || ''}</Text>
                </Table.Td>
                <Table.Td>{e.role}</Table.Td>
                <Table.Td>{e.hire_date || '-'}</Table.Td>
                <Table.Td>{e.remaining_leave_days ?? 0}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    {Array.isArray(e.assigned_assets) && e.assigned_assets.length ? e.assigned_assets.join(', ') : '-'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={e.is_active ? 'green' : 'gray'}>{e.is_active ? 'Aktif' : 'Pasif'}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="outline" onClick={() => openEdit(e)}>Düzenle</Button>
                    {e.is_active && (
                      <Button size="xs" color="red" variant="outline" onClick={() => deactivate(e)}>Çıkar</Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Personel Kartı" centered size="lg">
        <SimpleGrid cols={2} breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
          <TextInput label="Ad" value={form.first_name} onChange={(ev) => setForm({ ...form, first_name: ev.target.value })} />
          <TextInput label="Soyad" value={form.last_name} onChange={(ev) => setForm({ ...form, last_name: ev.target.value })} />
          <Select label="Rol" data={ROLE_OPTIONS} value={form.role} onChange={(v) => setForm({ ...form, role: v || 'WORKER' })} />
          <TextInput label="Telefon" value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} />
          <TextInput label="TC" value={form.tc_number} onChange={(ev) => setForm({ ...form, tc_number: ev.target.value })} />
          <NumberInput label="Net Maaş" min={0} value={form.base_salary} onChange={(v) => setForm({ ...form, base_salary: typeof v === 'number' ? v : 0 })} />
          <TextInput label="IBAN" value={form.iban} onChange={(ev) => setForm({ ...form, iban: ev.target.value })} />
          <DateInput label="İşe Giriş Tarihi" value={form.hire_date} onChange={(v) => setForm({ ...form, hire_date: v })} clearable />
          <NumberInput label="Kalan İzin Günü" min={0} value={form.remaining_leave_days} onChange={(v) => setForm({ ...form, remaining_leave_days: typeof v === 'number' ? v : 0 })} />
          <Textarea
            label="Zimmetlenen Eşyalar (satır satır)"
            value={form.assigned_assets_text}
            onChange={(ev) => setForm({ ...form, assigned_assets_text: ev.target.value })}
            minRows={3}
            style={{ gridColumn: '1 / -1' }}
          />
        </SimpleGrid>

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Kapat</Button>
          <Button onClick={save}>Kaydet</Button>
        </Group>
      </Modal>
    </Container>
  );
}
