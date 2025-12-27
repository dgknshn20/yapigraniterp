import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import {
  Badge,
  Card,
  Container,
  Grid,
  Group,
  Loader,
  SimpleGrid,
  Table,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconFileDescription,
  IconWallet,
} from '@tabler/icons-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const currencyTRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

export default function Dashboard() {
  const theme = useMantineTheme();
  const role = useSelector((state) => state.auth.user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStats = async () => {
      try {
        const base = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
        const res = await axios.get(`${base}/dashboard/stats/`);
        if (!mounted) return;
        setData(res.data);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Dashboard stats error', e);
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  const canSeeFinance = ['ADMIN', 'FINANCE'].includes(role);
  const canSeeSales = ['ADMIN', 'SALES'].includes(role);

  const financeData = useMemo(() => {
    if (!data?.finance || !canSeeFinance) return [];
    return [
      { name: 'Gelir', amount: Number(data.finance.monthly_income || 0), color: theme.colors.green[6] },
      { name: 'Gider', amount: Number(data.finance.monthly_expense || 0), color: theme.colors.red[6] },
    ];
  }, [data, theme.colors.green, theme.colors.red, canSeeFinance]);

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Loader />
      </Container>
    );
  }

  if (!data) {
    return (
      <Container size="xl" py="xl">
        <Text>Veri yüklenemedi.</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Title order={2} mb="md">Yönetim Paneli</Title>

      {canSeeFinance && data.finance && (
        <SimpleGrid cols={3} breakpoints={[{ maxWidth: 'md', cols: 1 }]} mb="lg">
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">KASA + BANKA</Text>
              <IconWallet color={theme.colors.blue[6]} size={24} />
            </Group>
            <Text fw={700} size="xl" mt="sm">
              {currencyTRY.format(Number(data.finance.total_cash || 0))}
            </Text>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">AYLIK GİRİŞ</Text>
              <IconArrowDownLeft color={theme.colors.green[6]} size={24} />
            </Group>
            <Text fw={700} size="xl" mt="sm" c="green">
              {currencyTRY.format(Number(data.finance.monthly_income || 0))}
            </Text>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">AYLIK ÇIKIŞ</Text>
              <IconArrowUpRight color={theme.colors.red[6]} size={24} />
            </Group>
            <Text fw={700} size="xl" mt="sm" c="red">
              {currencyTRY.format(Number(data.finance.monthly_expense || 0))}
            </Text>
          </Card>
        </SimpleGrid>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          {canSeeFinance && data.finance && (
            <Card withBorder radius="md" p="md" style={{ height: '100%' }}>
              <Text fw={600} mb="md">Bu Ay Finansal Durum</Text>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={60} />
                    <Tooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="amount" radius={[0, 10, 10, 0]} barSize={40}>
                      {financeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <SimpleGrid cols={1} spacing="md">
            {canSeeSales && data.sales && (
              <Card withBorder radius="md" p="md">
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>Satış Hunisi</Text>
                  <IconFileDescription size={20} color={theme.colors.blue[6]} />
                </Group>
                <Group justify="space-between" mt="md">
                  <Text>Taslak Teklifler</Text>
                  <Badge size="lg">{data.sales.pending_proposals || 0}</Badge>
                </Group>
                <Group justify="space-between" mt="sm">
                  <Text>Onaylanan</Text>
                  <Badge size="lg" color="green">
                    {data.sales.approved_proposals || 0}
                  </Badge>
                </Group>
              </Card>
            )}
          </SimpleGrid>
        </Grid.Col>

        {canSeeFinance && (
          <Grid.Col span={12}>
            <Card withBorder radius="md" p="md" mt="md">
              <Text fw={600} mb="md">Son Finansal Hareketler</Text>

              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tarih</Table.Th>
                    <Table.Th>Açıklama</Table.Th>
                    <Table.Th>Tip</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Tutar</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(data.recent_activity || []).map((t, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{t.date}</Table.Td>
                      <Table.Td>{t.description}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            t.transaction_type === 'INCOME'
                              ? 'green'
                              : t.transaction_type === 'EXPENSE'
                                ? 'red'
                                : 'blue'
                          }
                        >
                          {t.transaction_type}
                        </Badge>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {Number(t.amount || 0).toLocaleString('tr-TR')} ₺
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>
        )}
      </Grid>
    </Container>
  );
}
