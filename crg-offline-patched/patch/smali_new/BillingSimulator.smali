.class public final Lcom/devplay/billing/BillingSimulator;
.super Ljava/lang/Object;
.source "crg-offline-patch"


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method

.method public static buildProducts(Ljava/util/List;)Ljava/util/List;
    .locals 7

    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    if-eqz p0, :done

    invoke-interface {p0}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object v1

    :loop
    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z

    move-result v2

    if-eqz v2, :done

    invoke-interface {v1}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Lcom/devplay/billing/ProductConfiguration;

    if-eqz v2, :next

    invoke-virtual {v2}, Lcom/devplay/billing/ProductConfiguration;->getProductId()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v2}, Lcom/devplay/billing/ProductConfiguration;->getProductType()Lcom/devplay/billing/ProductType;

    move-result-object v4

    if-nez v4, :type_ok

    sget-object v4, Lcom/devplay/billing/ProductType;->None:Lcom/devplay/billing/ProductType;

    :type_ok
    invoke-virtual {v2}, Lcom/devplay/billing/ProductConfiguration;->getProductTypeInt()I

    move-result v5

    new-instance v6, Lcom/devplay/billing/FreeProduct;

    invoke-direct {v6, v3, v4, v5}, Lcom/devplay/billing/FreeProduct;-><init>(Ljava/lang/String;Lcom/devplay/billing/ProductType;I)V

    invoke-virtual {v0, v6}, Ljava/util/ArrayList;->add(Ljava/lang/Object;)Z

    :next
    goto :loop

    :done
    return-object v0
.end method

.method public static buildPurchase(Ljava/lang/String;)Lcom/devplay/billing/FreePurchase;
    .locals 3

    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v0

    new-instance v2, Lcom/devplay/billing/FreePurchase;

    invoke-direct {v2, p0, v0, v1}, Lcom/devplay/billing/FreePurchase;-><init>(Ljava/lang/String;J)V

    return-object v2
.end method

.method public static productIdOf(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    if-nez p0, :use_p0

    return-object p1

    :use_p0
    return-object p0
.end method
