import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Tabs,
  Table,
  Text,
  ThemeIcon,
  Timeline,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconFileText,
  IconMapPin,
  IconNotes,
  IconPhone,
  IconReceipt,
  IconUser,
} from '@tabler/icons-react';

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

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getCustomerDetail(id);
        if (mounted) setCustomer(data);
      } catch (e) {
        if (mounted) setCustomer(null);
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (!customer) {
    return (
      <Container py="xl">
        <Text>Müşteri bulunamadı.</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        onClick={() => navigate('/customers')}
        mb="md"
      >
        Listeye Dön
      </Button>

      <Card withBorder padding="lg" radius="md" mb="lg">
        <Group justify="space-between" mb="xs">
          <Group>
            <ThemeIcon size="xl" radius="md" variant="light" color={getStatusColor(customer.status)}>
              <IconUser style={{ width: '70%', height: '70%' }} />
            </ThemeIcon>
            <div>
              <Text size="xl" fw={700}>{customer.name}</Text>
              <Text size="sm" c="dimmed">
                {customer.customer_type === 'COMPANY' ? 'Kurumsal Firma' : 'Bireysel Müşteri'}
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            {customer.segment_display && (
              <Badge variant="light" color="blue">{customer.segment_display}</Badge>
            )}
            <Badge size="lg" color={getStatusColor(customer.status)}>
              {customer.status_display || customer.status}
            </Badge>
          </Group>
        </Group>

        <Grid mt="md">
          <Grid.Col span={4}>
            <Group gap="xs">
              <IconPhone size={16} color="gray" />
              <Text size="sm">{customer.phone}</Text>
            </Group>
            <Group gap="xs" mt={4}>
              <IconMapPin size={16} color="gray" />
              <Text size="sm">{customer.address || 'Adres girilmedi'}</Text>
            </Group>
          </Grid.Col>
          <Grid.Col span={4}>
            <Text size="xs" c="dimmed" fw={700}>VERGİ BİLGİLERİ</Text>
            <Text size="sm">{customer.tax_office || '-'} / {customer.tax_number || '-'}</Text>
          </Grid.Col>
          <Grid.Col span={4}>
            <Text size="xs" c="dimmed" fw={700}>RİSK LİMİTİ</Text>
            <Text size="lg" fw={600}>
              {Number(customer.risk_limit || 0).toLocaleString()} ₺
            </Text>
          </Grid.Col>
        </Grid>
      </Card>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconNotes size={16} />}>Genel Bakış</Tabs.Tab>
          <Tabs.Tab value="finance" leftSection={<IconReceipt size={16} />}>Finansal Hareketler</Tabs.Tab>
          <Tabs.Tab value="proposals" leftSection={<IconFileText size={16} />}>Teklifler</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Grid>
            <Grid.Col span={8}>
              <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm">Özel Notlar</Text>
                <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                  {customer.internal_notes || 'Henüz not eklenmemiş.'}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm">Müşteri Geçmişi</Text>
                <Timeline active={1} bulletSize={24} lineWidth={2}>
                  <Timeline.Item title="Müşteri Oluşturuldu">
                    <Text c="dimmed" size="xs">
                      {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}
                    </Text>
                  </Timeline.Item>
                </Timeline>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="finance" pt="md">
          {customer.last_transactions?.length ? (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tarih</Table.Th>
                  <Table.Th>İşlem</Table.Th>
                  <Table.Th>Tutar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {customer.last_transactions.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>{t.date ? new Date(t.date).toLocaleDateString() : '-'}</Table.Td>
                    <Table.Td>
                      {t.description} ({t.transaction_type_display || t.transaction_type})
                    </Table.Td>
                    <Table.Td fw={700}>{Number(t.amount || 0).toLocaleString()} ₺</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">Finansal hareket bulunamadı.</Text>
          )}

          <Text fw={600} mt="lg" mb="sm">Taksit / Ödeme Bildirimleri</Text>
          {customer.payment_installments?.length ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Proje</Table.Th>
                  <Table.Th>Vade</Table.Th>
                  <Table.Th>Taksit</Table.Th>
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
                  const methodLabel = inst.method_display || inst.method;
                  const statusColor = getInstallmentStatusColor(inst.status, inst.is_overdue);
                  return (
                    <Table.Tr key={inst.id}>
                      <Table.Td>
                        <Text fw={500}>{label}</Text>
                        {methodLabel ? (
                          <Text size="xs" c="dimmed">{methodLabel}</Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        {inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}
                      </Table.Td>
                      <Table.Td>
                        {inst.method === 'CASH' ? 'Peşin' : `Taksit ${inst.installment_no}`}
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
            <Text size="sm" c="dimmed">Taksit/ödeme bildirimi bulunamadı.</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="proposals" pt="md">
          {customer.active_proposals?.length ? (
            <SimpleGrid cols={2}>
              {customer.active_proposals.map((p) => (
                <Card key={p.id} withBorder>
                  <Text fw={600}>{p.number}</Text>
                  <Text size="sm" c="dimmed">
                    Tarih: {p.date ? new Date(p.date).toLocaleDateString() : '-'}
                  </Text>
                  <Text size="xl" mt="sm" c="blue">
                    {Number(p.total || 0).toLocaleString()} {p.currency}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed">Aktif teklif bulunamadı.</Text>
          )}
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
