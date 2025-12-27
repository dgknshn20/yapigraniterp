const { test, expect } = require('@playwright/test');

const ALL_NAV_ITEMS = [
  'Ana Sayfa',
  'Müşteriler',
  'Personel',
  'Teklifler',
  'Sözleşmeler',
  'Stok',
  'Finans',
];

const NAV_BY_ROLE = {
  ADMIN: ['Ana Sayfa', 'Müşteriler', 'Personel', 'Teklifler', 'Sözleşmeler', 'Stok', 'Finans'],
  SALES: ['Ana Sayfa', 'Müşteriler', 'Teklifler', 'Sözleşmeler'],
  FINANCE: ['Ana Sayfa', 'Sözleşmeler', 'Finans'],
  PRODUCTION: ['Ana Sayfa', 'Sözleşmeler', 'Stok'],
};

const fixtures = {
  '/api/notifications/unread/': [],
  '/api/notifications/': [],
  '/api/dashboard/stats/': {
    finance: { total_cash: 0, monthly_income: 0, monthly_expense: 0 },
    sales: { pending_proposals: 0, approved_proposals: 0 },
    recent_activity: [],
  },
  '/api/contracts/': [
    {
      id: 1,
      contract_no: 'S-001',
      project_name: 'Mutfak Projesi',
      customer_id: 10,
      customer_name: 'Acme İnşaat',
      proposal_number: 'T-001',
      status: 'IMZALANDI',
      total_amount: 1500,
      currency: 'TRY',
      contract_file_url: 'https://example.com/contract.pdf',
    },
  ],
  '/api/customers/': [
    { id: 10, name: 'Acme İnşaat', phone: '555 000 00 00' },
  ],
  '/api/product-definitions/': [
    { id: 1, name: 'Granit' },
  ],
  '/api/slabs/': [
    {
      id: 1,
      product_name: 'Granit',
      barcode: 'SLAB-001',
      width: 10,
      length: 20,
      thickness: 2,
      area_m2: 0.2,
      status: 'AVAILABLE',
      warehouse_location: 'A1',
    },
  ],
  '/api/proposals/': [
    {
      id: 1,
      customer_name: 'Acme İnşaat',
      proposal_number: 'T-001',
      status: 'DRAFT',
      currency: 'TRY',
      total_amount: 1000,
      valid_until: '2025-01-01',
    },
  ],
  '/api/transactions/daily_summary/': { total_income: 0, total_expense: 0, net_flow: 0 },
  '/api/transactions/': [],
  '/api/accounts/': [],
  '/api/cheques/': [],
  '/api/payment-plans/': [],
  '/api/fixed-expenses/': [],
  '/api/finance/cashflow-forecast/': { forecasts: [] },
  '/api/finance/project-profitability/': { items: [] },
  '/api/finance/alerts/': { summary: { overdue_collections: 0, upcoming_cheques: 0, negative_balance_risk: 0 } },
  '/api/employees/': [],
};

const jsonResponse = (data) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(data),
});

const mockApi = async (page) => {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() !== 'GET') {
      return route.fulfill(jsonResponse({}));
    }

    if (path.endsWith('/export_excel/')) {
      return route.fulfill({
        status: 200,
        body: '',
        headers: { 'content-type': 'application/octet-stream' },
      });
    }

    if (Object.prototype.hasOwnProperty.call(fixtures, path)) {
      return route.fulfill(jsonResponse(fixtures[path]));
    }

    return route.fulfill(jsonResponse([]));
  });
};

const loginAs = async (page, role) => {
  const user = {
    username: role.toLowerCase(),
    role,
  };
  await page.addInitScript((value) => {
    window.localStorage.setItem('user', JSON.stringify(value));
  }, user);
};

const bootRole = async (page, role) => {
  await mockApi(page);
  await loginAs(page, role);
  await page.goto('/');
  await expect(page.getByText('Yapı Granit ERP')).toBeVisible();
};

const expectNavItems = async (page, role) => {
  const nav = page.getByRole('navigation');
  const visibleItems = NAV_BY_ROLE[role];
  const hiddenItems = ALL_NAV_ITEMS.filter((item) => !visibleItems.includes(item));

  await expect(nav).toBeVisible();
  for (const item of visibleItems) {
    await expect(nav.getByText(item, { exact: true })).toBeVisible();
  }
  for (const item of hiddenItems) {
    await expect(nav.getByText(item, { exact: true })).toHaveCount(0);
  }
};

const expectAccessDenied = async (page, path) => {
  await page.goto(path);
  await expect(page.getByText('Bu sayfaya erişiminiz yok.')).toBeVisible();
};

test.describe('Role based menu visibility', () => {
  for (const role of Object.keys(NAV_BY_ROLE)) {
    test(`menu reflects role ${role}`, async ({ page }) => {
      await bootRole(page, role);
      await expectNavItems(page, role);
    });
  }
});

test('admin sees critical action buttons', async ({ page }) => {
  await bootRole(page, 'ADMIN');

  await page.goto('/proposals');
  await expect(page.getByRole('button', { name: 'Onayla & Sözleşme Yap' })).toBeVisible();

  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: 'Sil' })).toBeVisible();

  await page.goto('/finance');
  await expect(page.getByRole('button', { name: 'Excel İndir' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Proje Kârlılığı' })).toBeVisible();

  await page.goto('/contracts');
  await expect(page.getByText('Müşteri Detayı', { exact: true })).toBeVisible();
  await expect(page.getByText('İmzalı', { exact: true })).toBeVisible();
});

test('sales is blocked from finance and inventory actions', async ({ page }) => {
  await bootRole(page, 'SALES');

  await expectAccessDenied(page, '/finance');
  await expect(page.getByRole('button', { name: 'Excel İndir' })).toHaveCount(0);

  await expectAccessDenied(page, '/inventory');
  await expect(page.getByRole('button', { name: 'Sil' })).toHaveCount(0);

  await page.goto('/proposals');
  await expect(page.getByRole('button', { name: 'Onayla & Sözleşme Yap' })).toBeVisible();
});

test('finance is blocked from sales and inventory actions', async ({ page }) => {
  await bootRole(page, 'FINANCE');

  await expectAccessDenied(page, '/proposals');
  await expect(page.getByRole('button', { name: 'Onayla & Sözleşme Yap' })).toHaveCount(0);

  await expectAccessDenied(page, '/inventory');
  await expect(page.getByRole('button', { name: 'Sil' })).toHaveCount(0);

  await page.goto('/finance');
  await expect(page.getByRole('button', { name: 'Excel İndir' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Proje Kârlılığı' })).toHaveCount(0);

  await page.goto('/contracts');
  await expect(page.getByText('Müşteri Detayı', { exact: true })).toHaveCount(0);
  await expect(page.getByText('İmzalı', { exact: true })).toBeVisible();
});

test('production is blocked from sales and finance actions', async ({ page }) => {
  await bootRole(page, 'PRODUCTION');

  await expectAccessDenied(page, '/proposals');
  await expect(page.getByRole('button', { name: 'Onayla & Sözleşme Yap' })).toHaveCount(0);

  await expectAccessDenied(page, '/finance');
  await expect(page.getByRole('button', { name: 'Excel İndir' })).toHaveCount(0);

  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: 'Sil' })).toBeVisible();

  await page.goto('/contracts');
  await expect(page.getByText('Gizli', { exact: true })).toBeVisible();
  await expect(page.getByText('Müşteri Detayı', { exact: true })).toHaveCount(0);
  await expect(page.getByText('İmzalı', { exact: true })).toHaveCount(0);
});
