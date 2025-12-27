import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import {
  Button,
  Card,
  Container,
  Group,
  PasswordInput,
  SimpleGrid,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { setUser } from '../features/auth/authSlice';

export default function Login() {
  const dispatch = useDispatch();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const quickUsers = useMemo(() => ([
    { key: 'ADMIN', label: 'Yönetici', username: 'admin' },
    { key: 'SALES', label: 'Satış', username: 'sales' },
    { key: 'FINANCE', label: 'Muhasebe', username: 'finance' },
    { key: 'PRODUCTION', label: 'Mimar / Teknik', username: 'production' },
  ]), []);

  const quickPasswords = useMemo(() => ({
    ADMIN: process.env.REACT_APP_ADMIN_PASSWORD || process.env.REACT_APP_DEMO_PASSWORD || '',
    SALES: process.env.REACT_APP_SALES_PASSWORD || process.env.REACT_APP_DEMO_PASSWORD || '',
    FINANCE: process.env.REACT_APP_FINANCE_PASSWORD || process.env.REACT_APP_DEMO_PASSWORD || '',
    PRODUCTION: process.env.REACT_APP_PRODUCTION_PASSWORD || process.env.REACT_APP_DEMO_PASSWORD || '',
  }), []);

  const performLogin = async (usernameValue, passwordValue) => {
    try {
      setLoading(true);
      const base = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
      const res = await axios.post(`${base}/auth/login/`, { username: usernameValue, password: passwordValue });
      const user = { username: usernameValue, access: res.data.access, refresh: res.data.refresh };
      dispatch(setUser(user));
      try {
        const me = await axios.get(`${base}/auth/me/`);
        dispatch(setUser({ ...user, ...me.data }));
      } catch {
        // keep token-only session if role fetch fails
      }
      notifications.show({ title: 'Giriş başarılı', message: 'Hoşgeldiniz.', color: 'green' });
    } catch (err) {
      notifications.show({
        title: 'Giriş başarısız',
        message: err?.response?.data?.detail || 'Kullanıcı adı/şifre hatalı veya sunucuya erişilemiyor.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await performLogin(username, password);
  };

  const handleQuickLogin = async (entry) => {
    const pwd = quickPasswords[entry.key] || '';
    setUsername(entry.username);
    setPassword(pwd);
    if (!pwd) {
      notifications.show({
        title: 'Şifre gerekli',
        message: `${entry.label} için şifreyi girin veya REACT_APP_${entry.key}_PASSWORD tanımlayın.`,
        color: 'yellow',
      });
      return;
    }
    await performLogin(entry.username, pwd);
  };

  return (
    <Container size={420} py={80}>
      <Title align="center" mb="md">Yapı Granit ERP</Title>
      <Text align="center" color="dimmed" mb="lg">Devam etmek için giriş yapın</Text>

      <Card withBorder shadow="sm" p="lg" radius="md">
        <form onSubmit={submit}>
          <TextInput
            label="Kullanıcı Adı"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <PasswordInput
            label="Şifre"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            mt="md"
          />
          <Button fullWidth mt="xl" type="submit" loading={loading}>Giriş Yap</Button>
        </form>
      </Card>

      <Card withBorder shadow="sm" p="lg" radius="md" mt="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Hızlı Giriş</Text>
          <Text size="xs" c="dimmed">Demo için</Text>
        </Group>
        <SimpleGrid cols={2} spacing="sm" breakpoints={[{ maxWidth: 'xs', cols: 1 }]}>
          {quickUsers.map((entry) => (
            <Button
              key={entry.key}
              variant="light"
              onClick={() => handleQuickLogin(entry)}
              loading={loading}
            >
              {entry.label}
            </Button>
          ))}
        </SimpleGrid>
      </Card>
    </Container>
  );
}
