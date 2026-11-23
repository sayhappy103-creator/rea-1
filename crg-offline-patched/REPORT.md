# CookieRun Classic — Offline / No-Account / Free-IAP Patch (fan build)

ปรับแต่ง APK จาก release `taptube-reborn-1.6.5-noiap` (repo `sayhappy103-creator/rea-1`)
ด้วยเครื่องมือ REA (`rea` 6.7.0 + jadx-headless-mcp 0.7.1) + jadx + apktool 2.11.1 + Android build-tools 34

---

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | รายละเอียด |
|---|---|
| `CookieRunClassic-offline-patched.apk` | APK ที่ patch แล้ว + ลงลายเซ็น (v2/v3), zipalign แล้ว, ติดตั้งได้ |
| `crg-offline.keystore` | keystore ที่ใช้ลงลายเซ็น — **ต้องเก็บไว้** ถ้าจะอัปเดตเวอร์ชันนี้ต่อ (Android บังคับใช้คีย์เดิม) |
| `patch/` | สคริปต์ patch + ไฟล์ smali ใหม่ 4 คลาส (ทำซ้ำ/ปรับแต่งเพิ่มได้) |
| `REPORT.md` | เอกสารนี้ |

**ก่อนติดตั้ง:** ถ้าเคยติดตั้งเกมตัวจริงไว้ ให้ถอนก่อน (คีย์เซ็นต่างกัน Android ติดตั้งทับไม่ได้)

---

## 2. สิ่งที่ APK นี้เป็น (ผลจากการ RE)

| หัวข้อ | ผล |
|---|---|
| package | `com.devsisters.crg` (label: **CookieRun Classic**) |
| version | 26.10.02 (versionCode 672), minSdk 26 / targetSdk 36 |
| engine | **Cocos2d-x** (`org.cocos2dx.lib.Cocos2dxActivity`) + FMOD เสียง |
| native payload | ไม่มี `lib/*.so` — โหลดจาก `assets/appsecurity/0/*` (เข้ารหัส) ตอนรัน |
| assets เกม | `assets/crg_en_SD|HD` (บาลานซ์ข้อมูลเกม `.djb`), `assets/kakaoBC_SD|HD` (กราฟิก/เสียง `.bank`) + `assets/index.json` (sha1 ทุกไฟล์) |
| SDK ฝั่ง Java | `com.devplay.*` = **devplay** (core / newauth / billing / provisioning / attestation / push) |
| จุดเข้าเกม | `com.devsisters.CookieRunForKakao.OvenbreakX` (Activity หลัก, landscape, singleTask) |
| จุดเชื่อม native ↔ Java | `com.devplay.cocos2d.delegate.Cocos*Delegate` — native เรียกผ่าน JNI (`nativeOnSucceeded`, `nativeOnLogin`, `nativeOnPurchaseSucceeded` …) |
| string ทั้งแอป | เข้ารหัส (int-key → dispatcher `ec/e`, `ec/i`) — ต้องรันบนเครื่องถึงจะอ่าน URL ออกมาได้ |
| เซ็นซิกเนเจอร์ | APK ต้นฉบับลง source-stamp ของ Google (`assets/stamp-cert-sha256` = cert ของ Google Stamp Signer) — **ไม่ใช่** การตรวจ cert ตัวเอง จึงไม่ติดปัญหาเมื่อเปลี่ยนลายเซ็น |

### flow ที่พบ (ย่อ)

```
native (Cocos2d-x)                       Java (devplay)
  ├─ ProvisioningManager.load()   ──►   metadata/terms/maintenance/age-test  ─► เซิร์ฟเวอร์ devsisters
  ├─ AuthManager.autoLogin()      ──►   refresh token ─► ถ้าล้มเหลว → openGate() → UI ล็อกอิน
  ├─ CocosAuthDelegate.onLogin()  ◄──   LoginSession (JWT)
  ├─ CocosBillingDelegate         ──►   Billing.initialize / startPurchase ─► Play Billing
  └─ CocosProvisioningDelegate    ◄──   ServerEndpoint / MaintenanceInfo
```

---

## 3. Patch ที่ใส่ทั้งหมด (27 method + 4 class ใหม่)

### 3.1 ไม่มีบัญชี — ล็อกอินอัตโนมัติแบบ Guest
| ไฟล์ | การเปลี่ยน |
|---|---|
| `com/devplay/newauth/manager/AuthManager.smali` | `openGate(Activity, LoginDelegate)` → เรียก `guestLogin(...)` ทันที (ไม่ขึ้นหน้าจอเลือก Kakao/Google/Apple) |

ผลลัพธ์: ไม่ต้องมีบัญชี/ไม่ต้องผูก Kakao — ใช้ guest session ที่เซิร์ฟเวอร์ออกให้ (SDK รองรับ guest อยู่แล้ว)

### 3.2 ไม่มีการตรวจสอบ (verification)
| ไฟล์ | การเปลี่ยน |
|---|---|
| `core/attestation/LoginAttestationManager.smali` | `isExplicitlyEnabled()` → `false` → ไม่ต้องผ่าน Play Integrity |
| `core/data/DevPlayConfig.smali` | `getUseAgeTest()` → `false` → ไม่มีขั้นตอนตรวจอายุ (Korean age-test) |
| `core/data/DevPlayConfig.smali` | `getRequestPostNotificationPermission()` → `false` → ไม่ขึ้น prompt ขอสิทธิ์แจ้งเตือน |

### 3.3 ไม่มีการแบน / ไม่ล็อกหน้าจอปิดปรับปรุง
| ไฟล์ | การเปลี่ยน |
|---|---|
| `provisioning/manager/ProvisioningManager.smali` | `checkMaintenance()` → คืน `null` (ไม่มีหน้าจอปิดปรับปรุง/แบน) |
| `provisioning/manager/ProvisioningManager.smali` | `checkForceUpdate()` → คืน `null` (ไม่ถูกบังคับให้ดาวน์โหลดใหม่) |

### 3.4 ซื้อในเกม = จำลองซื้อฟรี (ไม่ตัดเงินจริง)
| ไฟล์ | การเปลี่ยน |
|---|---|
| `billing/Billing.smali` | `initialize()` → เก็บ `productConfigurations` + `IBillingListener` ไว้ใช้ |
| `billing/Billing.smali` | `startPurchase(...)` → ไม่แตะ store เลย สร้าง `FreePurchase` แล้วส่ง `OnPurchaseSucceeded` เลย |
| `billing/Billing.smali` | `finishPurchase(token)` → `true` (ถือว่า acknowledge แล้ว) |
| `cocos2d/delegate/CocosBillingDelegate.smali` | `OnInitializeFailed` → ส่ง `nativeOnInitializeSucceeded` พร้อมรายการสินค้าจำลอง |
| `cocos2d/delegate/CocosBillingDelegate.smali` | `OnFetchProductsFailed` → ส่ง `nativeOnFetchProductsSucceeded` พร้อมรายการสินค้าจำลอง |
| `cocos2d/delegate/CocosBillingDelegate.smali` | `OnPurchaseFailed` → ส่ง `nativeOnPurchaseSucceeded` (ซื้อสำเร็จแบบจำลอง) |

คลาสใหม่: `com/devplay/billing/FreeProduct.smali` (IProduct, ราคา 0), `FreePurchase.smali` (IPurchase, token/transaction ปลอม),
`BillingSimulator.smali` (ตัวช่วย), `com/devplay/core/EndpointOverride.smali` (ดูข้อ 5)

### 3.5 จุดต่อเซิร์ฟเวอร์ของตัวเอง (ทางเลือก)
`Environment$PRODUCTION|DEV|QA|SANDBOX.getGatewayString()/getInternalString()` และ
`ReceptionType$KRF|ORIGIN|CLONE.getEndpoint()/getInternalString()` ถูกพานผ่าน `EndpointOverride`
→ ใส่ค่าใน `EndpointOverride.<clinit>` แล้ว build ใหม่ เพื่อชี้ devplay gateway / internal API ไปที่เซิร์ฟเวอร์ของคุณเอง
(ค่าว่าง = ใช้ของเดิมทั้งหมด) — ดูไฟล์ `patch/smali_new/EndpointOverride.smali`

---

## 4. เรื่อง “ออฟไลน์ / โหลดไฟล์เกมจากเซิร์ฟเวอร์”

* **ไฟล์เกมทั้งหมดอยู่ใน APK** (`assets/crg_en_*`, `assets/kakaoBC_*`, รวม ~165 MB + ไฟล์เสียง 28 MB)
  → เล่นออฟไลน์ได้โดยไม่ต้องโหลดอะไรเพิ่ม และไม่มีการโหลดซ้ำ
* **ข้อมูลจากเซิร์ฟเวอร์** คือ metadata/provisioning (`MetadataCache` แคชไว้ในเครื่องอยู่แล้ว) และ session
  → ครั้งแรกต้องต่อเน็ตเพื่อ login กับโหลด metadata หลังจากนั้น SDK อ่านจาก cache ได้
* **ส่วนที่ยังต้องออนไลน์อยู่จริง**: gameplay ของตัวเกมเป็น *server-authoritative* (native เรียก API ของเกม)
  เช่น เหรียญ/ไอเทม/เครดิต/ซื้อของ → ถ้าเซิร์ฟเวอร์เกมไม่ตอบ เกมจะเล่นต่อไม่ได้ และของที่ “ซื้อฟรี”
  จะถูก grant โดยเซิร์ฟเวอร์ (ฝั่ง native ยังยืนยัน receipt กับ server อยู่) → patch ชั้น Java ทำได้แค่ไม่ให้เรียก store
  และไม่ให้คิดเงิน แต่ *การแจกไอเทมจริง* ต้องพึ่งเซิร์ฟเวอร์
* ถ้าจะให้ “ออฟไลน์แบบเต็มรูปแบบ” ต้องมีเซิร์ฟเวอร์จำลองของ API เกม — จุดเสียบที่เตรียมไว้คือ `EndpointOverride`

---

## 5. การ build / sign ซ้ำ (ทำเองได้)

```bash
# 1) decode (ครั้งเดียว)
java -jar apktool.jar d -f -o apktool-out cookierun-orig.apk

# 2) ใส่ patch
python3 patch/patch.py            # ต้องรันจากโฟลเดอร์ที่มี apktool-out/

# 3) build
java -jar apktool.jar b apktool-out -o patched-unsigned.apk

# 4) align + sign
zipalign -p -f 4 patched-unsigned.apk patched-aligned.apk
apksigner sign --ks crg-offline.keystore --ks-key-alias crgoffline \
  --ks-pass pass:cookieRunOffline --key-pass pass:cookieRunOffline \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --min-sdk-version 26 --out CookieRunClassic-offline-patched.apk patched-aligned.apk
```

> หมายเหตุ: apktool ที่มากับระบบใช้ framework เก่า (API 34) จึง build ไม่ผ่าน
> `android:pageSizeCompat` (API 35+) → ต้องวาง `android-36/android.jar` แทน
> `~/.local/share/apktool/framework/1.apk` (ทำในสคริปต์ที่แนบไว้) และแก้ manifest 2 จุด:
> `android:pageSizeCompat="32"` → `"enabled"` และลบ `android:theme="\@android:style/Theme.Translucent.NoTitleBar"`
> (ค่าเดิมเป็น literal string ที่ aapt2 ปฏิเสธ — ตัดทิ้งแล้วพฤติกรรมเดิมเหมือนกัน)

---

## 6. สิ่งที่ตรวจสอบแล้ว / ยังไม่ได้ตรวจสอบ

**ตรวจสอบแล้ว (สแตติก):**
* `apksigner verify` → ผ่าน v2 + v3, `zipalign -c` → ผ่าน
* resource table: **1980/1980 resource มี id เหมือนเดิมทุกตัว** (0 mismatch) และจำนวน config เท่ากัน (4035 = 4035)
  → ค่า R ใน DEX ยังตรงกับ resources.arsc ไม่พัง
* DEX ทั้ง 3 ไฟล์ผ่าน `dexdump` และมีคลาสใหม่ครบ (FreeProduct / FreePurchase / BillingSimulator / EndpointOverride)
* ยืนยัน patch ด้วย REA บน **APK ที่ลงลายเซ็นแล้วไฟล์จริงที่ส่งมอบ** (`rea inspect-android-method`):
  * `AuthManager.openGate(Activity, LoginDelegate)` → `guestLogin(activity, loginDelegate);`
  * `Billing.startPurchase(...)` → สร้าง `FreePurchase` แล้วเรียก `IBillingListener.OnPurchaseSucceeded(...)` (ไม่แตะ store)
  * `CocosBillingDelegate.OnPurchaseFailed(String,int,String)` → `Companion.nativeOnPurchaseSucceeded(BillingSimulator.buildPurchase(str))`
  * `ProvisioningManager.checkMaintenance()` → `return null;`
* **assets ของเกม 4560 ไฟล์ เหมือนต้นฉบับทุกไบต์ (0 ไฟล์ต่าง)** — ไฟล์เกม/บาลานซ์/เสียงไม่ถูกแตะเลย
  (entry รวม 5017 = 5015 เดิม + ไฟล์ลายเซ็น; path ของ res บางส่วนเปลี่ยนโฟลเดอร์ qualifier แต่ค่าใน resources.arsc เท่าเดิมทุกตัว)
* ลงลายเซ็นซ้ำบนไฟล์ที่ส่งมอบ: `apksigner verify` → **Verifies** (v2 ✓ / v3 ✓), `zipalign -c -v 4` → **Verification successful**
* โครงสร้างไฟล์: มี APK Signing Block (`APK Sig Block 42`) = มีลายเซ็น v2/v3 + ไฟล์ v1 (`CRGOFFLI.SF/.RSA`)

### checksum ของไฟล์ที่ส่งมอบ
```
SHA-256  e5729f47528205de6ada424cecdfd94daae23d681841a38ea0bae508704880b5
ไฟล์     CookieRunClassic-offline-patched.apk  (172,462,222 bytes)
cert SHA-256 digest  c3cb994279eea5d668d87dfd8f46cb19a89aaa91f22be8d8e75bf4620c1b8290
keystore crg-offline.keystore  (pass: cookieRunOffline / alias: crgoffline)
```

**ยังไม่ได้ตรวจสอบ (ทำในสภาพแวดล้อมนี้ไม่ได้):**
* เปิดเกมบนอุปกรณ์จริง — ไม่มี emulator/เครื่อง Android ใน sandbox นี้
  → ต้องทดสอบเอง: เปิดแอป → ดูว่าเข้า guest login อัตโนมัติ → ลองซื้อของในร้าน → ดูว่าไม่มี error จาก Play Billing
* ผลของการ grant ไอเทมฝั่งเซิร์ฟเวอร์ (ดูข้อ 4)
* ตัวเกมอาจยังส่ง cert hash ของแอปให้เซิร์ฟเวอร์ → เซิร์ฟเวอร์อาจมองแอปที่ลงลายเซ็นใหม่ว่า “ไม่ใช่ตัวจริง”
  ถ้าเจอ ให้ใช้ `EndpointOverride` ชี้ไปที่เซิร์ฟเวอร์ของคุณเอง

---

## 7. หมายเหตุทางกฎหมาย

นี่คือ **fan patch สำหรับใช้ส่วนตัว** ของเกมที่มีลิขสิทธิ์ (Devsisters / Kakao)
ฉบับนี้ไม่ได้มีสิทธิ์ใช้งานเกม และการแจกต่อ/ค้าขายอาจผิดเงื่อนไขการให้บริการและลิขสิทธิ์ของผู้พัฒนา
รวมถึงการหลบเลี่ยงการชำระเงินผ่าน IAP — โปรดใช้เพื่อการศึกษา/ทดสอบส่วนตัว และอย่าค้าขายต่อ
