import React, { useEffect, useState } from 'react';
import { Button, Container, Group, Loader, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import notificationService from './notificationService';

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await notificationService.listNotifications();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      notifications.show({ title: 'Hata', message: e.message || 'Bildirimler alınamadı', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id) => {
    try {
      await notificationService.markNotificationRead(id);
      await load();
    } catch (e) {
      notifications.show({ title: 'Hata', message: e.message || 'Güncellenemedi', color: 'red' });
    }
  };

  const markAll = async () => {
    try {
      await notificationService.markAllRead();
      await load();
    } catch (e) {
      notifications.show({ title: 'Hata', message: e.message || 'Güncellenemedi', color: 'red' });
    }
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Bildirimler</Title>
        <Button variant="outline" onClick={markAll}>Hepsini okundu yap</Button>
      </Group>

      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tarih</Table.Th>
              <Table.Th>Başlık</Table.Th>
              <Table.Th>Mesaj</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((n) => (
              <Table.Tr key={n.id}>
                <Table.Td><Text size="sm" c="dimmed">{String(n.created_at || '').slice(0, 19).replace('T', ' ')}</Text></Table.Td>
                <Table.Td><Text fw={600}>{n.title}</Text></Table.Td>
                <Table.Td><Text size="sm" c="dimmed">{n.message}</Text></Table.Td>
                <Table.Td>{n.is_read ? 'Okundu' : 'Okunmadı'}</Table.Td>
                <Table.Td>
                  {!n.is_read && (
                    <Button size="xs" onClick={() => markRead(n.id)}>Okundu</Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Container>
  );
}
