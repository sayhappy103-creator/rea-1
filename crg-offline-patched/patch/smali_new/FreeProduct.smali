.class public final Lcom/devplay/billing/FreeProduct;
.super Ljava/lang/Object;
.source "crg-offline-patch"

# interfaces
.implements Lcom/devplay/billing/IProduct;


# instance fields
.field private final productId:Ljava/lang/String;

.field private final productType:Lcom/devplay/billing/ProductType;

.field private final productTypeInt:I


# direct methods
.method public constructor <init>(Ljava/lang/String;Lcom/devplay/billing/ProductType;I)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/devplay/billing/FreeProduct;->productId:Ljava/lang/String;

    iput-object p2, p0, Lcom/devplay/billing/FreeProduct;->productType:Lcom/devplay/billing/ProductType;

    iput p3, p0, Lcom/devplay/billing/FreeProduct;->productTypeInt:I

    return-void
.end method


# virtual methods
.method public getGalaxyStoreSubscriptionOption()Lcom/devplay/billing/galaxystore/GalaxyStoreSubscriptionOption;
    .locals 1

    const/4 v0, 0x0

    return-object v0
.end method

.method public getGooglePlaySubscriptionOptions()Ljava/util/List;
    .locals 1

    invoke-static {}, Ljava/util/Collections;->emptyList()Ljava/util/List;

    move-result-object v0

    return-object v0
.end method

.method public getIsoCurrencyCode()Ljava/lang/String;
    .locals 1

    const-string v0, "KRW"

    return-object v0
.end method

.method public getOnestoreSubscriptionOption()Lcom/devplay/billing/onestore/OnestoreSubscriptionOption;
    .locals 1

    const/4 v0, 0x0

    return-object v0
.end method

.method public getPrice()J
    .locals 2

    const-wide/16 v0, 0x0

    return-wide v0
.end method

.method public getPriceString()Ljava/lang/String;
    .locals 1

    const-string v0, "0"

    return-object v0
.end method

.method public getProductId()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/devplay/billing/FreeProduct;->productId:Ljava/lang/String;

    return-object v0
.end method

.method public getProductType()Lcom/devplay/billing/ProductType;
    .locals 1

    iget-object v0, p0, Lcom/devplay/billing/FreeProduct;->productType:Lcom/devplay/billing/ProductType;

    return-object v0
.end method

.method public getProductTypeInt()I
    .locals 1

    iget v0, p0, Lcom/devplay/billing/FreeProduct;->productTypeInt:I

    return v0
.end method
