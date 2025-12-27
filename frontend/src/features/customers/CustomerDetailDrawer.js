import React, { useEffect, useState } from 'react';
import {
  Badge,
  Card,
  Drawer,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
} from '@mantine/core';
import {
  IconCreditCard,
  IconFileText,
  IconMapPin,
  IconNotes,
  IconPhone,
  IconReceipt,
  IconUser,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import { getCustomerDetail } from './customerService';

const getStatusColor = (status) => {
  const map = {
    LEAD: 'gray',
    NEGOTIATION: 'blue',
    ACTIVE: 'green',
    PAYMENT_DUE: 'orange',
    PASSIVE: 'yellow',
    BLACKLIST: 'red',
  };
  return map[status] || 'gray';
};

const getInstallmentStatusColor = (status, isOverdue) => {
  if (isOverdue) return 'red';
  const map = {
    PENDING: 'orange',
    PAID: 'green',
    CANCELLED: 'gray',
  };
  return map[status] || 'gray';
};

export default function CustomerDetailDrawer({ customerId, opened, onClose }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened || !customerId) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getCustomerDetail(customerId);
        if (mounted) setCustomer(data);
      } catch (e) {
        notifications.show({
          title: 'Hata',
          message: 'Müşteri detayları alınamadı.',
          color: 'red',
        });
        if (mounted) setCustomer(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [customerId, opened]);

  const balanceValue = Number(customer?.balance || 0);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={<Text fw={700} size="lg">Müşteri Kartı</Text>}
      overlayProps={{ opacity: 0.5, blur: 4 }}
    >
      {loading ? (
        <Group justify="center" mt="xl">
          <Loader size="lg" />
        </Group>
      ) : !customer ? (
        <Text size="sm" c="dimmed">Müşteri verisi bulunamadı.</Text>
      ) : (
        <Stack gap="md">
          <Paper withBorder p="md" radius="md" bg="gray.0">
            <Group justify="space-between" align="flex-start">
              <Group>
                <ThemeIcon size={50} radius="md" variant="filled" color={getStatusColor(customer.status)}>
                  <IconUser size={30} />
                </ThemeIcon>
                <div>
                  <Text size="xl" fw={700} style={{ lineHeight: 1.2 }}>
                    {customer.name}
                  </Text>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    {customer.customer_type === 'COMPANY' ? 'Kurumsal' : 'Bireysel'}
                  </Text>
                  <Group gap="xs" mt={6}>
                    {customer.segment_display ? (
                      <Badge size="sm" variant="light" color="blue">
                        {customer.segment_display}
                      </Badge>
                    ) : null}
                    <Badge size="sm" color={getStatusColor(customer.status)} variant="outline">
                      {customer.status_display || customer.status}
                    </Badge>
                  </Group>
                </div>
              </Group>
              <div style={{ textAlign: 'right' }}>
                <Text size="xs" c="dimmed" fw={700}>TOPLAM BAKIYE</Text>
                <Text size="xl" fw={700} c={balanceValue >= 0 ? 'green.7' : 'red.7'}>
                  {balanceValue.toLocaleString()} ₺
                </Text>
              </div>
            </Group>

            <Grid mt="md">
              <Grid.Col span={6}>
                <Group gap="xs">
                  <IconPhone size={16} color="gray" />
                  <Text size="sm">{customer.phone || '-'}</Text>
                </Group>
                <Group gap="xs" mt={4}>
                  <IconMapPin size={16} color="gray" />
                  <Text size="sm" lineClamp={1}>{customer.address || 'Adres yok'}</Text>
                </Group>
              </Grid.Col>
              <Grid.Col span={6}>
                <Text size="xs" c="dimmed">Vergi Dairesi / No:</Text>
                <Text size="sm">{customer.tax_office || '-'} / {customer.tax_number || '-'}</Text>
              </Grid.Col>
            </Grid>
          </Paper>

          <Tabs defaultValue="overview" variant="outline">
            <Tabs.List>
              <Tabs.Tab value="overview" leftSection={<IconNotes size={16} />}>Özet & Notlar</Tabs.Tab>
              <Tabs.Tab value="sales" leftSection={<IconFileText size={16} />}>Teklifler</Tabs.Tab>
              <Tabs.Tab value="finance" leftSection={<IconReceipt size={16} />}>Ödemeler & Çekler</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview" pt="md">
              <Text fw={600} mb="xs">Şirket İçi Notlar</Text>
              <Paper withBorder p="sm" bg="yellow.0">
                <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                  {customer.internal_notes || 'Bu müşteri için özel bir not girilmemiş.'}
                </Text>
              </Paper>

              <Text fw={600} mt="md" mb="xs">Müşteri Tarihçesi</Text>
              <Timeline active={1} bulletSize={20} lineWidth={2}>
                <Timeline.Item title="Kayıt Oluşturuldu" bullet={<IconUser size={12} />}>
                  <Text c="dimmed" size="xs">
                    {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}
                  </Text>
                </Timeline.Item>
              </Timeline>
            </Tabs.Panel>

            <Tabs.Panel value="sales" pt="md">
              <Stack>
                {customer.active_proposals?.length ? (
                  customer.active_proposals.map((p) => (
                    <Card key={p.id} withBorder padding="sm" radius="md">
                      <Group justify="space-between">
                        <div>
                          <Text fw={600}>{p.number}</Text>
                          <Text size="xs" c="dimmed">
                            {p.date ? new Date(p.date).toLocaleDateString() : '-'}
                          </Text>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text fw={700} c="blue">
                            {Number(p.total || 0).toLocaleString()} {p.currency}
                          </Text>
                          <Badge size="xs">{p.status_display || p.status}</Badge>
                        </div>
                      </Group>
                    </Card>
                  ))
                ) : (
                  <Text c="dimmed" ta="center">Kayıtlı teklif yok.</Text>
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="finance" pt="md">
              <Stack gap="lg">
                <div>
                  <Text fw={600} mb="xs">Son Hesap Hareketleri</Text>
                  {customer.last_transactions?.length ? (
                    <Table striped withTableBorder>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Tarih</Table.Th>
                          <Table.Th>İşlem</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Tutar</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {customer.last_transactions.map((t) => (
                          <Table.Tr key={t.id}>
                            <Table.Td>
                              {t.date ? new Date(t.date).toLocaleDateString() : '-'}
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                size="xs"
                                color={t.transaction_type === 'INCOME' ? 'green' : 'red'}
                                variant="dot"
                              >
                                {t.transaction_type_display || t.transaction_type}
                              </Badge>
                              <Text size="xs" component="span" ml={8}>{t.description}</Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {Number(t.amount || 0).toLocaleString()} ₺
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text size="sm" c="dimmed">Kayıtlı hareket yok.</Text>
                  )}
                </div>

                <div>
                  <Text fw={600} mb="xs">Taksit / Ödeme Bildirimleri</Text>
                  {customer.payment_installments?.length ? (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Proje</Table.Th>
                          <Table.Th>Vade</Table.Th>
                          <Table.Th>Durum</Table.Th>
                          <Table.Th>Tutar</Table.Th>
                          <Table.Th>Ödeme</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {customer.payment_installments.map((inst) => {
                          const label = inst.project_name || inst.proposal_number || (
                            inst.contract_id ? `Sözleşme #${inst.contract_id}` : '-'
                          );
                          const statusColor = getInstallmentStatusColor(inst.status, inst.is_overdue);
                          return (
                            <Table.Tr key={inst.id}>
                              <Table.Td>
                                <Text fw={500}>{label}</Text>
                                {inst.method_display ? (
                                  <Text size="xs" c="dimmed">{inst.method_display}</Text>
                                ) : null}
                              </Table.Td>
                              <Table.Td>
                                {inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}
                              </Table.Td>
                              <Table.Td>
                                <Badge color={statusColor} variant="light">
                                  {inst.status_display || inst.status}
                                </Badge>
                              </Table.Td>
                              <Table.Td fw={700}>
                                {Number(inst.amount || 0).toLocaleString()} {inst.currency}
                              </Table.Td>
                              <Table.Td>
                                {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString() : '-'}
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text size="sm" c="dimmed">Taksit/ödeme bildirimi yok.</Text>
                  )}
                </div>

                <div>
                  <Text fw={600} mb="xs">Alınan Çekler</Text>
                  <Stack>
                    {customer.cheques?.length ? (
                      customer.cheques.map((c) => (
                        <Group
                          key={c.id}
                          justify="space-between"
                          p="xs"
                          style={{ border: '1px solid #eee', borderRadius: 4 }}
                        >
                          <Group gap="xs">
                            <IconCreditCard size={18} color="gray" />
                            <div>
                              <Text size="sm" fw={500}>{c.serial}</Text>
                              <Text size="xs" c="dimmed">
                                Vade: {c.due_date ? new Date(c.due_date).toLocaleDateString() : '-'}
                              </Text>
                            </div>
                          </Group>
                          <div style={{ textAlign: 'right' }}>
                            <Text size="sm" fw={600}>
                              {Number(c.amount || 0).toLocaleString()} {c.currency}
                            </Text>
                            <Badge size="xs" color="gray">{c.status_display || c.status}</Badge>
                          </div>
                        </Group>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed">Kayıtlı çek yok.</Text>
                    )}
                  </Stack>
                </div>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}
