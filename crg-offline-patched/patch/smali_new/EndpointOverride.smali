.class public final Lcom/devplay/core/EndpointOverride;
.super Ljava/lang/Object;
.source "crg-offline-patch"


# static fields
# Empty value = keep the original endpoint. Set a value to redirect the
# devplay gateway / internal API to your own server, then rebuild.
.field public static final GATEWAY:Ljava/lang/String;

.field public static final INTERNAL:Ljava/lang/String;


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method

.method static constructor <clinit>()V
    .locals 1

    const-string v0, ""

    sput-object v0, Lcom/devplay/core/EndpointOverride;->GATEWAY:Ljava/lang/String;

    const-string v0, ""

    sput-object v0, Lcom/devplay/core/EndpointOverride;->INTERNAL:Ljava/lang/String;

    return-void
.end method

.method public static gateway(Ljava/lang/String;)Ljava/lang/String;
    .locals 2

    sget-object v0, Lcom/devplay/core/EndpointOverride;->GATEWAY:Ljava/lang/String;

    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z

    move-result v1

    if-nez v1, :keep

    return-object v0

    :keep
    return-object p0
.end method

.method public static internal(Ljava/lang/String;)Ljava/lang/String;
    .locals 2

    sget-object v0, Lcom/devplay/core/EndpointOverride;->INTERNAL:Ljava/lang/String;

    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z

    move-result v1

    if-nez v1, :keep

    return-object v0

    :keep
    return-object p0
.end method
