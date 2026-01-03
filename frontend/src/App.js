import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import {
  AppShell,
  Text,
  Burger,
  Loader,
  useMantineTheme,
  NavLink,
  Group,
  Avatar,
  Menu,
  ActionIcon,
  Indicator,
} from '@mantine/core';
import {
  IconHome,
  IconUsers,
  IconFileText,
  IconBuildingBank,
  IconPackage,
  IconLogout,
  IconSettings,
  IconBell
} from '@tabler/icons-react';
import { logout } from './features/auth/authSlice';
import Customers from './features/customers/Customers';
import CustomerDetail from './features/customers/CustomerDetail';
import Proposals from './features/proposals/Proposals';
import Contracts from './features/contracts/Contracts';
import Finance from './features/finance/Finance';
import Inventory from './features/inventory/Inventory';
import Dashboard from './pages/Dashboard';
import NotificationsPage from './features/notifications/NotificationsPage';
import notificationService from './features/notifications/notificationService';
import Employees from './features/hr/Employees';
import { setUser } from './features/auth/authSlice';

const AUTH_DISABLED = true;
const FALLBACK_USER = { username: 'Sistem', role: 'ADMIN' };

/**
 * Protected Route Component
 * Auth is disabled; only role gate is enforced.
 */
const ProtectedRoute = ({ children, allowedRoles, user }) => {
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div style={{ padding: 24 }}>
        <Text fw={600}>Bu sayfaya erişiminiz yok.</Text>
      </div>
    );
  }
  return children;
};

export default function App() {
  const theme = useMantineTheme();
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Get auth state from Redux
  const { user } = useSelector((state) => state.auth);
  const activeUser = AUTH_DISABLED ? (user || FALLBACK_USER) : user;
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    const loadRole = async () => {
      if (!user || user.role || roleLoading || AUTH_DISABLED) return;
      setRoleLoading(true);
      try {
        const base = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
        const res = await axios.get(`${base}/auth/me/`);
        dispatch(setUser({ ...user, ...res.data }));
      } catch {
        // silent
      } finally {
        setRoleLoading(false);
      }
    };

    loadRole();
  }, [user, roleLoading, dispatch]);

  const [unreadNotifications, setUnreadNotifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    let timerId = null;
    const loadUnread = async () => {
      try {
        const data = await notificationService.getUnreadNotifications();
        if (mounted) setUnreadNotifications(Array.isArray(data) ? data : []);
      } catch {
        // silent
      }
    };

    if (user) {
      loadUnread();
      timerId = setInterval(loadUnread, 30_000);
    }
    return () => {
      mounted = false;
      if (timerId) clearInterval(timerId);
    };
  }, [user]);

  // Menü Elemanları
  const navItems = [
    { label: 'Ana Sayfa', icon: IconHome, to: '/', roles: ['ADMIN', 'SALES', 'FINANCE', 'PRODUCTION'] },
    { label: 'Müşteriler', icon: IconUsers, to: '/customers', roles: ['ADMIN', 'SALES'] },
    { label: 'Personel', icon: IconUsers, to: '/employees', roles: ['ADMIN'] },
    { label: 'Teklifler', icon: IconFileText, to: '/proposals', roles: ['ADMIN', 'SALES'] },
    { label: 'Sözleşmeler', icon: IconFileText, to: '/contracts', roles: ['ADMIN', 'SALES', 'FINANCE', 'PRODUCTION'] },
    { label: 'Stok', icon: IconPackage, to: '/inventory', roles: ['ADMIN', 'PRODUCTION'] },
    { label: 'Finans', icon: IconBuildingBank, to: '/finance', roles: ['ADMIN', 'FINANCE'] },
  ];

  const visibleNavItems = navItems.filter((item) => !item.roles || item.roles.includes(activeUser?.role));

  /**
   * Handle Logout
   */
  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  if (!AUTH_DISABLED && !user.role && roleLoading) {
    return (
      <div style={{ padding: 24 }}>
        <Loader size="sm" />
      </div>
    );
  }

  return (
    <AppShell
      padding="md"
      header={{ height: { base: 50, md: 70 } }}
      navbar={{
        width: { sm: 200, lg: 300 },
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
    >
      <AppShell.Header>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'space-between', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Burger
              opened={opened}
              onClick={() => setOpened((o) => !o)}
              size="sm"
              color={theme.colors.gray[6]}
              hiddenFrom="sm"
            />

            <Group gap="xs">
              <IconBuildingBank size={28} color={theme.colors.blue[6]} />
              <Text size="lg" fw={700}>Yapı Granit ERP</Text>
            </Group>
          </div>

          {activeUser && (
            <Group gap="xs">
              <Menu shadow="md" width={360}>
                <Menu.Target>
                  <Indicator disabled={unreadNotifications.length === 0} label={unreadNotifications.length} size={16}>
                    <ActionIcon variant="subtle" aria-label="Bildirimler">
                      <IconBell size={18} />
                    </ActionIcon>
                  </Indicator>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Bildirimler</Menu.Label>
                  {unreadNotifications.length === 0 ? (
                    <Menu.Item disabled>Okunmamış bildirim yok</Menu.Item>
                  ) : (
                    unreadNotifications.slice(0, 5).map((n) => (
                      <Menu.Item
                        key={n.id}
                        onClick={async () => {
                          try {
                            await notificationService.markNotificationRead(n.id);
                          } catch {
                            // silent
                          } finally {
                            setUnreadNotifications((prev) => prev.filter((x) => x.id !== n.id));
                            if (n.related_url) navigate(n.related_url);
                            else navigate('/notifications');
                          }
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Text size="sm" fw={600}>{n.title}</Text>
                          {n.message && <Text size="xs" c="dimmed" lineClamp={2}>{n.message}</Text>}
                        </div>
                      </Menu.Item>
                    ))
                  )}
                  <Menu.Divider />
                  <Menu.Item onClick={() => navigate('/notifications')}>Tüm bildirimler</Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Group style={{ cursor: 'pointer' }}>
                    <Avatar radius="xl" color="blue">
                      {activeUser.username ? activeUser.username.substring(0, 2).toUpperCase() : 'U'}
                    </Avatar>
                    <div style={{ display: 'none' }} className="app-user-meta" />
                  </Group>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Hesap</Menu.Label>
                  <Menu.Item leftSection={<IconSettings size={14} />}>Ayarlar</Menu.Item>
                  <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={handleLogout}>
                    Çıkış Yap
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )}
        </div>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1 }}>
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.label}
                label={item.label}
                leftSection={<item.icon size="1rem" stroke={1.5} />}
                component={Link}
                to={item.to}
                active={location.pathname === item.to}
                variant="light"
                onClick={() => setOpened(false)}
              />
            ))}
          </div>

          <div>
            <NavLink
              label="Çıkış Yap"
              leftSection={<IconLogout size="1rem" />}
              color="red"
              onClick={handleLogout}
            />
          </div>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<ProtectedRoute user={activeUser}><Dashboard /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'SALES']}><Customers /></ProtectedRoute>} />
          <Route path="/customers/:id" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'SALES']}><CustomerDetail /></ProtectedRoute>} />
          <Route path="/proposals" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'SALES']}><Proposals /></ProtectedRoute>} />
          <Route path="/contracts" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'SALES', 'FINANCE', 'PRODUCTION']}><Contracts /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'PRODUCTION']}><Inventory /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN', 'FINANCE']}><Finance /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute user={activeUser} allowedRoles={['ADMIN']}><Employees /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute user={activeUser}><NotificationsPage /></ProtectedRoute>} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
