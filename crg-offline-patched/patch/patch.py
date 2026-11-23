#!/usr/bin/env python3
"""Apply the offline/no-account/no-IAP patch set to the apktool-decoded tree."""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path("/workspace/work/apktool-out")
NEW = Path("/workspace/work/smali_new")
report = []


def find_method(text, signature):
    """Return (start, end) span of the method whose .method line matches signature."""
    idx = text.find(".method " + signature)
    if idx < 0:
        return None
    end = text.find("\n.end method", idx)
    if end < 0:
        return None
    return idx, end + len("\n.end method")


def replace_method(path, signature, new_body, label, require=()):
    p = ROOT / path
    text = p.read_text()
    for token in require:
        if token not in text:
            report.append(f"  MISS  {label}  (field {token} absent)")
            return False
    span = find_method(text, signature)
    if not span:
        report.append(f"  MISS  {label}  ({signature})")
        return False
    text = text[: span[0]] + new_body + text[span[1] :]
    p.write_text(text)
    report.append(f"  OK    {label}")
    return True


def insert_after(path, anchor, snippet, label):
    p = ROOT / path
    text = p.read_text()
    if snippet.strip() in text:
        report.append(f"  SKIP  {label} (already applied)")
        return True
    idx = text.find(anchor)
    if idx < 0:
        report.append(f"  MISS  {label} (anchor not found)")
        return False
    idx += len(anchor)
    text = text[:idx] + snippet + text[idx:]
    p.write_text(text)
    report.append(f"  OK    {label}")
    return True


def append_block(path, block, label):
    p = ROOT / path
    text = p.read_text()
    if block.strip() in text:
        report.append(f"  SKIP  {label}")
        return True
    p.write_text(text.rstrip() + "\n\n" + block.strip() + "\n")
    report.append(f"  OK    {label}")
    return True


# --------------------------------------------------------------------------
# 1. new helper classes
# --------------------------------------------------------------------------
for name, dest in [
    ("FreeProduct.smali", "smali/com/devplay/billing/FreeProduct.smali"),
    ("FreePurchase.smali", "smali/com/devplay/billing/FreePurchase.smali"),
    ("BillingSimulator.smali", "smali/com/devplay/billing/BillingSimulator.smali"),
    ("EndpointOverride.smali", "smali/com/devplay/core/EndpointOverride.smali"),
]:
    target = ROOT / dest
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(NEW / name, target)
    report.append(f"  NEW   {dest}")

# --------------------------------------------------------------------------
# 2. no maintenance / ban screen, no forced update
# --------------------------------------------------------------------------
NULL_MAINTENANCE = """.method private final checkMaintenance()Lcom/devplay/provisioning/manager/AppMaintenanceInfo;
    .locals 1

    const/4 v0, 0x0

    return-object v0
.end method"""

replace_method(
    "smali/com/devplay/provisioning/manager/ProvisioningManager.smali",
    "private final checkMaintenance()Lcom/devplay/provisioning/manager/AppMaintenanceInfo;",
    NULL_MAINTENANCE,
    "P1 maintenance gate -> always clear",
)

replace_method(
    "smali/com/devplay/provisioning/manager/ProvisioningManager.smali",
    "private final checkForceUpdate()Lcom/devplay/provisioning/manager/AppMaintenanceInfo;",
    NULL_MAINTENANCE,
    "P2 force-update gate -> always clear",
)

# --------------------------------------------------------------------------
# 3. no Korean age-test, no notification permission prompt
# --------------------------------------------------------------------------
replace_method(
    "smali/com/devplay/core/data/DevPlayConfig.smali",
    "public final getUseAgeTest()Z",
    """.method public final getUseAgeTest()Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method""",
    "P3 age-test verification -> disabled",
)

replace_method(
    "smali/com/devplay/core/data/DevPlayConfig.smali",
    "public final getRequestPostNotificationPermission()Z",
    """.method public final getRequestPostNotificationPermission()Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method""",
    "P4 notification permission prompt -> disabled",
)

# --------------------------------------------------------------------------
# 4. no Play Integrity attestation requirement
# --------------------------------------------------------------------------
replace_method(
    "smali/com/devplay/core/attestation/LoginAttestationManager.smali",
    "private final isExplicitlyEnabled()Z",
    """.method private final isExplicitlyEnabled()Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method""",
    "P5 Play Integrity attestation -> not required",
)

# --------------------------------------------------------------------------
# 5. no account gate: auto guest login
# --------------------------------------------------------------------------
replace_method(
    "smali/com/devplay/newauth/manager/AuthManager.smali",
    "public static final openGate(Landroid/app/Activity;Lcom/devplay/newauth/manager/delegate/LoginDelegate;)V",
    """.method public static final openGate(Landroid/app/Activity;Lcom/devplay/newauth/manager/delegate/LoginDelegate;)V
    .locals 0

    invoke-static {p0, p1}, Lcom/devplay/newauth/manager/AuthManager;->guestLogin(Landroid/app/Activity;Lcom/devplay/newauth/manager/delegate/LoginDelegate;)V

    return-void
.end method""",
    "P6 login gate -> automatic guest login (no account)",
)

# --------------------------------------------------------------------------
# 6. billing: simulated free purchases
# --------------------------------------------------------------------------
STASH = """
    invoke-static {p2}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->setProductConfigurations(Ljava/util/List;)V

    invoke-static {p3}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->setBillingListener(Lcom/devplay/billing/IBillingListener;)V
"""

insert_after(
    "smali/com/devplay/billing/Billing.smali",
    ".method public static final initialize(Landroid/app/Activity;Ljava/lang/String;Ljava/util/List;Lcom/devplay/billing/IBillingListener;)V\n    .locals 10\n",
    STASH,
    "P7 stash product config + listener for free billing",
)

replace_method(
    "smali/com/devplay/billing/Billing.smali",
    "public static final startPurchase(Landroid/app/Activity;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
    """.method public static final startPurchase(Landroid/app/Activity;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .locals 3

    invoke-static {p2, p1}, Lcom/devplay/billing/BillingSimulator;->productIdOf(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    invoke-static {v0}, Lcom/devplay/billing/BillingSimulator;->buildPurchase(Ljava/lang/String;)Lcom/devplay/billing/FreePurchase;

    move-result-object v0

    sget-object v1, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->billingListener:Lcom/devplay/billing/IBillingListener;

    if-eqz v1, :done

    invoke-interface {v1, v0}, Lcom/devplay/billing/IBillingListener;->OnPurchaseSucceeded(Lcom/devplay/billing/IPurchase;)V

    :done
    return-void
.end method""",
    "P8 startPurchase -> simulated free purchase (no store)",
)

replace_method(
    "smali/com/devplay/billing/Billing.smali",
    "public static final finishPurchase(Ljava/lang/String;)Z",
    """.method public static final finishPurchase(Ljava/lang/String;)Z
    .locals 1

    const/4 v0, 0x1

    return v0
.end method""",
    "P9 finishPurchase -> acknowledged (simulated)",
)

DELEGATE_FIELDS = """
.field public static productConfigurations:Ljava/util/List;

.field public static billingListener:Lcom/devplay/billing/IBillingListener;
"""

replace_method(
    "smali/com/devplay/cocos2d/delegate/CocosBillingDelegate.smali",
    "public OnInitializeFailed(ILjava/lang/String;)V",
    """.method public OnInitializeFailed(ILjava/lang/String;)V
    .locals 2

    invoke-static {}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->freeProducts()Ljava/util/List;

    move-result-object v0

    sget-object v1, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->Companion:Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;

    invoke-virtual {v1, v0}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;->nativeOnInitializeSucceeded(Ljava/util/List;)V

    return-void
.end method""",
    "P10 store init failure -> fake product list",
)

replace_method(
    "smali/com/devplay/cocos2d/delegate/CocosBillingDelegate.smali",
    "public OnFetchProductsFailed(ILjava/lang/String;)V",
    """.method public OnFetchProductsFailed(ILjava/lang/String;)V
    .locals 2

    invoke-static {}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->freeProducts()Ljava/util/List;

    move-result-object v0

    sget-object v1, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->Companion:Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;

    invoke-virtual {v1, v0}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;->nativeOnFetchProductsSucceeded(Ljava/util/List;)V

    return-void
.end method""",
    "P11 product fetch failure -> fake product list",
)

replace_method(
    "smali/com/devplay/cocos2d/delegate/CocosBillingDelegate.smali",
    "public OnPurchaseFailed(Ljava/lang/String;ILjava/lang/String;)V",
    """.method public OnPurchaseFailed(Ljava/lang/String;ILjava/lang/String;)V
    .locals 2

    invoke-static {p1}, Lcom/devplay/billing/BillingSimulator;->buildPurchase(Ljava/lang/String;)Lcom/devplay/billing/FreePurchase;

    move-result-object v0

    sget-object v1, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->Companion:Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;

    invoke-virtual {v1, v0}, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate$Companion;->nativeOnPurchaseSucceeded(Lcom/devplay/billing/IPurchase;)V

    return-void
.end method""",
    "P12 purchase failure -> fake successful purchase",
)

append_block(
    "smali/com/devplay/cocos2d/delegate/CocosBillingDelegate.smali",
    DELEGATE_FIELDS
    + """
.method public static setProductConfigurations(Ljava/util/List;)V
    .locals 0

    sput-object p0, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->productConfigurations:Ljava/util/List;

    return-void
.end method

.method public static setBillingListener(Lcom/devplay/billing/IBillingListener;)V
    .locals 0

    sput-object p0, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->billingListener:Lcom/devplay/billing/IBillingListener;

    return-void
.end method

.method public static freeProducts()Ljava/util/List;
    .locals 2

    sget-object v0, Lcom/devplay/cocos2d/delegate/CocosBillingDelegate;->productConfigurations:Ljava/util/List;

    if-nez v0, :have

    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    :have
    invoke-static {v0}, Lcom/devplay/billing/BillingSimulator;->buildProducts(Ljava/util/List;)Ljava/util/List;

    move-result-object v0

    return-object v0
.end method""",
    "P13 CocosBillingDelegate: product/listener holders + freeProducts()",
)

# --------------------------------------------------------------------------
# 7. optional server redirection hook
# --------------------------------------------------------------------------
for cls in ["Environment$PRODUCTION", "Environment$DEV", "Environment$QA", "Environment$SANDBOX"]:
    path = f"smali/com/devplay/core/data/{cls}.smali"
    replace_method(
        path,
        "public getGatewayString()Ljava/lang/String;",
        """.method public getGatewayString()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/devplay/core/data/%s;->gatewayString:Ljava/lang/String;

    invoke-static {v0}, Lcom/devplay/core/EndpointOverride;->gateway(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method""" % cls,
        f"P14 {cls}.getGatewayString -> EndpointOverride",
        require=(".field private final gatewayString:Ljava/lang/String;",),
    )
    replace_method(
        path,
        "public getInternalString()Ljava/lang/String;",
        """.method public getInternalString()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/devplay/core/data/%s;->internalString:Ljava/lang/String;

    invoke-static {v0}, Lcom/devplay/core/EndpointOverride;->internal(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method""" % cls,
        f"P15 {cls}.getInternalString -> EndpointOverride",
        require=(".field private final internalString:Ljava/lang/String;",),
    )

for cls in ["ReceptionType$KRF", "ReceptionType$ORIGIN", "ReceptionType$CLONE"]:
    path = f"smali/com/devplay/core/data/{cls}.smali"
    replace_method(
        path,
        "public getInternalString()Ljava/lang/String;",
        """.method public getInternalString()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/devplay/core/data/%s;->internalString:Ljava/lang/String;

    invoke-static {v0}, Lcom/devplay/core/EndpointOverride;->internal(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method""" % cls,
        f"P16 {cls}.getInternalString -> EndpointOverride",
        require=(".field private final internalString:Ljava/lang/String;",),
    )
    replace_method(
        path,
        "public getEndpoint()Ljava/lang/String;",
        """.method public getEndpoint()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/devplay/core/data/%s;->endpoint:Ljava/lang/String;

    invoke-static {v0}, Lcom/devplay/core/EndpointOverride;->gateway(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method""" % cls,
        f"P17 {cls}.getEndpoint -> EndpointOverride",
        require=(".field private final endpoint:Ljava/lang/String;",),
    )

print("\n".join(report))
print(f"\napplied: {sum(1 for r in report if r.strip().startswith('OK'))}  "
      f"new: {sum(1 for r in report if r.strip().startswith('NEW'))}  "
      f"missing: {sum(1 for r in report if r.strip().startswith('MISS'))}")
