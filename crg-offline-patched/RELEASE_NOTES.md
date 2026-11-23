# CookieRun Classic — Offline / No-Account / Free-IAP (fan patch)

APK ที่แก้ไขจาก release `taptube-reborn-1.6.5-noiap` ของ repo นี้ (fork ของ `morluto/rea`)
โดยใช้ **REA** (`rea` 6.7.0 + jadx-headless-mcp 0.7.1) + jadx + apktool 2.11.1 + Android build-tools 34

| | |
|---|---|
| package | `com.devsisters.crg` (label **CookieRun Classic**) |
| version | 26.10.02 (versionCode 672) · minSdk 26 / targetSdk 36 |
| engine | Cocos2d-x + FMOD (native payload เข้ารหัสใน `assets/appsecurity`) |
| ขนาด | ~172 MB (ไฟล์เกมทั้งหมดอยู่ใน APK → เล่นออฟไลน์ได้) |
| ลายเซ็น | v2 + v3 (keystore ของผู้ปลูกแต่ง, ไม่ใช่ของ Devsisters) |

## สิ่งที่แก้ (27 method + คลาสใหม่ 4)

| เป้าหมาย | การแก้ |
|---|---|
| **ไม่มีบัญชี** | `AuthManager.openGate()` → `guestLogin()` อัตโนมัติ ไม่ขึ้นหน้าล็อกอิน Kakao/Google |
| **ไม่มีการตรวจสอบ** | ปิด Play Integrity attestation, age-test (ตรวจอายุ), prompt สิทธิ์แจ้งเตือน |
| **ไม่มีการแบน** | `checkMaintenance()` / `checkForceUpdate()` → `null` (ไม่มีหน้าปิดปรับปรุง ไม่ถูกบังคับโหลดใหม่) |
| **ซื้อในเกม = ฟรี** | `Billing.startPurchase()` ไม่แตะ store เลย → สร้าง `FreePurchase` จำลองแล้วส่ง `OnPurchaseSucceeded`; init/fetch/purchase ที่ล้มเหลวก็ถูกแปลงเป็น "สำเร็จ" |
| **จุดเสียบเซิร์ฟเวอร์ตัวเอง** | `EndpointOverride` (ค่าว่าง = ใช้เซิร์ฟเวอร์เดิม) |

## ติดตั้ง

1. ถอน CookieRun Classic ตัวจริงออกก่อน (ลายเซ็นต่างกัน Android ติดตั้งทับไม่ได้)
2. ติดตั้ง `CookieRunClassic-offline-patched.apk`
3. ครั้งแรกต้องต่อเน็ต (login guest + โหลด metadata จากเซิร์ฟเวอร์) หลังจากนั้นเล่นออฟไลน์ได้ ไม่ต้องโหลดซ้ำ

## ข้อจำกัด (อ่านก่อนใช้)

* **ยังไม่ได้ทดสอบบนเครื่องจริง** — build/verify ได้แค่ระดับสถิติ (ลายเซ็น, zipalign, resource id 1980/1980 ตรงเดิม, assets 4560 ไฟล์เหมือนต้นฉบับทุกไบต์) ต้องลองเองบนเครื่อง
* **เกมเป็น server-authoritative** — เหรียญ/ไอเทม/การ grant ของจริงยังต้องผ่านเซิร์ฟเวอร์เกม (native ยืนยัน receipt เอง) patch ชั้น Java ทำได้แค่ "ไม่คิดเงิน + ไม่พัง"
* ถ้าเซิร์ฟเวอร์ปฏิเสธแอปที่ลงลายเซ็นใหม่ (cert hash ไม่ตรง) ให้ใช้ `EndpointOverride` ชี้ไปที่เซิร์ฟเวอร์ของคุณเอง

## ไฟล์ในโฟลเดอร์นี้

* `REPORT.md` — รายงาน RE ฉบับเต็ม (โครงสร้าง APK, flow ทั้งหมด, รายการ patch, วิธี build/sign ซ้ำ)
* `patch/patch.py` — สคริปต์ patch (รันซ้ำได้)
* `patch/smali_new/*.smali` — คลาสใหม่ 4 ตัวที่เพิ่มเข้าไป
* `upload-apk.sh` — สคริปต์สร้าง Release + อัพ APK เป็น asset (ต้องใช้ PAT scope `repo`)

## หมายเหตุทางกฎหมาย

Fan patch สำหรับใช้ส่วนตัวของเกมที่มีลิขสิทธิ์ (Devsisters / Kakao) — ฉบับนี้ไม่ได้มีสิทธิ์ใช้งานเกม
การแจกต่อ/ค้าขายอาจผิดเงื่อนไขการให้บริการและลิขสิทธิ์ของผู้พัฒนา รวมถึงการหลบเลี่ยงการชำระเงินผ่าน IAP
โปรดใช้เพื่อการศึกษา/ทดสอบส่วนตัว และอย่าค้าขายต่อ
