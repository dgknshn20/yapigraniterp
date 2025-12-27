const { test, expect } = require('@playwright/test');

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD
  || process.env.REACT_APP_ADMIN_PASSWORD
  || process.env.REACT_APP_DEMO_PASSWORD
  || '';

const assertJwt = (value) => {
  expect(typeof value).toBe('string');
  expect(value.split('.')).toHaveLength(3);
};

const loginAsAdmin = async (page) => {
  await page.goto('/login');
  await page.getByLabel('Kullanıcı Adı').fill(ADMIN_USERNAME);
  await page.getByLabel('Şifre').fill(ADMIN_PASSWORD);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/auth/login/') && res.ok()),
    page.getByRole('button', { name: 'Giriş Yap' }).click(),
  ]);
  const loginData = await loginResponse.json();
  assertJwt(loginData.access);
  assertJwt(loginData.refresh);

  const meResponse = await page.waitForResponse((res) => res.url().includes('/auth/me/') && res.ok());
  const meData = await meResponse.json();
  expect(meData.username).toBe(ADMIN_USERNAME);
  expect(meData.role).toBeTruthy();

  return { loginData, meData };
};

test.describe('Real backend smoke', () => {
  test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD is not set.');

  test('admin login loads dashboard data', async ({ page }) => {
    await loginAsAdmin(page);

    const [statsResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/dashboard/stats/') && res.ok()),
      page.goto('/'),
    ]);
    const statsData = await statsResponse.json();
    expect(statsData).toHaveProperty('finance');
    expect(statsData).toHaveProperty('sales');
    expect(Array.isArray(statsData.recent_activity)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Yönetim Paneli' })).toBeVisible();
  });

  test('admin can open contracts page', async ({ page }) => {
    await loginAsAdmin(page);

    const [contractsResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/contracts') && res.ok()),
      page.goto('/contracts'),
    ]);
    const contractsData = await contractsResponse.json();
    const items = Array.isArray(contractsData) ? contractsData : contractsData?.results;
    expect(Array.isArray(items)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Sözleşmeler' })).toBeVisible();
  });
});
