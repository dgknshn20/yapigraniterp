# Çek Yaşam Döngüsü (Cheque Lifecycle) - Backend Dokümantasyonu

## 📋 Özet

Çek modülü, Yapı Granit şirketinin alacağı/verdiği çekleri yönetir. Çek 4 durumdan geçer:

1. **PORTFOLIO** (Portföyde) - Müşteriden alınan çek bizde durur
2. **ENDORSED** (Ciro Edildi) - Çek tedarikçiye ödeme olarak verilir
3. **COLLECTED** (Tahsil Edildi) - Çek bankaya/kasaya yatırılır
4. **BOUNCED** (Karşılıksız) - Çek ödenmez (yeterli bakiye olmaz vs.)

---

## 🏗️ Kod Yapısı

### 1. **Model** (`apps/finance/models.py`)
```python
class Cheque(TimeStampedModel):
    STATUS_CHOICES = [
        ("PORTFOLIO", "Portföyde (Bizde)"),
        ("ENDORSED", "Ciro Edildi (Başkasına Verildi)"),
        ("COLLECTED", "Tahsil Edildi (Bankaya/Kasaya Geçti)"),
        ("BOUNCED", "Karşılıksız/Sorunlu"),
    ]
    
    serial_number: CharField (Unique)          # Çek Seri Numarası (102030)
    drawer_name: CharField                     # Keşideci (Çeki veren kişi adı)
    amount: DecimalField                       # Çek miktarı
    due_date: DateField                        # Vade tarihi
    status: CharField                          # Çekin durumu (yukarıdaki seçeneklerden)
    
    received_from_customer: FK → Customer      # Alınan müşteri
    endorsed_to_supplier: CharField            # Ciro edilen taraf adı (opsiyonel)
    image: ImageField                          # Çek fotoğrafı (opsiyonel)
```

### 2. **Serializers** (`apps/finance/serializers.py`)

#### ChequeSerializer
Çek verilerini okuma/yazma için:
- `days_to_due`: Vadeye kaç gün kaldı (otomatik hesap)
- `customer_name`: Müşteri adı (read-only)
- `status_display`: İnsan tarafından okunabilir statü (read-only)
- Mükerrer seri numarası doğrulaması

#### ChequeActionSerializer
Ciro/Tahsil işlemleri için:
- `target_account_id`: Hedef hesap (Tedarikçi veya Kasa/Banka)
- `description`: İşlem açıklaması (opsiyonel)

### 3. **ViewSet** (`apps/finance/api.py`)

#### Endpoints:

**Temel CRUD:**
- `GET /api/cheques/` - Tüm çekleri listele
- `POST /api/cheques/` - Yeni çek ekle (PORTFOLIO statüsünde oluşturulur)
- `GET /api/cheques/{id}/` - Çek detayları
- `PUT /api/cheques/{id}/` - Çek güncelle (Sadece PORTFOLIO durumunda)
- `DELETE /api/cheques/{id}/` - Çek sil

**Özel Aksiyonlar (Custom Actions):**

##### 1. **Çek Cirosu (Endorse)**
```http
POST /api/cheques/{id}/endorse/
```
**Body:**
```json
{
  "target_account_id": 5,
  "description": "Tedarikçi ödemesi"
}
```
**Neler Olur:**
1. Çek statüsü `PORTFOLIO` → `ENDORSED` değişir
2. `endorsed_to_supplier` alanı doldurulur (hedef hesap adı)
3. Otomatik `Transaction` kaydı oluşturulur:
   - Kaynak: "Çek Portföyü" (helper hesap)
   - Hedef: Tedarikçi hesabı
   - Tür: PAYMENT (Ödeme)

**Response:**
```json
{
  "status": "success",
  "message": "Çek başarıyla ciro edildi. 50,000 TRY Meka Granit hesabına transfer edildi.",
  "cheque_id": 1
}
```

##### 2. **Çek Tahsilatı (Collect)**
```http
POST /api/cheques/{id}/collect/
```
**Body:**
```json
{
  "target_account_id": 3,
  "description": "Banka tahsilatı"
}
```
**Neler Olur:**
1. Çek statüsü `PORTFOLIO` → `COLLECTED` değişir
2. Otomatik `Transaction` kaydı oluşturulur:
   - Kaynak: Müşteri Carisi (Alacak hesabı)
   - Hedef: Kasa/Banka hesabı
   - Tür: COLLECTION (Tahsilat)

**Response:**
```json
{
  "status": "success",
  "message": "Çek tahsil edildi. 50,000 TRY Garanti Bankası hesabına yatırıldı.",
  "cheque_id": 1
}
```

---

## 🔄 Akış Örnekleri

### Senaryo 1: Müşteriden Çek Al → Tedarikçiye Ciro Et

```
1. Müşteri "Sinpaş GYO"dan 50,000 TRY çek alıyoruz (Seri: 102030)
   POST /api/cheques/ → Çek PORTFOLIO durumunda kaydedilir

2. Bu çeki tedarikçi "Meka Granit"e ödeme olarak veriyoruz
   POST /api/cheques/1/endorse/ 
   {
     "target_account_id": 5,  // Meka Granit hesabı
     "description": "Malzeme borcunu ödedik"
   }
   
   Sonuç:
   - Çek statüsü: PORTFOLIO → ENDORSED
   - Transaction oluşturulur: Çek Portföyü → Meka Granit, 50,000 TRY PAYMENT

3. Meka Granit hesabının bakiyesi +50,000 TRY artmış olur
```

### Senaryo 2: Müşteriden Çek Al → Bankaya Yatır

```
1. Müşteri "Ankara Yapı"dan 75,000 TRY çek alıyoruz (Seri: 102031)
   POST /api/cheques/ → Çek PORTFOLIO durumunda kaydedilir

2. Çeki bankaya yatırıyoruz
   POST /api/cheques/2/collect/
   {
     "target_account_id": 2,  // Garanti Bankası hesabı
     "description": "Tahsilat"
   }
   
   Sonuç:
   - Çek statüsü: PORTFOLIO → COLLECTED
   - Transaction oluşturulur: Müşteri Carisi → Garanti Bankası, 75,000 TRY COLLECTION

3. Banka hesabının bakiyesi +75,000 TRY artmış, Müşteri Carisi -75,000 TRY azalmış olur
```

### Senaryo 3: Vade Tarihine Önem Verme

```
Çek detaylarında "days_to_due" alanı otomatik hesaplanır:

GET /api/cheques/1/
{
  "id": 1,
  "serial_number": "102030",
  "amount": 50000,
  "due_date": "2026-01-15",
  "days_to_due": 20,  // Bugünden 20 gün sonra vade
  "status": "PORTFOLIO"
}

Eğer due_date geçmiş olsaydı:
{
  "days_to_due": -5  // 5 gün önce vadesi geçmiş demek!
}
```

---

## 🛡️ Doğrulama Kuralları

### Mükerrer Seri Numarası
```python
# Sistem mükerrer çek numarasına izin vermez
POST /api/cheques/
{
  "serial_number": "102030",  // Zaten mevcut
  ...
}
# Hata: "Bu seri numarasına sahip bir çek zaten sistemde kayıtlı."
```

### Yanlış Statü Kontrolü
```python
# Sadece PORTFOLIO durumundaki çekler ciro/tahsil edilebilir
POST /api/cheques/1/endorse/  # Çek zaten ENDORSED ise
# Hata: "Sadece portföydeki (bizdeki) çekler ciro edilebilir."
```

### Hesap Doğrulama
```python
POST /api/cheques/1/endorse/
{
  "target_account_id": 999  // Geçersiz hesap
}
# Hata: "Geçersiz tedarikçi hesabı."
```

---

## 📊 Double Entry (Çift Taraflı Kayıt)

Çek modülü, her aksiyon'da **otomatik olarak Transaction kaydı oluşturur**:

### Ciro Aksiyon'da:
```
Çek Portföyü (Kaynak) ----[50,000 TRY]--> Tedarikçi (Hedef)
Type: PAYMENT
```

### Tahsil Aksiyon'da:
```
Müşteri Carisi (Kaynak) ----[75,000 TRY]--> Banka (Hedef)
Type: COLLECTION
```

Bu sayede **bakiyeler otomatik olarak güncellenir**. El ile Transaction kaydı oluşturmaya gerek yok!

---

## 🚀 Test Adımları

### 1. Hesapları Oluştur
```bash
curl -X POST http://127.0.0.1:8000/api/accounts/ \
  -H "Authorization: Basic YWRtaW46YWRtaW4xMjM=" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Garanti Bankası",
    "account_type": "BANK",
    "currency": "TRY",
    "initial_balance": 0
  }'

curl -X POST http://127.0.0.1:8000/api/accounts/ \
  -H "Authorization: Basic YWRtaW46YWRtaW4xMjM=" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Meka Granit",
    "account_type": "VENDOR",
    "currency": "TRY",
    "initial_balance": 0
  }'
```

### 2. Müşteri Oluştur (Django Admin)
Admin panel: http://127.0.0.1:8000/admin/
- Customers → Add Customer
- Name: "Sinpaş GYO"

### 3. Çek Ekle
```bash
curl -X POST http://127.0.0.1:8000/api/cheques/ \
  -H "Authorization: Basic YWRtaW46YWRtaW4xMjM=" \
  -H "Content-Type: application/json" \
  -d '{
    "serial_number": "102030",
    "drawer_name": "Sinpaş GYO",
    "amount": 50000,
    "due_date": "2026-01-15",
    "received_from_customer": 1
  }'
```

### 4. Çek Cirosu
```bash
curl -X POST http://127.0.0.1:8000/api/cheques/1/endorse/ \
  -H "Authorization: Basic YWRtaW46YWRtaW4xMjM=" \
  -H "Content-Type: application/json" \
  -d '{
    "target_account_id": 2,
    "description": "Tedarikçi ödemesi"
  }'
```

### 5. Çek Listesini Kontrol Et
```bash
curl http://127.0.0.1:8000/api/cheques/ \
  -H "Authorization: Basic YWRtaW46YWRtaW4xMjM="
```

Response:
```json
[
  {
    "id": 1,
    "serial_number": "102030",
    "drawer_name": "Sinpaş GYO",
    "amount": "50000.00",
    "due_date": "2026-01-15",
    "days_to_due": 20,
    "status": "ENDORSED",
    "status_display": "Ciro Edildi (Başkasına Verildi)",
    "customer_name": "Sinpaş GYO",
    "endorsed_to_supplier": "Meka Granit",
    "created_at": "2025-12-26T10:30:00Z"
  }
]
```

---

## 📝 Notes

- **Çek Portföyü Hesabı**: Ciro işlemi'nde, otomatik olarak "Çek Portföyü" adlı helper hesap oluşturulur. Bu, fiziksel bir hesap değildir - sistemi basit tutmak için oluşturulmuştur.
- **Müşteri Carisi**: Tahsil işlemi'nde, müşteri hesabı kullanılır. Eğer müşterinin ayrı Account'u yoksa, "Müşteri Carisi (Genel)" hesabı oluşturulur.
- **Statü Değişimi**: Çek statüsü sadece özel aksiyonlar (`endorse`, `collect`) aracılığıyla değişebilir. PUT/PATCH istekleriyle değiştirilmez.
- **Vade Tarihi**: Geçmiş vadeleri de sistem kabul eder, ama frontend'de uyarı gösterebilirsiniz.

---

**Created:** 2025-12-26  
**Last Updated:** 2025-12-26  
**Version:** 1.0
