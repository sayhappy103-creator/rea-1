.class public final Lcom/devplay/billing/FreePurchase;
.super Ljava/lang/Object;
.source "crg-offline-patch"

# interfaces
.implements Lcom/devplay/billing/IPurchase;


# instance fields
.field private final productId:Ljava/lang/String;

.field private final purchaseTime:J


# direct methods
.method public constructor <init>(Ljava/lang/String;J)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/devplay/billing/FreePurchase;->productId:Ljava/lang/String;

    iput-wide p2, p0, Lcom/devplay/billing/FreePurchase;->purchaseTime:J

    return-void
.end method


# virtual methods
.method public getPayload()Ljava/lang/String;
    .locals 1

    const-string v0, ""

    return-object v0
.end method

.method public getProductIds()Ljava/util/List;
    .locals 2

    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    iget-object v1, p0, Lcom/devplay/billing/FreePurchase;->productId:Ljava/lang/String;

    if-eqz v1, :skip

    invoke-virtual {v0, v1}, Ljava/util/ArrayList;->add(Ljava/lang/Object;)Z

    :skip
    return-object v0
.end method

.method public getPurchaseTime()Ljava/lang/Long;
    .locals 2

    iget-wide v0, p0, Lcom/devplay/billing/FreePurchase;->purchaseTime:J

    invoke-static {v0, v1}, Ljava/lang/Long;->valueOf(J)Ljava/lang/Long;

    move-result-object v0

    return-object v0
.end method

.method public getPurchaseToken()Ljava/lang/String;
    .locals 2

    const-string v0, "free-token-"

    iget-object v1, p0, Lcom/devplay/billing/FreePurchase;->productId:Ljava/lang/String;

    if-eqz v1, :skip

    invoke-virtual {v0, v1}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    :skip
    return-object v0
.end method

.method public getReceipt()Ljava/lang/String;
    .locals 1

    const-string v0, ""

    return-object v0
.end method

.method public getSignature()Ljava/lang/String;
    .locals 1

    const-string v0, ""

    return-object v0
.end method

.method public getTransactionId()Ljava/lang/String;
    .locals 2

    const-string v0, "free-tx-"

    iget-object v1, p0, Lcom/devplay/billing/FreePurchase;->productId:Ljava/lang/String;

    if-eqz v1, :skip

    invoke-virtual {v0, v1}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    :skip
    return-object v0
.end method

.method public isAcknowledged()Z
    .locals 1

    const/4 v0, 0x1

    return v0
.end method
