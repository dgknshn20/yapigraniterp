import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  TextInput,
  Text,
  Title,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  listProducts,
  listSlabs,
  getMediaBase,
  createProductDefinition,
  createSlab,
  updateSlab,
  deleteSlab,
  uploadFile,
} from './slabService';

const RESERVED_STATUSES = new Set(['RESERVED']);

const statusBadgeColor = (status) => {
  switch (status) {
    case 'AVAILABLE':
      return 'green';
    case 'RESERVED':
      return 'yellow';
    case 'USED':
      return 'gray';
    case 'SOLD':
      return 'blue';
    case 'PART_STOCK':
      return 'orange';
    case 'SCRAP':
      return 'red';
    default:
      return 'dark';
  }
};

export default function Inventory() {
  const [loading, setLoading] = useState(true);
  const [slabs, setSlabs] = useState([]);
  const [products, setProducts] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [activeSlab, setActiveSlab] = useState(null);
  const [saving, setSaving] = useState(false);
  const [productSaving, setProductSaving] = useState(false);

  const emptyForm = {
    product: '',
    barcode: '',
    width: 0,
    length: 0,
    thickness: 0,
    status: 'AVAILABLE',
    warehouse_location: '',
    fire_disposition: 'UNKNOWN',
    photo_path: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [productForm, setProductForm] = useState({ name: '', code: '', description: '' });

  const [productFilter, setProductFilter] = useState('ALL');
  const [thicknessFilter, setThicknessFilter] = useState('ALL');
  const [reservedFilter, setReservedFilter] = useState('ALL');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const [slabsData, productsData] = await Promise.all([listSlabs(), listProducts()]);
        if (!mounted) return;
        setSlabs(slabsData);
        setProducts(productsData);
      } catch (e) {
        notifications.show({
          title: 'Stok verisi alınamadı',
          message: e?.response?.data?.detail || e.message || 'Bilinmeyen hata',
          color: 'red',
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSlabs = async () => {
    const slabsData = await listSlabs();
    setSlabs(slabsData);
  };

  const refreshProducts = async () => {
    const productsData = await listProducts();
    setProducts(productsData);
  };

  const productOptions = useMemo(() => {
    const opts = [{ value: 'ALL', label: 'Tümü' }];
    products.forEach((p) => {
      opts.push({ value: String(p.id), label: p.name });
    });
    return opts;
  }, [products]);

  const productOptionsForForm = useMemo(() => {
    return products.map((p) => ({ value: String(p.id), label: p.name }));
  }, [products]);

  const thicknessOptions = useMemo(() => {
    const unique = new Set();
    slabs.forEach((s) => {
      if (s?.thickness !== undefined && s?.thickness !== null) unique.add(String(s.thickness));
    });

    const sorted = Array.from(unique).sort((a, b) => parseFloat(a) - parseFloat(b));
    return [{ value: 'ALL', label: 'Tümü' }, ...sorted.map((t) => ({ value: t, label: `${t} mm` }))];
  }, [slabs]);

  const reservedOptions = [
    { value: 'ALL', label: 'Tümü' },
    { value: 'RESERVED', label: 'Rezerve' },
    { value: 'NOT_RESERVED', label: 'Rezerve Değil' },
  ];

  const statusOptions = [
    { value: 'AVAILABLE', label: 'Stokta' },
    { value: 'RESERVED', label: 'Rezerve' },
    { value: 'USED', label: 'Kullanıldı' },
    { value: 'SOLD', label: 'Satıldı' },
    { value: 'PART_STOCK', label: 'Parça Stok' },
    { value: 'SCRAP', label: 'Çöp/Fire' },
  ];

  const fireDispositionOptions = [
    { value: 'UNKNOWN', label: 'Belirtilmedi' },
    { value: 'PART_STOCK', label: 'Parça Stok' },
    { value: 'SCRAP', label: 'Çöp/Fire' },
  ];

  const filteredSlabs = useMemo(() => {
    return slabs.filter((s) => {
      if (productFilter !== 'ALL' && String(s.product) !== productFilter) return false;
      if (thicknessFilter !== 'ALL' && String(s.thickness) !== thicknessFilter) return false;

      const isReserved = RESERVED_STATUSES.has(s.status) || !!s.reserved_for;
      if (reservedFilter === 'RESERVED' && !isReserved) return false;
      if (reservedFilter === 'NOT_RESERVED' && isReserved) return false;

      return true;
    });
  }, [slabs, productFilter, thicknessFilter, reservedFilter]);

  const mediaBase = getMediaBase();

  const openCreate = () => {
    if (productOptionsForForm.length === 0) {
      notifications.show({ message: 'Önce taş cinsi ekleyin.', color: 'yellow' });
      openCreateProduct();
      return;
    }
    setActiveSlab(null);
    setForm({ ...emptyForm, product: productOptionsForForm[0]?.value || '' });
    setPhotoPreviewUrl('');
    setCreateOpen(true);
  };

  const openCreateProduct = () => {
    setProductForm({ name: '', code: '', description: '' });
    setProductOpen(true);
  };

  const openEdit = (slab) => {
    setActiveSlab(slab);
    setForm({
      product: String(slab.product ?? ''),
      barcode: slab.barcode || '',
      width: Number(slab.width || 0),
      length: Number(slab.length || 0),
      thickness: Number(slab.thickness || 0),
      status: slab.status || 'AVAILABLE',
      warehouse_location: slab.warehouse_location || '',
      fire_disposition: slab.fire_disposition || 'UNKNOWN',
      photo_path: '',
    });
    const existingPhoto = slab.photo_url || (slab.photo ? `${mediaBase}${slab.photo}` : '');
    setPhotoPreviewUrl(existingPhoto || '');
    setEditOpen(true);
  };

  const handleUpload = async (file) => {
    if (!file) return;
    try {
      setSaving(true);
      const uploaded = await uploadFile(file);
      setForm((prev) => ({ ...prev, photo_path: uploaded.path || '' }));
      setPhotoPreviewUrl(uploaded.url);
      notifications.show({ title: 'Fotoğraf yüklendi', message: 'Kaydet ile plakaya bağlayabilirsiniz.', color: 'green' });
    } catch (e) {
      notifications.show({
        title: 'Fotoğraf yüklenemedi',
        message: e?.response?.data?.detail || e.message || 'Bilinmeyen hata',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    if (!form.product) {
      notifications.show({ message: 'Taş cinsi seçin.', color: 'yellow' });
      return;
    }
    if (!form.barcode.trim()) {
      notifications.show({ message: 'Barkod zorunlu.', color: 'yellow' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        product: Number(form.product),
        barcode: form.barcode,
        width: form.width,
        length: form.length,
        thickness: form.thickness,
        status: form.status,
        warehouse_location: form.warehouse_location,
        fire_disposition: form.fire_disposition,
      };
      if (form.photo_path) payload.photo_path = form.photo_path;
      await createSlab(payload);
      await refreshSlabs();
      setCreateOpen(false);
      notifications.show({ title: 'Plaka eklendi', message: 'Stok güncellendi.', color: 'green' });
    } catch (e) {
      notifications.show({
        title: 'Plaka eklenemedi',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!activeSlab) return;
    if (!form.product) {
      notifications.show({ message: 'Taş cinsi seçin.', color: 'yellow' });
      return;
    }
    if (!form.barcode.trim()) {
      notifications.show({ message: 'Barkod zorunlu.', color: 'yellow' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        product: Number(form.product),
        barcode: form.barcode,
        width: form.width,
        length: form.length,
        thickness: form.thickness,
        status: form.status,
        warehouse_location: form.warehouse_location,
        fire_disposition: form.fire_disposition,
      };
      if (form.photo_path) payload.photo_path = form.photo_path;
      await updateSlab(activeSlab.id, payload);
      await refreshSlabs();
      setEditOpen(false);
      notifications.show({ title: 'Plaka güncellendi', message: 'Stok güncellendi.', color: 'green' });
    } catch (e) {
      notifications.show({
        title: 'Plaka güncellenemedi',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slab) => {
    const ok = window.confirm(`Silinsin mi?\n\n${slab.product_name || ''} • ${slab.barcode}`);
    if (!ok) return;
    try {
      setSaving(true);
      await deleteSlab(slab.id);
      await refreshSlabs();
      notifications.show({ title: 'Plaka silindi', message: 'Stok güncellendi.', color: 'green' });
    } catch (e) {
      notifications.show({
        title: 'Silinemedi',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitCreateProduct = async () => {
    if (!productForm.name.trim() || !productForm.code.trim()) {
      notifications.show({ message: 'Taş adı ve kodu zorunlu.', color: 'yellow' });
      return;
    }
    try {
      setProductSaving(true);
      const created = await createProductDefinition({
        name: productForm.name.trim(),
        code: productForm.code.trim(),
        description: productForm.description.trim(),
      });
      await refreshProducts();
      setForm((prev) => ({ ...prev, product: String(created.id) }));
      setProductOpen(false);
      notifications.show({ title: 'Taş cinsi eklendi', message: 'Listeler güncellendi.', color: 'green' });
    } catch (e) {
      notifications.show({
        title: 'Taş cinsi eklenemedi',
        message: e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Bilinmeyen hata'),
        color: 'red',
      });
    } finally {
      setProductSaving(false);
    }
  };

  const slabForm = (
    <>
      <Select
        label="Taş cinsi"
        value={form.product}
        onChange={(v) => setForm((p) => ({ ...p, product: v || '' }))}
        data={productOptionsForForm}
        searchable
        required
      />
      {productOptionsForForm.length === 0 && (
        <Text size="xs" color="dimmed">Önce taş cinsi ekleyin.</Text>
      )}

      <TextInput
        mt="sm"
        label="Barkod"
        value={form.barcode}
        onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
        required
      />

      <Group grow mt="sm">
        <NumberInput
          label="Genişlik"
          value={form.width}
          onChange={(v) => setForm((p) => ({ ...p, width: Number(v || 0) }))}
          precision={2}
          min={0}
        />
        <NumberInput
          label="Uzunluk"
          value={form.length}
          onChange={(v) => setForm((p) => ({ ...p, length: Number(v || 0) }))}
          precision={2}
          min={0}
        />
        <NumberInput
          label="Kalınlık (mm)"
          value={form.thickness}
          onChange={(v) => setForm((p) => ({ ...p, thickness: Number(v || 0) }))}
          precision={2}
          min={0}
        />
      </Group>

      <Group grow mt="sm">
        <Select
          label="Durum"
          value={form.status}
          onChange={(v) => setForm((p) => ({ ...p, status: v || 'AVAILABLE' }))}
          data={statusOptions}
          required
        />
        <Select
          label="Fire"
          value={form.fire_disposition}
          onChange={(v) => setForm((p) => ({ ...p, fire_disposition: v || 'UNKNOWN' }))}
          data={fireDispositionOptions}
        />
        <TextInput
          label="Depo lokasyon"
          value={form.warehouse_location}
          onChange={(e) => setForm((p) => ({ ...p, warehouse_location: e.target.value }))}
        />
      </Group>

      <Group mt="sm" position="apart" align="flex-end">
        <div>
          <Text size="sm" weight={500} mb={4}>Plaka fotoğrafı</Text>
          <input
            type="file"
            accept="image/*"
            disabled={saving || productSaving}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
          <Text size="xs" color="dimmed">Fotoğraf önce yüklenir, sonra Kaydet ile plakaya bağlanır.</Text>
        </div>
        {photoPreviewUrl ? (
          <Image src={photoPreviewUrl} height={80} width={120} fit="cover" radius="sm" />
        ) : (
          <Text size="sm" color="dimmed">Önizleme yok</Text>
        )}
      </Group>
    </>
  );

  return (
    <Container size="lg" py="md">
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Plaka" centered>
        {slabForm}
        <Group position="right" mt="md">
          <Button variant="default" onClick={() => setCreateOpen(false)} disabled={saving || productSaving}>İptal</Button>
          <Button onClick={submitCreate} loading={saving}>Kaydet</Button>
        </Group>
      </Modal>

      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title="Plaka Düzenle" centered>
        {slabForm}
        <Group position="right" mt="md">
          <Button variant="default" onClick={() => setEditOpen(false)} disabled={saving || productSaving}>Kapat</Button>
          <Button onClick={submitEdit} loading={saving}>Güncelle</Button>
        </Group>
      </Modal>

      <Modal opened={productOpen} onClose={() => setProductOpen(false)} title="Yeni Taş Cinsi" centered>
        <TextInput
          label="Taş adı"
          value={productForm.name}
          onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <TextInput
          mt="sm"
          label="Kod"
          value={productForm.code}
          onChange={(e) => setProductForm((p) => ({ ...p, code: e.target.value }))}
          required
        />
        <Textarea
          mt="sm"
          label="Açıklama"
          value={productForm.description}
          onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
        />
        <Group position="right" mt="md">
          <Button variant="default" onClick={() => setProductOpen(false)} disabled={productSaving}>İptal</Button>
          <Button onClick={submitCreateProduct} loading={productSaving}>Kaydet</Button>
        </Group>
      </Modal>

      <Group position="apart" mb="md">
        <Title order={2}>Stok (Plakalar)</Title>
        <Group>
          <Button variant="light" onClick={openCreateProduct}>Yeni Taş Cinsi</Button>
          <Button onClick={openCreate}>Yeni Plaka</Button>
          {loading && <Loader size="sm" />}
        </Group>
      </Group>

      <Group grow mb="md">
        <Select
          label="Taş cinsi"
          value={productFilter}
          onChange={setProductFilter}
          data={productOptions}
          searchable
        />

        <Select
          label="Kalınlık"
          value={thicknessFilter}
          onChange={setThicknessFilter}
          data={thicknessOptions}
          searchable
        />

        <Select
          label="Rezerve"
          value={reservedFilter}
          onChange={setReservedFilter}
          data={reservedOptions}
        />
      </Group>

      {!loading && filteredSlabs.length === 0 && (
        <Text color="dimmed">Filtrelere uygun plaka bulunamadı.</Text>
      )}

      <SimpleGrid cols={3} spacing="md" breakpoints={[{ maxWidth: 'md', cols: 2 }, { maxWidth: 'sm', cols: 1 }]}>
        {filteredSlabs.map((s) => {
          const photoUrl = s.photo_url || (s.photo ? `${mediaBase}${s.photo}` : null);

          return (
            <Card key={s.id} shadow="sm" p="md" radius="md" withBorder>
              {photoUrl ? (
                <Image src={photoUrl} height={140} fit="cover" radius="sm" />
              ) : (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text color="dimmed">Fotoğraf yok</Text>
                </div>
              )}

              <Group position="apart" mt="sm" mb={4}>
                <Text weight={600}>{s.product_name || '—'}</Text>
                <Badge color={statusBadgeColor(s.status)} variant="light">
                  {s.status}
                </Badge>
              </Group>

              <Group position="apart" mt={6} mb={6}>
                <Button size="xs" variant="light" onClick={() => openEdit(s)} disabled={saving}>Düzenle</Button>
                <Button size="xs" color="red" variant="light" onClick={() => handleDelete(s)} disabled={saving}>Sil</Button>
              </Group>

              <Text size="sm" color="dimmed">Barkod: {s.barcode}</Text>
              <Text size="sm" color="dimmed">
                {s.width} x {s.length} • {s.thickness} mm
              </Text>
              <Text size="sm" color="dimmed">Alan: {s.area_m2} m²</Text>
              {s.warehouse_location && (
                <Text size="sm" color="dimmed">Lokasyon: {s.warehouse_location}</Text>
              )}
            </Card>
          );
        })}
      </SimpleGrid>
    </Container>
  );
}
